import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type { JwtPayload, UserRole } from "@iam/shared";
import { RedisService } from "../redis";
import { VALIDATED_ENV, type Env } from "../config";

const DENYLIST_PREFIX = "auth:denylist:";

/**
 * Issues access/refresh JWTs and maintains a Redis denylist of revoked jtis.
 *
 * - access token: short-lived (JWT_ACCESS_TTL, default 15m)
 * - refresh token: long-lived (JWT_REFRESH_TTL, default 7d)
 *
 * On logout/refresh-rotation the refresh jti is added to the denylist with a
 * TTL matching the token's remaining lifetime, so the entry auto-expires.
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
    this.refreshTtl = config.get<string>("JWT_REFRESH_TTL") ?? env.JWT_REFRESH_TTL;
  }

  /** Issue an access/refresh token pair for the given principal. */
  async issuePair(args: {
    userId: string;
    companyId: string;
    role: UserRole;
  }): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const base = {
      sub: args.userId,
      companyId: args.companyId,
      role: args.role,
    };
    const accessToken = await this.jwt.signAsync(
      { ...base, jti: randomUUID(), typ: "access" },
      { expiresIn: this.accessTtl as unknown as number },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...base, jti: randomUUID(), typ: "refresh" },
      { expiresIn: this.refreshTtl as unknown as number },
    );
    return { accessToken, refreshToken, expiresIn: this.ttlToSeconds(this.accessTtl) };
  }

  /**
   * Verify a token's signature + claims. Returns null if invalid, has the
   * wrong type, or — for refresh tokens only — its jti is on the Redis
   * denylist. Access tokens are verified statelessly (spec §4: an access
   * denylist would negate statelessness; their short TTL is the accepted
   * exposure window).
   */
  async verify(token: string, typ: "access" | "refresh"): Promise<JwtPayload | null> {
    let payload: JwtPayload;
    try {
      payload = (await this.jwt.verifyAsync<JwtPayload>(token)) as JwtPayload;
    } catch {
      return null;
    }
    if (payload.typ !== typ) return null;
    if (typ === "refresh" && (await this.isRevoked(payload.jti))) return null;
    return payload;
  }

  /** Add a jti to the denylist until the token's expiry. */
  async revoke(payload: JwtPayload): Promise<void> {
    const exp = payload.exp ?? 0;
    const now = Math.floor(Date.now() / 1000);
    const ttl = Math.max(0, exp - now);
    if (ttl <= 0) return; // already expired, nothing to store
    await this.redis.client.set(DENYLIST_PREFIX + payload.jti, "1", "EX", ttl);
  }

  async isRevoked(jti: string): Promise<boolean> {
    const v = await this.redis.client.get(DENYLIST_PREFIX + jti);
    return v != null;
  }

  /** Convert a humantime TTL ("15m", "7d") to seconds. */
  private ttlToSeconds(ttl: string): number {
    const m = /^(\d+)\s*([smhd])$/.exec(ttl.trim());
    if (!m) return 900;
    const n = Number(m[1]);
    const unit = m[2];
    const mult = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
    return n * mult;
  }
}
