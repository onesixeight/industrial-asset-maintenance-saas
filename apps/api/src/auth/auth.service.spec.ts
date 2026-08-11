import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { Test } from "@nestjs/testing";
import type { Response } from "express";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { JwtPayload } from "@iam/shared";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";
import { PrismaService } from "../prisma";
import { RedisService } from "../redis";
import { UsersService } from "../users/users.service";
import { getTestEnvironment } from "../../test/environment";
import {
  teardown as teardownTestDatabase,
  truncate as truncateTestDatabase,
} from "../../test/db";
import Redis from "ioredis";

const SECRET = "test-secret-at-least-32-characters-long";
const TEST_ENVIRONMENT = getTestEnvironment(process.env);
const DB_URL = TEST_ENVIRONMENT.databaseUrl;
const REDIS_URL = TEST_ENVIRONMENT.redisUrl;

function makeEnv() {
  return {
    NODE_ENV: "test" as const,
    PORT: 4000,
    TRUST_PROXY_HOPS: 0,
    DATABASE_URL: DB_URL,
    REDIS_URL,
    JWT_SECRET: SECRET,
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL: "7d",
    CORS_ORIGIN: "*",
    PUBLIC_SCAN_BASE: "http://localhost:3000",
  };
}

let prisma: PrismaService;
let redis: Redis;
let jwt: JwtService;
let svc: AuthService;
const focusedTaskOneRun = process.env.TASK1_FOCUSED === "1";

beforeAll(async () => {
  if (focusedTaskOneRun) return;
  const env = makeEnv();
  const config = {
    get: (k: string) =>
      k.startsWith("JWT") ? env[k as keyof typeof env] : undefined,
  } as unknown as ConfigService;
  prisma = new PrismaService(config, env);
  redis = new Redis(REDIS_URL);
  const moduleRef = await Test.createTestingModule({
    imports: [
      JwtModule.register({ secret: SECRET, signOptions: { expiresIn: "15m" } }),
    ],
  }).compile();
  jwt = moduleRef.get(JwtService);
  const tokenSvc = new TokenService(jwt, config, env, {
    client: redis,
  } as unknown as RedisService);
  svc = new AuthService(prisma, tokenSvc);
});

afterAll(async () => {
  if (focusedTaskOneRun) return;
  await prisma?.$disconnect();
  await teardownTestDatabase();
  redis?.disconnect();
});

const OTHER_COMPANY_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(async () => {
  if (focusedTaskOneRun) return;
  // Clear token-level and family-level revocation state for isolation.
  const keys = [
    ...(await redis.keys("auth:denylist:*")),
    ...(await redis.keys("auth:family:*")),
  ];
  if (keys.length) await redis.del(...keys);
  await truncateTestDatabase();
});

describe("AuthController public response contract", () => {
  it("does not expose refreshToken in login JSON", async () => {
    const auth = {
      login: vi.fn().mockResolvedValue({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresIn: 900,
        user: {
          id: "11111111-1111-1111-1111-111111111111",
          email: "alice@acme.test",
          firstName: "Alice",
          lastName: "Admin",
          role: "admin",
          companyId: "22222222-2222-2222-2222-222222222222",
          mustChangePassword: false,
        },
      }),
    } as unknown as AuthService;
    const cookie = vi.fn();
    const controller = new AuthController(auth);

    const response = await controller.login(
      { email: "alice@acme.test", password: "Password1" },
      { cookie } as unknown as Response,
    );

    expect(response).not.toHaveProperty("refreshToken");
    expect(cookie).toHaveBeenCalledWith(
      "refresh_token",
      "refresh-token",
      expect.objectContaining({ httpOnly: true }),
    );
  });
});

