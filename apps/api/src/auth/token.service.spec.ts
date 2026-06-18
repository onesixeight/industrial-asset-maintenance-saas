import { JwtModule } from "@nestjs/jwt";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TokenService } from "./token.service";
import { RedisService } from "../redis";
import Redis from "ioredis";

const SECRET = "test-secret-at-least-16-chars";
const URL = "redis://localhost:6379";

function makeEnv() {
  return {
    NODE_ENV: "test" as const,
    PORT: 4000,
    DATABASE_URL: "postgresql://u:p@localhost:5432/x",
    REDIS_URL: URL,
    JWT_SECRET: SECRET,
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL: "7d",
    CORS_ORIGIN: "*",
  };
}

async function makeJwt(): Promise<JwtService> {
  const moduleRef = await Test.createTestingModule({
    imports: [JwtModule.register({ secret: SECRET, signOptions: { expiresIn: "15m" } })],
  }).compile();
  return moduleRef.get(JwtService);
}

const PRINCIPAL = {
  userId: "12345678-1234-1234-1234-123456789012",
  companyId: "11111111-1111-1111-1114-111111111111",
  role: "viewer" as const,
};

describe("TokenService", () => {
  let svc: TokenService;
  let redis: Redis;
  let denyKey: string;

  beforeEach(async () => {
    const jwt = await makeJwt();
    redis = new Redis(URL);
    const config = { get: () => undefined } as unknown as ConfigService;
    const env = makeEnv();
    const redisSvc = { client: redis } as unknown as RedisService;
    svc = new TokenService(jwt, config, env, redisSvc);
  });

  afterEach(async () => {
    if (denyKey) await redis.del(denyKey);
    redis.disconnect();
  });

  it("issues a verifiable access/refresh pair", async () => {
    const pair = await svc.issuePair(PRINCIPAL);
    expect(pair.accessToken.split(".").length).toBe(3);
    expect(pair.refreshToken.split(".").length).toBe(3);
    expect(pair.expiresIn).toBe(900);

    const access = await svc.verify(pair.accessToken, "access");
    expect(access?.sub).toBe(PRINCIPAL.userId);
    expect(access?.role).toBe("viewer");
    expect(access?.typ).toBe("access");

    const refresh = await svc.verify(pair.refreshToken, "refresh");
    expect(refresh?.typ).toBe("refresh");
  });

  it("rejects an access token when verified as refresh", async () => {
    const { accessToken } = await svc.issuePair(PRINCIPAL);
    expect(await svc.verify(accessToken, "refresh")).toBeNull();
  });

  it("rejects a tampered token", async () => {
    const { accessToken } = await svc.issuePair(PRINCIPAL);
    expect(await svc.verify(accessToken + "x", "access")).toBeNull();
  });

  it("revokes a token via the Redis denylist", async () => {
    const pair = await svc.issuePair(PRINCIPAL);
    const payload = (await svc.verify(pair.refreshToken, "refresh"))!;
    denyKey = "auth:denylist:" + payload.jti;
    await svc.revoke(payload);
    expect(await svc.verify(pair.refreshToken, "refresh")).toBeNull();
    expect(await svc.isRevoked(payload.jti)).toBe(true);
  });

  it("does not store a denylist entry for an already-expired token", async () => {
    await svc.revoke(PRINCIPAL_DATA_EXPIRED);
    // No throw, no entry.
    expect(await svc.isRevoked(PRINCIPAL_DATA_EXPIRED.jti)).toBe(false);
  });
});

const PRINCIPAL_DATA_EXPIRED = {
  sub: PRINCIPAL.userId,
  companyId: PRINCIPAL.companyId,
  role: PRINCIPAL.role,
  jti: "22222222-2222-2222-2222-222222222222",
  typ: "refresh" as const,
  exp: Math.floor(Date.now() / 1000) - 10,
};
