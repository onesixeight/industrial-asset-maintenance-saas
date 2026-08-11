import type Redis from "ioredis";
import { describe, expect, it, vi } from "vitest";
import { RedisThrottlerStorage } from "./redis-throttler.storage";

function makeRedis(evalResult: unknown) {
  const evalMock = vi.fn().mockResolvedValue(evalResult);
  const scanMock = vi.fn();
  const delMock = vi.fn().mockResolvedValue(0);
  const client = {
    eval: evalMock,
    scan: scanMock,
    del: delMock,
  } as unknown as Redis;

  return { client, evalMock, scanMock, delMock };
}

describe("RedisThrottlerStorage", () => {
  it("increments a namespaced fixed window atomically and converts Redis milliseconds to seconds", async () => {
    const { client, evalMock } = makeRedis([2, 59_001, 0, 0]);
    const storage = new RedisThrottlerStorage(client);

    await expect(
      storage.increment("request-hash", 60_000, 3, 90_000, "login"),
    ).resolves.toEqual({
      totalHits: 2,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });

    const [script, keyCount, windowKey, blockKey, ttl, limit, blockDuration] =
      evalMock.mock.calls[0];
    expect(script).toContain("PSETEX");
    expect(keyCount).toBe(2);
    expect(windowKey).toBe("iam:throttle:login:{request-hash}:window");
    expect(blockKey).toBe("iam:throttle:login:{request-hash}:block");
    expect([ttl, limit, blockDuration]).toEqual(["60000", "3", "90000"]);
  });

  it("reports a blocked request with a nonzero retry interval", async () => {
    const { client } = makeRedis([4, 58_001, 1, 89_001]);
    const storage = new RedisThrottlerStorage(client);

    await expect(
      storage.increment("request-hash", 60_000, 3, 90_000, "default"),
    ).resolves.toEqual({
      totalHits: 4,
      timeToExpire: 59,
      isBlocked: true,
      timeToBlockExpire: 90,
    });
  });

  it("rejects malformed Lua results instead of disabling throttling silently", async () => {
    const { client } = makeRedis("not-an-array");
    const storage = new RedisThrottlerStorage(client);

    await expect(
      storage.increment("request-hash", 60_000, 3, 90_000, "default"),
    ).rejects.toThrow("Invalid Redis throttler result");
  });

  it("resets only throttler keys using cursor-based SCAN", async () => {
    const { client, scanMock, delMock } = makeRedis([1, 60_000, 0, 0]);
    scanMock
      .mockResolvedValueOnce(["7", ["iam:throttle:default:{a}:window"]])
      .mockResolvedValueOnce([
        "0",
        ["iam:throttle:login:{b}:window", "iam:throttle:login:{b}:block"],
      ]);
    const storage = new RedisThrottlerStorage(client);

    await storage.reset();

    expect(scanMock).toHaveBeenNthCalledWith(
      1,
      "0",
      "MATCH",
      "iam:throttle:*",
      "COUNT",
      100,
    );
    expect(scanMock).toHaveBeenNthCalledWith(
      2,
      "7",
      "MATCH",
      "iam:throttle:*",
      "COUNT",
      100,
    );
    expect(delMock).toHaveBeenNthCalledWith(
      1,
      "iam:throttle:default:{a}:window",
    );
    expect(delMock).toHaveBeenNthCalledWith(
      2,
      "iam:throttle:login:{b}:window",
      "iam:throttle:login:{b}:block",
    );
  });
});
