import Redis from "ioredis";
import { expect, request, test as base } from "@playwright/test";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

async function resetThrottleNamespace(): Promise<void> {
  const rawUrl = process.env.REDIS_URL_TEST;
  if (!rawUrl)
    throw new Error("REDIS_URL_TEST is required for Playwright isolation");
  const url = new URL(rawUrl);
  if (
    !LOOPBACK_HOSTS.has(url.hostname.toLowerCase()) ||
    !/^\/[1-9]\d*$/.test(url.pathname)
  ) {
    throw new Error(
      "Playwright REDIS_URL_TEST must use loopback and a nonzero database",
    );
  }

  const redis = new Redis(url.toString(), { maxRetriesPerRequest: 2 });
  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        "iam:throttle:*",
        "COUNT",
        100,
      );
      if (keys.length > 0) await redis.del(...keys);
      cursor = nextCursor;
    } while (cursor !== "0");
  } finally {
    redis.disconnect();
  }
}

type IsolationFixtures = { resetThrottleState: void };

export const test = base.extend<IsolationFixtures>({
  resetThrottleState: [
    async ({}, use) => {
      await resetThrottleNamespace();
      await use();
    },
    { auto: true },
  ],
});

export { expect, request };
