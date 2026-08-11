import { JwtModule } from "@nestjs/jwt";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TokenService } from "./token.service";
import { RedisService } from "../redis";
import { getTestEnvironment } from "../../test/environment";
import Redis from "ioredis";

const SECRET = "test-secret-at-least-32-characters-long";
const TEST_ENVIRONMENT = getTestEnvironment(process.env);
const URL = TEST_ENVIRONMENT.redisUrl;

function makeEnv() {
  return {
    NODE_ENV: "test" as const,
    PORT: 4000,
    TRUST_PROXY_HOPS: 0,
    DATABASE_URL: TEST_ENVIRONMENT.databaseUrl,
    REDIS_URL: URL,
    JWT_SECRET: SECRET,
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL: "7d",
    CORS_ORIGIN: "*",
    PUBLIC_SCAN_BASE: "http://localhost:3000",
  };
}

async function makeJwt(): Promise<JwtService> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      JwtModule.register({ secret: SECRET, signOptions: { expiresIn: "15m" } }),
    ],
  }).compile();
  return moduleRef.get(JwtService);
}

const PRINCIPAL = {
  userId: "12345678-1234-1234-1234-123456789012",
  companyId: "11111111-1111-1111-1114-111111111111",
  role: "viewer" as const,
  sessionVersion: 0,
};

