import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { ConfigService } from "@nestjs/config";
import { VALIDATED_ENV, type Env } from "../config";

/**
 * Thin wrapper around an ioredis client. Used by TokenService for the
 * refresh-token denylist (jti -> exp) and later for rate-limit state.
 *
 * Reads REDIS_URL from the validated environment and lazily connects.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService, @Inject(VALIDATED_ENV) env: Env) {
    const url = config.get<string>("REDIS_URL") ?? env.REDIS_URL;
    this.client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }
}