describe("AuthService session revocation", () => {
  const payload = {
    sub: "11111111-1111-1111-1111-111111111111",
    companyId: "22222222-2222-2222-2222-222222222222",
    role: "admin" as const,
    ver: 0,
    sid: "44444444-4444-4444-8444-444444444444",
    jti: "33333333-3333-3333-3333-333333333333",
    typ: "refresh" as const,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  function currentUser(sessionVersion = 0) {
    return {
      id: payload.sub,
      email: "alice@acme.test",
      password: "unused",
      firstName: "Alice",
      lastName: "Admin",
      role: "admin" as const,
      companyId: payload.companyId,
      mustChangePassword: false,
      sessionVersion,
    };
  }

  function makeRefreshPrisma(
    loadUser: () => Promise<ReturnType<typeof currentUser> | null>,
  ): PrismaService {
    const transactionClient = {
      $queryRaw: vi.fn().mockImplementation(async () => {
        const user = await loadUser();
        return user ? [user] : [];
      }),
    };
    return {
      getClient: () => ({
        async $transaction<T>(
          operation: (tx: typeof transactionClient) => Promise<T>,
        ): Promise<T> {
          return operation(transactionClient);
        },
      }),
    } as unknown as PrismaService;
  }

  it("rejects refresh after the user session version changes", async () => {
    const prismaStub = makeRefreshPrisma(async () => currentUser(1));
    const tokenStub = {
      verifyForRefreshRotation: vi.fn().mockResolvedValue(payload),
      claimRefresh: vi.fn().mockResolvedValue(true),
      revoke: vi.fn().mockResolvedValue(undefined),
      issuePair: vi.fn().mockResolvedValue({
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expiresIn: 900,
      }),
    } as unknown as TokenService;
    const service = new AuthService(prismaStub, tokenStub);

    await expect(service.refresh("stale-refresh")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("keeps a refresh token usable when identity lookup fails transiently", async () => {
    const transient = new Error("temporary database failure");
    let lookups = 0;
    let claimed = false;
    const prismaStub = makeRefreshPrisma(async () => {
      lookups += 1;
      if (lookups === 1) throw transient;
      return currentUser();
    });
    const tokenStub = {
      verifyForRefreshRotation: vi.fn().mockResolvedValue(payload),
      claimRefresh: vi.fn().mockImplementation(async () => {
        if (claimed) return false;
        claimed = true;
        return true;
      }),
      issuePair: vi.fn().mockResolvedValue({
        accessToken: "retry-access",
        refreshToken: "retry-refresh",
        expiresIn: 900,
      }),
    } as unknown as TokenService;
    const service = new AuthService(prismaStub, tokenStub);

    await expect(service.refresh("retryable-refresh")).rejects.toBe(transient);
    await expect(service.refresh("retryable-refresh")).resolves.toMatchObject({
      accessToken: "retry-access",
    });
  });

  it("does not consume a refresh token whose identity is stale", async () => {
    let sessionVersion = 1;
    let claimed = false;
    const prismaStub = makeRefreshPrisma(async () =>
      currentUser(sessionVersion),
    );
    const tokenStub = {
      verifyForRefreshRotation: vi.fn().mockResolvedValue(payload),
      claimRefresh: vi.fn().mockImplementation(async () => {
        if (claimed) return false;
        claimed = true;
        return true;
      }),
      issuePair: vi.fn().mockResolvedValue({
        accessToken: "restored-access",
        refreshToken: "restored-refresh",
        expiresIn: 900,
      }),
    } as unknown as TokenService;
    const service = new AuthService(prismaStub, tokenStub);

    await expect(service.refresh("stale-refresh")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    sessionVersion = payload.ver;
    await expect(service.refresh("stale-refresh")).resolves.toMatchObject({
      accessToken: "restored-access",
    });
  });

  it("allows exactly one concurrent refresh-token rotation", async () => {
    let claimed = false;
    const prismaStub = makeRefreshPrisma(async () => currentUser());
    const tokenStub = {
      verifyForRefreshRotation: vi.fn().mockResolvedValue(payload),
      claimRefresh: vi.fn().mockImplementation(async () => {
        await Promise.resolve();
        if (claimed) return false;
        claimed = true;
        return true;
      }),
      revoke: vi.fn().mockResolvedValue(undefined),
      issuePair: vi.fn().mockImplementation(async () => ({
        accessToken: `new-access-${crypto.randomUUID()}`,
        refreshToken: `new-refresh-${crypto.randomUUID()}`,
        expiresIn: 900,
      })),
    } as unknown as TokenService;
    const service = new AuthService(prismaStub, tokenStub);

    const results = await Promise.allSettled([
      service.refresh("same-refresh"),
      service.refresh("same-refresh"),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });

  it("increments the session version when the password changes", async () => {
    let user = {
      ...currentUser(),
      password: await bcrypt.hash("TempPass1", 4),
      mustChangePassword: true,
    };
    const prismaStub = {
      getClient: () => ({
        user: {
          findUnique: vi.fn().mockImplementation(async () => user),
          update: vi.fn().mockImplementation(
            async (args: {
              data: {
                password: string;
                mustChangePassword: boolean;
                sessionVersion?: { increment: number };
              };
            }) => {
              user = {
                ...user,
                password: args.data.password,
                mustChangePassword: args.data.mustChangePassword,
                sessionVersion:
                  user.sessionVersion +
                  (args.data.sessionVersion?.increment ?? 0),
              };
              return user;
            },
          ),
        },
      }),
    } as unknown as PrismaService;
    const tokenStub = {
      issuePair: vi
        .fn()
        .mockImplementation(async (args: { sessionVersion: number }) => ({
          accessToken: `access-v${args.sessionVersion}`,
          refreshToken: `refresh-v${args.sessionVersion}`,
          expiresIn: 900,
        })),
    } as unknown as TokenService;
    const service = new AuthService(prismaStub, tokenStub);

    const response = await service.changePassword({
      email: user.email,
      currentPassword: "TempPass1",
      newPassword: "NewPassword2",
    });

    expect(response.refreshToken).toBe("refresh-v1");
    expect(user.sessionVersion).toBe(1);
  });
});

describe("AuthService and UsersService revocation sequence", () => {
  async function makeHarness() {
    let user = {
      id: "11111111-1111-1111-1111-111111111111",
      email: "sequence@acme.test",
      password: await bcrypt.hash("Password1", 4),
      firstName: "Sequence",
      lastName: "User",
      role: "admin" as "admin" | "manager" | "technician" | "viewer",
      companyId: "22222222-2222-2222-2222-222222222222",
      mustChangePassword: false,
      sessionVersion: 0,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    type UpdateData = {
      password?: string;
      mustChangePassword?: boolean;
      role?: typeof user.role;
      sessionVersion?: { increment: number };
    };
    const userDelegate = {
      findUnique: async (args: { where: { id?: string; email?: string } }) =>
        args.where.id === user.id || args.where.email === user.email
          ? user
          : null,
      findFirst: async (args: { where: { id: string; companyId: string } }) =>
        args.where.id === user.id && args.where.companyId === user.companyId
          ? user
          : null,
      update: async (args: { data: UpdateData }) => {
        user = {
          ...user,
          ...(args.data.password === undefined
            ? {}
            : { password: args.data.password }),
          ...(args.data.mustChangePassword === undefined
            ? {}
            : { mustChangePassword: args.data.mustChangePassword }),
          ...(args.data.role === undefined ? {} : { role: args.data.role }),
          sessionVersion:
            user.sessionVersion + (args.data.sessionVersion?.increment ?? 0),
        };
        return user;
      },
    };
    const transactionClient = {
      $queryRaw: async () => [user],
    };
    const prismaStub = {
      getClient: () => ({
        user: userDelegate,
        async $transaction<T>(
          operation: (tx: typeof transactionClient) => Promise<T>,
        ): Promise<T> {
          return operation(transactionClient);
        },
      }),
    } as unknown as PrismaService;
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET })],
    }).compile();
    const sequenceRedis = new Redis(REDIS_URL);
    await sequenceRedis.flushdb();
    const config = { get: () => undefined } as unknown as ConfigService;
    const tokenService = new TokenService(
      moduleRef.get(JwtService),
      config,
      makeEnv(),
      { client: sequenceRedis } as unknown as RedisService,
    );

    return {
      auth: new AuthService(prismaStub, tokenService),
      users: new UsersService(prismaStub),
      user: () => user,
      close: async () => sequenceRedis.quit(),
    };
  }

  it("rejects an old refresh token after the user's role changes", async () => {
    const harness = await makeHarness();
    try {
      const oldSession = await harness.auth.login({
        email: harness.user().email,
        password: "Password1",
      });

      await harness.users.changeRole(harness.user().id, "viewer", {
        sub: "99999999-9999-4999-8999-999999999999",
        companyId: harness.user().companyId,
      });

      await expect(
        harness.auth.refresh(oldSession.refreshToken),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    } finally {
      await harness.close();
    }
  });

  it("rotates a legitimate refresh token exactly once", async () => {
    const harness = await makeHarness();
    try {
      const original = await harness.auth.login({
        email: harness.user().email,
        password: "Password1",
      });

      const rotated = await harness.auth.refresh(original.refreshToken);

      expect(rotated.refreshToken).not.toBe(original.refreshToken);
      await expect(
        harness.auth.refresh(original.refreshToken),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    } finally {
      await harness.close();
    }
  });

  it("rejects an old refresh token after the user's password changes", async () => {
    const harness = await makeHarness();
    try {
      const oldSession = await harness.auth.login({
        email: harness.user().email,
        password: "Password1",
      });

      await harness.auth.changePassword({
        email: harness.user().email,
        currentPassword: "Password1",
        newPassword: "NewPassword2",
      });

      await expect(
        harness.auth.refresh(oldSession.refreshToken),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    } finally {
      await harness.close();
    }
  });
});

describe("AuthService.register", () => {
  it("creates a company + first admin user and returns a token pair + user", async () => {
    const res = await svc.register({
      email: "alice@acme.test",
      password: "Password1",
      firstName: "Alice",
      lastName: "Smith",
      company: "Acme Industrial",
    });
    expect(res.accessToken.split(".").length).toBe(3);
    expect(res.refreshToken.split(".").length).toBe(3);
    expect(res.user.email).toBe("alice@acme.test");
    expect(res.user.role).toBe("admin"); // first user is admin (spec §3.2)
    expect(res.user.companyId).toBeTruthy();

    const db = await prisma.getClient().user.findUnique({
      where: { email: "alice@acme.test" },
      include: { company: true },
    });
    expect(db).toBeTruthy();
    expect(db!.password).not.toBe("Password1");
    expect(db!.role).toBe("admin");
    // Company created transactionally alongside the user.
    expect(db!.company.name).toBe("Acme Industrial");
  });

  it("rejects duplicate email with ConflictException", async () => {
    await svc.register({
      email: "bob@acme.test",
      password: "Password1",
      firstName: "Bob",
      lastName: "B",
      company: "Bob Co",
    });
    await expect(
      svc.register({
        email: "bob@acme.test",
        password: "Password2",
        firstName: "X",
        lastName: "Y",
        company: "Other Co",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("AuthService.login", () => {
  beforeEach(async () => {
    await svc.register({
      email: "carol@acme.test",
      password: "Password1",
      firstName: "Carol",
      lastName: "C",
      company: "Carol Co",
    });
  });

  it("returns a token pair + user on valid credentials", async () => {
    const res = await svc.login({
      email: "carol@acme.test",
      password: "Password1",
    });
    expect(res.accessToken).toBeTruthy();
    expect(res.refreshToken).toBeTruthy();
    expect(res.user.email).toBe("carol@acme.test");
  });

  it("throws UnauthorizedException on wrong password", async () => {
    await expect(
      svc.login({ email: "carol@acme.test", password: "wrong" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("throws UnauthorizedException on unknown email", async () => {
    await expect(
      svc.login({ email: "nope@acme.test", password: "Password1" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe("AuthService.refresh", () => {
  it("rotates: old refresh revoked, new pair issued", async () => {
    const res = await svc.register({
      email: "dave@acme.test",
      password: "Password1",
      firstName: "Dave",
      lastName: "D",
      company: "Dave Co",
    });
    const newPair = await svc.refresh(res.refreshToken);
    expect(newPair.accessToken).not.toBe(res.accessToken);
    expect(newPair.refreshToken).not.toBe(res.refreshToken);
    // Old refresh now revoked.
    await expect(svc.refresh(res.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("serializes refresh issuance before a concurrent role mutation", async () => {
    const res = await svc.register({
      email: "refresh-lock@acme.test",
      password: "Password1",
      firstName: "Refresh",
      lastName: "Lock",
      company: "Refresh Lock Co",
    });
    const tokenService = (svc as unknown as { tokens: TokenService }).tokens;
    const originalClaim = tokenService.claimRefresh.bind(tokenService);
    let releaseClaim!: () => void;
    const claimGate = new Promise<void>((resolve) => {
      releaseClaim = resolve;
    });
    let claimStarted!: () => void;
    const claimStartedPromise = new Promise<void>((resolve) => {
      claimStarted = resolve;
    });
    const claimSpy = vi
      .spyOn(tokenService, "claimRefresh")
      .mockImplementation(async (payload) => {
        claimStarted();
        await claimGate;
        return originalClaim(payload);
      });

    const refreshPromise = svc.refresh(res.refreshToken);
    await claimStartedPromise;

    let mutationSettled = false;
    const mutationPromise = prisma
      .getClient()
      .user.update({
        where: { id: res.user.id },
        data: { role: "viewer", sessionVersion: { increment: 1 } },
      })
      .then((updated) => {
        mutationSettled = true;
        return updated;
      });

    await new Promise<void>((resolve) => setTimeout(resolve, 75));
    const mutationSettledBeforeRefresh = mutationSettled;
    releaseClaim();

    try {
      const pair = await refreshPromise;
      await mutationPromise;
      expect(mutationSettledBeforeRefresh).toBe(false);
      await expect(svc.refresh(pair.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    } finally {
      releaseClaim();
      claimSpy.mockRestore();
    }
  });

  it("rejects an access token used as refresh", async () => {
    const res = await svc.register({
      email: "eve@acme.test",
      password: "Password1",
      firstName: "Eve",
      lastName: "E",
      company: "Eve Co",
    });
    await expect(svc.refresh(res.accessToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe("AuthService.logout + me", () => {
  it("logout revokes the refresh; me returns the user", async () => {
    const res = await svc.register({
      email: "frank@acme.test",
      password: "Password1",
      firstName: "Frank",
      lastName: "F",
      company: "Frank Co",
    });
    // me via payload from the access token
    const tokenSvc = (
      svc as unknown as {
        tokens: {
          verify: (
            t: string,
            typ: "access" | "refresh",
          ) => Promise<JwtPayload | null>;
        };
      }
    ).tokens;
    const payload = (await tokenSvc.verify(res.accessToken, "access"))!;
    const me = await svc.me(payload);
    expect(me.email).toBe("frank@acme.test");
    expect(me.companyId).toBe(res.user.companyId);

    await svc.logout(res.refreshToken);
    await expect(svc.refresh(res.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("logout is idempotent for an invalid token", async () => {
    await expect(svc.logout("garbage")).resolves.toBeUndefined();
  });
});

describe("AuthService.register duplicate-email race (P2002 → 409)", () => {
  // The pre-check findUnique is a fast-path; the unique constraint is the
  // source of truth. If a concurrent registration wins the race, the tx
  // throws Prisma P2002 — register must surface that as 409, not 500.
  it("maps a Prisma P2002 from the transaction to ConflictException", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("unique", {
      code: "P2002",
      clientVersion: "7.8.0",
    });
    const fakePrisma = {
      getClient: () => ({
        user: {
          // Pre-check finds nothing (the race: the other tx hasn't committed).
          findUnique: async () => null,
        },
        $transaction: async () => {
          throw p2002;
        },
      }),
    } as unknown as PrismaService;
    const raceSvc = new AuthService(fakePrisma, svc["tokens"]);
    await expect(
      raceSvc.register({
        email: "race@acme.test",
        password: "Password1",
        firstName: "R",
        lastName: "Ace",
        company: "Race Co",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("AuthService.login force-change gate", () => {
  it("rejects a must-change-password user with ForbiddenException (no tokens)", async () => {
    // Register an admin (mustChangePassword=false by default), then flip a
    // second user's flag via direct prisma seeding.
    const reg = await svc.register({
      email: "gate@acme.test",
      password: "Password1",
      firstName: "Gate",
      lastName: "User",
      company: "Gate Co",
    });
    const password = await bcrypt.hash("TempPass1", 12);
    await prisma.getClient().user.create({
      data: {
        email: "newhire@acme.test",
        password,
        firstName: "New",
        lastName: "Hire",
        role: "viewer",
        mustChangePassword: true,
        companyId: reg.user.companyId,
      },
    });
    await expect(
      svc.login({ email: "newhire@acme.test", password: "TempPass1" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("AuthService.changePassword", () => {
  it("verifies current password, clears the flag, and returns an AuthResponse", async () => {
    const reg = await svc.register({
      email: "cp@acme.test",
      password: "Password1",
      firstName: "CP",
      lastName: "Admin",
      company: "CP Co",
    });
    const password = await bcrypt.hash("TempPass1", 12);
    await prisma.getClient().user.create({
      data: {
        email: "cpuser@acme.test",
        password,
        firstName: "CP",
        lastName: "User",
        role: "viewer",
        mustChangePassword: true,
        companyId: reg.user.companyId,
      },
    });

    const res = await svc.changePassword({
      email: "cpuser@acme.test",
      currentPassword: "TempPass1",
      newPassword: "NewPass1",
    });
    expect(res.accessToken).toBeTruthy();
    expect(res.user.mustChangePassword).toBe(false);

    // Flag persisted cleared: a normal login now succeeds.
    const login = await svc.login({
      email: "cpuser@acme.test",
      password: "NewPass1",
    });
    expect(login.accessToken).toBeTruthy();
  });

  it("rejects with UnauthorizedException on wrong current password", async () => {
    const reg = await svc.register({
      email: "cpw@acme.test",
      password: "Password1",
      firstName: "C",
      lastName: "W",
      company: "CPW Co",
    });
    const password = await bcrypt.hash("TempPass1", 12);
    await prisma.getClient().user.create({
      data: {
        email: "cpwuser@acme.test",
        password,
        firstName: "C",
        lastName: "W",
        role: "viewer",
        mustChangePassword: true,
        companyId: reg.user.companyId,
      },
    });
    await expect(
      svc.changePassword({
        email: "cpwuser@acme.test",
        currentPassword: "WrongCurrent1",
        newPassword: "NewPass1",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects with UnauthorizedException on unknown email (no enumeration)", async () => {
    await expect(
      svc.changePassword({
        email: "nobody@acme.test",
        currentPassword: "TempPass1",
        newPassword: "NewPass1",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

// Unused but kept to satisfy the OTHER_COMPANY_ID cross-company guard test
// that Phase 2 will add; referenced here to avoid unused-var lint.
void OTHER_COMPANY_ID;