describe("TokenService", () => {
  let svc: TokenService;
  let redis: Redis;
  let jwt: JwtService;

  beforeAll(async () => {
    jwt = await makeJwt();
    redis = new Redis(URL);
    const config = { get: () => undefined } as unknown as ConfigService;
    const env = makeEnv();
    const redisSvc = { client: redis } as unknown as RedisService;
    svc = new TokenService(jwt, config, env, redisSvc);
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  afterAll(async () => {
    await redis.quit();
  });

  it("issues a verifiable access/refresh pair", async () => {
    const pair = await svc.issuePair(PRINCIPAL);
    expect(pair.accessToken.split(".").length).toBe(3);
    expect(pair.refreshToken.split(".").length).toBe(3);
    expect(pair.expiresIn).toBe(900);

    const access = await svc.verify(pair.accessToken, "access");
    expect(access?.sub).toBe(PRINCIPAL.userId);
    expect(access?.role).toBe("viewer");
    expect(access?.ver).toBe(PRINCIPAL.sessionVersion);
    expect(access?.typ).toBe("access");
    expect(access?.sid).toMatch(/^[0-9a-f-]{36}$/);

    const refresh = await svc.verify(pair.refreshToken, "refresh");
    expect(refresh?.ver).toBe(PRINCIPAL.sessionVersion);
    expect(refresh?.typ).toBe("refresh");
    expect(refresh?.sid).toBe(access?.sid);
  });

  it("signs only for the API trust domain with HS256", async () => {
    const pair = await svc.issuePair(PRINCIPAL);
    const decoded = jwt.decode(pair.accessToken, { complete: true }) as {
      header: { alg: string };
      payload: { iss?: string; aud?: string | string[] };
    };

    expect(decoded.header.alg).toBe("HS256");
    expect(decoded.payload.iss).toBe("industrial-asset-maintenance-api");
    expect(decoded.payload.aud).toBe("industrial-asset-maintenance-web");
  });

  it("rejects signed tokens outside the algorithm, issuer, or audience boundary", async () => {
    const claims = {
      sub: PRINCIPAL.userId,
      companyId: PRINCIPAL.companyId,
      role: PRINCIPAL.role,
      ver: PRINCIPAL.sessionVersion,
      sid: "44444444-4444-4444-8444-444444444444",
      jti: "55555555-5555-4555-8555-555555555555",
      typ: "access",
    };
    const noIssuer = await jwt.signAsync(claims, {
      algorithm: "HS256",
      audience: "industrial-asset-maintenance-web",
      expiresIn: "15m",
    });
    const wrongAudience = await jwt.signAsync(claims, {
      algorithm: "HS256",
      issuer: "industrial-asset-maintenance-api",
      audience: "another-client",
      expiresIn: "15m",
    });
    const wrongAlgorithm = await jwt.signAsync(claims, {
      algorithm: "HS384",
      issuer: "industrial-asset-maintenance-api",
      audience: "industrial-asset-maintenance-web",
      expiresIn: "15m",
    });

    await expect(svc.verify(noIssuer, "access")).resolves.toBeNull();
    await expect(svc.verify(wrongAudience, "access")).resolves.toBeNull();
    await expect(svc.verify(wrongAlgorithm, "access")).resolves.toBeNull();
  });

  it("rejects a trusted-domain token with an invalid shared payload", async () => {
    const missingFamily = await jwt.signAsync(
      {
        sub: PRINCIPAL.userId,
        companyId: PRINCIPAL.companyId,
        role: PRINCIPAL.role,
        ver: PRINCIPAL.sessionVersion,
        jti: "55555555-5555-4555-8555-555555555555",
        typ: "access",
      },
      {
        algorithm: "HS256",
        issuer: "industrial-asset-maintenance-api",
        audience: "industrial-asset-maintenance-web",
        expiresIn: "15m",
      },
    );

    await expect(svc.verify(missingFamily, "access")).resolves.toBeNull();
  });

  it("rejects a trusted-domain token without an expiry", async () => {
    const signerWithoutDefaults = new JwtService({ secret: SECRET });
    const noExpiry = await signerWithoutDefaults.signAsync(
      {
        sub: PRINCIPAL.userId,
        companyId: PRINCIPAL.companyId,
        role: PRINCIPAL.role,
        ver: PRINCIPAL.sessionVersion,
        sid: "44444444-4444-4444-8444-444444444444",
        jti: "55555555-5555-4555-8555-555555555555",
        typ: "access",
      },
      {
        algorithm: "HS256",
        issuer: "industrial-asset-maintenance-api",
        audience: "industrial-asset-maintenance-web",
      },
    );

    await expect(svc.verify(noExpiry, "access")).resolves.toBeNull();
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
    await svc.revoke(payload);
    expect(await svc.verify(pair.refreshToken, "refresh")).toBeNull();
    expect(await svc.isRevoked(payload.jti)).toBe(true);
  });

  it("allows exactly one concurrent claim for the same refresh token", async () => {
    const pair = await svc.issuePair(PRINCIPAL);
    const payload = (await svc.verify(pair.refreshToken, "refresh"))!;

    const claims = await Promise.all([
      svc.claimRefresh(payload),
      svc.claimRefresh(payload),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("retains a family across rotation and revokes every successor on replay", async () => {
    const original = await svc.issuePair(PRINCIPAL);
    const originalPayload = (await svc.verifyForRefreshRotation(
      original.refreshToken,
    ))!;
    const successor = await svc.issuePair(PRINCIPAL, originalPayload.sid);
    const successorPayload = (await svc.verify(
      successor.refreshToken,
      "refresh",
    ))!;

    expect(successorPayload.sid).toBe(originalPayload.sid);
    expect(await svc.claimRefresh(originalPayload)).toBe(true);
    expect(await svc.verify(successor.refreshToken, "refresh")).not.toBeNull();

    expect(await svc.claimRefresh(originalPayload)).toBe(false);
    expect(await svc.verify(successor.refreshToken, "refresh")).toBeNull();
    expect(await svc.isFamilyRevoked(originalPayload.sid)).toBe(true);
  });

  it("revokes the family when concurrent claims collide", async () => {
    const original = await svc.issuePair(PRINCIPAL);
    const payload = (await svc.verifyForRefreshRotation(
      original.refreshToken,
    ))!;
    const successor = await svc.issuePair(PRINCIPAL, payload.sid);

    const claims = await Promise.all([
      svc.claimRefresh(payload),
      svc.claimRefresh(payload),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await svc.isFamilyRevoked(payload.sid)).toBe(true);
    expect(await svc.verify(successor.refreshToken, "refresh")).toBeNull();
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
  ver: PRINCIPAL.sessionVersion,
  sid: "44444444-4444-4444-8444-444444444444",
  jti: "22222222-2222-2222-2222-222222222222",
  typ: "refresh" as const,
  exp: Math.floor(Date.now() / 1000) - 10,
};
