import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { JwtPayload } from "@iam/shared";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";
import { PrismaService } from "../prisma";
import { RedisService } from "../redis";
import Redis from "ioredis";

const SECRET = "test-secret-at-least-16-chars";
const DB_URL = "postgresql://iam:iam@localhost:5433/iam_test?schema=public";
const REDIS_URL = "redis://localhost:6379";

function makeEnv() {
  return {
    NODE_ENV: "test" as const,
    PORT: 4000,
    DATABASE_URL: DB_URL,
    REDIS_URL,
    JWT_SECRET: SECRET,
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL: "7d",
    CORS_ORIGIN: "*",
  };
}

let prisma: PrismaService;
let redis: Redis;
let jwt: JwtService;
let svc: AuthService;

beforeAll(async () => {
  const env = makeEnv();
  const config = { get: (k: string) => (k.startsWith("JWT") ? env[k as keyof typeof env] : undefined) } as unknown as ConfigService;
  prisma = new PrismaService(config, env);
  redis = new Redis(REDIS_URL);
  const moduleRef = await Test.createTestingModule({
    imports: [JwtModule.register({ secret: SECRET, signOptions: { expiresIn: "15m" } })],
  }).compile();
  jwt = moduleRef.get(JwtService);
  const tokenSvc = new TokenService(
    jwt,
    config,
    env,
    { client: redis } as unknown as RedisService,
  );
  svc = new AuthService(prisma, tokenSvc);
});

afterAll(async () => {
  await prisma?.$disconnect();
  redis?.disconnect();
});

const OTHER_COMPANY_ID = "22222222-2222-2222-2222-222222222222";

async function truncateAll() {
  // Order matters: clear dependents first.
  const c = prisma.getClient();
  await c.notification.deleteMany();
  await c.user.deleteMany();
  await c.company.deleteMany();
}

beforeEach(async () => {
  // clear redis denylist keys for isolation
  const keys = await redis.keys("auth:denylist:*");
  if (keys.length) await redis.del(...keys);
  await truncateAll();
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
    const res = await svc.login({ email: "carol@acme.test", password: "Password1" });
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
    const tokenSvc = (svc as unknown as { tokens: { verify: (t: string, typ: "access" | "refresh") => Promise<JwtPayload | null> } }).tokens;
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

// Unused but kept to satisfy the OTHER_COMPANY_ID cross-company guard test
// that Phase 2 will add; referenced here to avoid unused-var lint.
void OTHER_COMPANY_ID;
