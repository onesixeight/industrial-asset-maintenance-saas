import { describe, expect, it } from "vitest";
import Redis from "ioredis";
import { RedisService } from "./redis.service";

const URL = "redis://localhost:6379";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const config = (url: string | undefined): any =>
  ({ get: (k: string) => (k === "REDIS_URL" ? url : undefined) }) as any;
const env = { REDIS_URL: URL } as never;

describe("RedisService", () => {
  it("constructs an ioredis client from ConfigService URL", () => {
    const svc = new RedisService(config(URL), env);
    expect(svc.client).toBeInstanceOf(Redis);
    expect(typeof svc.onModuleDestroy).toBe("function");
    svc.client.disconnect();
  });

  it("falls back to VALIDATED_ENV.REDIS_URL when ConfigService has none", () => {
    const svc = new RedisService(config(undefined), env);
    expect(svc.client).toBeInstanceOf(Redis);
    svc.client.disconnect();
  });

  it("round-trips a key against the live Redis", async () => {
    const svc = new RedisService(config(URL), env);
    await svc.client.set("iam:test:ping", "pong", "EX", 5);
    const val = await svc.client.get("iam:test:ping");
    expect(val).toBe("pong");
    await svc.client.del("iam:test:ping");
    svc.client.disconnect();
  });
});
