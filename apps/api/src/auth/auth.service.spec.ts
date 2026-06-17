import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { JwtPayload } from "@iam/shared";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";
import { PrismaService } from "../prisma";
import { RedisService } from "../redis";
import { VALIDATED_ENV } from "../config";
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

const COMPANY_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_COMPANY_ID = "22222222-2222-2222-2222-222222222222";

async function seedCompany() {
  await prisma.getClient().company.create({
    data: { id: COMPANY_ID, name: "Acme" },
  });
}

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
  await seedCompany();
});

describe("AuthService.register", () => {
  it("creates a user and returns a token pair", async () => {
    const pair = await svc.register({
      email: "alice@acme.test",
      password: "Password1",
      firstName: "Alice",
      lastName: "Smith",
      companyId: COMPANY_ID,
    });
    expect(pair.accessToken.split(".").length).toBe(3);
    expect(pair.refreshToken.split(".").length).toBe(3);

    const db = await prisma.getClient().user.findUnique({
      where: { email: "alice@acme.test" },
    });
    expect(db).toBeTruthy();
    expect(db!.password).not.toBe("Password1");
    expect(db!.role).toBe("viewer"); // schema default (admin provisioning is separate)
  });

  it("rejects duplicate email with ConflictException", async () => {
    await svc.register({
      email: "bob@acme.test",
      password: "Password1",
      firstName: "Bob",
      lastName: "B",
      companyId: COMPANY_ID,
    });
    await expect(
      svc.register({
        email: "bob@acme.test",
        password: "Password2",
        firstName: "X",
        lastName: "Y",
        companyId: COMPANY_ID,
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
      companyId: COMPANY_ID,
    });
  });

  it("returns a token pair on valid credentials", async () => {
    const pair = await svc.login({ email: "carol@acme.test", password: "Password1" });
    expect(pair.accessToken).toBeTruthy();
    expect(pair.refreshToken).toBeTruthy();
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
    const pair = await svc.register({
      email: "dave@acme.test",
      password: "Password1",
      firstName: "Dave",
      lastName: "D",
      companyId: COMPANY_ID,
    });
    const newPair = await svc.refresh(pair.refreshToken);
    expect(newPair.accessToken).not.toBe(pair.accessToken);
    expect(newPair.refreshToken).not.toBe(pair.refreshToken);
    // Old refresh now revoked.
    await expect(svc.refresh(pair.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects an access token used as refresh", async () => {
    const pair = await svc.register({
      email: "eve@acme.test",
      password: "Password1",
      firstName: "Eve",
      lastName: "E",
      companyId: COMPANY_ID,
    });
    await expect(svc.refresh(pair.accessToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe("AuthService.logout + me", () => {
  it("logout revokes the refresh; me returns the user", async () => {
    const pair = await svc.register({
      email: "frank@acme.test",
      password: "Password1",
      firstName: "Frank",
      lastName: "F",
      companyId: COMPANY_ID,
    });
    // me via payload from the access token
    const tokenSvc = (svc as unknown as { tokens: { verify: (t: string, typ: "access" | "refresh") => Promise<JwtPayload | null> } }).tokens;
    const payload = (await tokenSvc.verify(pair.accessToken, "access"))!;
    const me = await svc.me(payload);
    expect(me.email).toBe("frank@acme.test");
    expect(me.companyId).toBe(COMPANY_ID);

    await svc.logout(pair.refreshToken);
    await expect(svc.refresh(pair.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("logout is idempotent for an invalid token", async () => {
    await expect(svc.logout("garbage")).resolves.toBeUndefined();
  });
});

// Unused but kept to satisfy the OTHER_COMPANY_ID cross-company guard test
// that Phase 2 will add; referenced here to avoid unused-var lint.
void OTHER_COMPANY_ID;
