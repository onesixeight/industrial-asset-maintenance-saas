import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import {
  jwtPayloadSchema,
  type JwtPayload,
  type TokenResponse,
  type UserRole,
} from "@iam/shared";
import { RedisService } from "../redis";
import { VALIDATED_ENV, type Env } from "../config";

const DENYLIST_PREFIX = "auth:denylist:";
const FAMILY_DENYLIST_PREFIX = "auth:family:";
export const JWT_ALGORITHM = "HS256" as const;
export const JWT_ISSUER = "industrial-asset-maintenance-api";
export const JWT_AUDIENCE = "industrial-asset-maintenance-web";

const CLAIM_REFRESH_SCRIPT = `
if redis.call("EXISTS", KEYS[2]) == 1 then
  return 0
end
local claimed = redis.call("SET", KEYS[1], "1", "EX", ARGV[1], "NX")
if claimed then
  return 1
end
redis.call("SET", KEYS[2], "1", "EX", ARGV[2])
return 0
`;

/** Internal token pair; refreshToken is delivered only through httpOnly cookies. */
export type IssuedTokenPair = TokenResponse & { refreshToken: string };

/**
 * Issues access/refresh JWTs and maintains Redis revocation state for both
 * individual token ids and refresh-token families.
 *
 * - access token: short-lived (JWT_ACCESS_TTL, default 15m)
 * - refresh token: long-lived (JWT_REFRESH_TTL, default 7d)
 *
 * A successful rotation consumes one jti. Reuse atomically revokes its whole
 * family for the maximum refresh lifetime, so a stolen successor cannot keep
 * extending the session. Logout also revokes the whole family.
 */
@Injectable()
export class TokenService {
  private readonly accessTtl: string;
  private readonly refreshTtl: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
    @Inject(VALIDATED_ENV) env: Env,
    private readonly redis: RedisService,
  ) {
    this.accessTtl = config.get<string>("JWT_ACCESS_TTL") ?? env.JWT_ACCESS_TTL;
    this.refreshTtl =
      config.get<string>("JWT_REFRESH_TTL") ?? env.JWT_REFRESH_TTL;
  }

  /** Issue an access/refresh token pair for the given principal. */
  async issuePair(
    args: {
      userId: string;
      companyId: string;
      role: UserRole;
      sessionVersion: number;
    },
    familyId: string = randomUUID(),
  ): Promise<IssuedTokenPair> {
    const base = {
      sub: args.userId,
      companyId: args.companyId,
      role: args.role,
      ver: args.sessionVersion,
      sid: familyId,
    };
    const accessToken = await this.jwt.signAsync(
      { ...base, jti: randomUUID(), typ: "access" },
      {
        algorithm: JWT_ALGORITHM,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        expiresIn: this.accessTtl as unknown as number,
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...base, jti: randomUUID(), typ: "refresh" },
      {
        algorithm: JWT_ALGORITHM,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        expiresIn: this.refreshTtl as unknown as number,
      },
    );
    return {
      accessToken,
      refreshToken,
      expiresIn: this.ttlToSeconds(this.accessTtl),
    };
  }

  /**
   * Verify a token's signature + claims. Returns null if invalid, has the
   * wrong type, or — for refresh tokens only — its jti or family is revoked.
   * Access tokens remain stateless; their short TTL is the accepted exposure
   * window after a refresh-family revocation.
   */
  async verify(
    token: string,
    typ: "access" | "refresh",
  ): Promise<JwtPayload | null> {
    const payload = await this.verifyAuthentic(token, typ);
    if (!payload) return null;
    if (
      typ === "refresh" &&
      ((await this.isRevoked(payload.jti)) ||
        (await this.isFamilyRevoked(payload.sid)))
    ) {
      return null;
    }
    return payload;
  }

  /**
   * Verify a refresh token before rotation. A consumed jti remains visible so
   * claimRefresh can identify a replay and atomically revoke the whole family.
   */
  async verifyForRefreshRotation(token: string): Promise<JwtPayload | null> {
    const payload = await this.verifyAuthentic(token, "refresh");
    if (!payload || (await this.isFamilyRevoked(payload.sid))) return null;
    return payload;
  }

  /**
   * Signature-and-claims verification without Redis revocation checks. Logout
   * uses this to revoke a family even when the presented jti was already used.
   */
  async verifyAuthentic(
    token: string,
    typ: "access" | "refresh",
  ): Promise<JwtPayload | null> {
    try {
      const decoded = await this.jwt.verifyAsync<Record<string, unknown>>(
        token,
        {
          algorithms: [JWT_ALGORITHM],
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
      );
      const parsed = jwtPayloadSchema.safeParse(decoded);
      if (
        !parsed.success ||
        parsed.data.typ !== typ ||
        parsed.data.exp === undefined
      ) {
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  }

  /** Atomically claim a refresh jti so only one rotation can issue successors. */
  async claimRefresh(payload: JwtPayload): Promise<boolean> {
    const ttl = this.remainingTtl(payload);
    if (ttl <= 0) return false;
    const claimed = await this.redis.client.eval(
      CLAIM_REFRESH_SCRIPT,
      2,
      DENYLIST_PREFIX + payload.jti,
      FAMILY_DENYLIST_PREFIX + payload.sid,
      ttl,
      this.refreshFamilyTtl(),
    );
    return claimed === 1;
  }

  /** Add a jti to the denylist until the token's expiry. */
  async revoke(payload: JwtPayload): Promise<void> {
    const ttl = this.remainingTtl(payload);
    if (ttl <= 0) return; // already expired, nothing to store
    await this.redis.client.set(DENYLIST_PREFIX + payload.jti, "1", "EX", ttl);
  }

  async isRevoked(jti: string): Promise<boolean> {
    const v = await this.redis.client.get(DENYLIST_PREFIX + jti);
    return v != null;
  }

  /** Revoke every current and future refresh token in a family. */
  async revokeFamily(sid: string): Promise<void> {
    await this.redis.client.set(
      FAMILY_DENYLIST_PREFIX + sid,
      "1",
      "EX",
      this.refreshFamilyTtl(),
    );
  }

  async isFamilyRevoked(sid: string): Promise<boolean> {
    const value = await this.redis.client.get(FAMILY_DENYLIST_PREFIX + sid);
    return value != null;
  }

  private remainingTtl(payload: JwtPayload): number {
    const exp = payload.exp ?? 0;
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, exp - now);
  }

  private refreshFamilyTtl(): number {
    return this.ttlToSeconds(this.refreshTtl);
  }

  /** Convert a humantime TTL ("15m", "7d") to seconds. */
  private ttlToSeconds(ttl: string): number {
    const m = /^(\d+)\s*([smhd])$/.exec(ttl.trim());
    if (!m) return 900;
    const n = Number(m[1]);
    const unit = m[2];
    const mult =
      unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
    return n * mult;
  }
}
