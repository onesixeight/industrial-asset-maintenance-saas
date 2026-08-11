import type { ThrottlerStorage } from "@nestjs/throttler";
import type Redis from "ioredis";

const KEY_PREFIX = "iam:throttle:";

const INCREMENT_SCRIPT = `
local blockTtl = redis.call("PTTL", KEYS[2])
if blockTtl > 0 then
  local existingHits = tonumber(redis.call("GET", KEYS[1]) or "0")
  local existingTtl = redis.call("PTTL", KEYS[1])
  if existingTtl < 0 then existingTtl = 0 end
  return { existingHits, existingTtl, 1, blockTtl }
end

local totalHits = redis.call("INCR", KEYS[1])
if totalHits == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end

local windowTtl = redis.call("PTTL", KEYS[1])
if totalHits > tonumber(ARGV[2]) then
  redis.call("PSETEX", KEYS[2], ARGV[3], "1")
  return { totalHits, windowTtl, 1, tonumber(ARGV[3]) }
end

return { totalHits, windowTtl, 0, 0 }
`;

function millisecondsToSeconds(value: number): number {
  return value > 0 ? Math.ceil(value / 1_000) : 0;
}

function parseResult(result: unknown): [number, number, number, number] {
  if (!Array.isArray(result) || result.length !== 4) {
    throw new Error("Invalid Redis throttler result");
  }

  const values = result.map(Number);
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("Invalid Redis throttler result");
  }

  return values as [number, number, number, number];
}

/**
 * Shared fixed-window throttler state. The Lua script makes the counter,
 * expiry and block decision one atomic Redis operation across API replicas.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    const namespace = `${KEY_PREFIX}${throttlerName}:{${key}}`;
    const rawResult = await this.redis.eval(
      INCREMENT_SCRIPT,
      2,
      `${namespace}:window`,
      `${namespace}:block`,
      String(ttl),
      String(limit),
      String(blockDuration),
    );
    const [totalHits, timeToExpire, blocked, timeToBlockExpire] =
      parseResult(rawResult);

    return {
      totalHits,
      timeToExpire: millisecondsToSeconds(timeToExpire),
      isBlocked: blocked === 1,
      timeToBlockExpire: millisecondsToSeconds(timeToBlockExpire),
    };
  }

  /** Clears this application's throttler namespace without using Redis KEYS. */
  async reset(): Promise<void> {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        "MATCH",
        `${KEY_PREFIX}*`,
        "COUNT",
        100,
      );
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      cursor = nextCursor;
    } while (cursor !== "0");
  }
}
