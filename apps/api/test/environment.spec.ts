import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyTestEnvironment,
  assertDestructiveTestEnvironment,
  getTestEnvironment,
} from "./environment";

const VALID_SOURCE = {
  DATABASE_URL_TEST:
    "postgresql://iam:iam@localhost:5433/iam_test?schema=public",
  REDIS_URL_TEST: "redis://localhost:6380/1",
  ALLOW_DESTRUCTIVE_TEST_DATABASE: "true",
};

const PROCESS_ENV_KEYS = [
  "DATABASE_URL",
  "DATABASE_URL_TEST",
  "REDIS_URL",
  "REDIS_URL_TEST",
  "NODE_ENV",
  "JWT_SECRET",
  "JWT_ACCESS_TTL",
  "JWT_REFRESH_TTL",
  "CORS_ORIGIN",
] as const;

const originalProcessEnvironment = Object.fromEntries(
  PROCESS_ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of PROCESS_ENV_KEYS) {
    const value = originalProcessEnvironment[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("getTestEnvironment", () => {
  it("requires both dedicated service URLs", () => {
    expect(() =>
      getTestEnvironment({ REDIS_URL_TEST: VALID_SOURCE.REDIS_URL_TEST }),
    ).toThrow("DATABASE_URL_TEST");
    expect(() =>
      getTestEnvironment({ DATABASE_URL_TEST: VALID_SOURCE.DATABASE_URL_TEST }),
    ).toThrow("REDIS_URL_TEST");
  });

  it("rejects a PostgreSQL database whose name is not visibly a test database", () => {
    expect(() =>
      getTestEnvironment({
        ...VALID_SOURCE,
        DATABASE_URL_TEST: "postgresql://iam:iam@localhost/iam",
      }),
    ).toThrow("test");
  });

  it.each(["contest_prod", "latest", "prod_test_backup", "iam_test_backup"])(
    "rejects a deceptive destructive database name: %s",
    (databaseName) => {
      expect(() =>
        getTestEnvironment({
          ...VALID_SOURCE,
          DATABASE_URL_TEST: `postgresql://iam:iam@localhost/${databaseName}`,
        }),
      ).toThrow("iam_test");
    },
  );

  it("rejects remote PostgreSQL and Redis hosts", () => {
    expect(() =>
      getTestEnvironment({
        ...VALID_SOURCE,
        DATABASE_URL_TEST:
          "postgresql://iam:iam@staging-db.example.com/iam_test",
      }),
    ).toThrow("loopback");
    expect(() =>
      getTestEnvironment({
        ...VALID_SOURCE,
        REDIS_URL_TEST: "redis://staging-cache.example.com/1",
      }),
    ).toThrow("loopback");
  });

  it("rejects driver query parameters that can override loopback routing", () => {
    expect(() =>
      getTestEnvironment({
        ...VALID_SOURCE,
        DATABASE_URL_TEST:
          "postgresql://iam:iam@localhost:5433/iam_test?host=prod-db.internal&port=5432",
      }),
    ).toThrow("query parameters");
    expect(() =>
      getTestEnvironment({
        ...VALID_SOURCE,
        REDIS_URL_TEST:
          "redis://localhost:6380/1?path=/tmp/production-redis.sock",
      }),
    ).toThrow("query parameters");
  });

  it("requires an explicit destructive-test opt-in", () => {
    const withoutOptIn = {
      DATABASE_URL_TEST: VALID_SOURCE.DATABASE_URL_TEST,
      REDIS_URL_TEST: VALID_SOURCE.REDIS_URL_TEST,
    };
    expect(() => assertDestructiveTestEnvironment(withoutOptIn)).toThrow(
      "ALLOW_DESTRUCTIVE_TEST_DATABASE=true",
    );
  });

  it("rejects Redis database zero", () => {
    expect(() =>
      getTestEnvironment({
        ...VALID_SOURCE,
        REDIS_URL_TEST: "redis://localhost/0",
      }),
    ).toThrow("nonzero database index");
  });

  it("maps valid dedicated URLs to immutable deterministic test defaults", () => {
    const environment = getTestEnvironment(VALID_SOURCE);

    expect(environment).toEqual({
      databaseUrl: VALID_SOURCE.DATABASE_URL_TEST,
      redisUrl: VALID_SOURCE.REDIS_URL_TEST,
      nodeEnv: "test",
      port: 0,
      jwtSecret: "test-secret-at-least-32-characters-long",
      jwtAccessTtl: "15m",
      jwtRefreshTtl: "7d",
      corsOrigin: "*",
    });
    expect(Object.isFrozen(environment)).toBe(true);
  });
});

describe("applyTestEnvironment", () => {
  it("sets process environment values from the authoritative test source", () => {
    applyTestEnvironment(VALID_SOURCE);

    expect(process.env).toMatchObject({
      DATABASE_URL: VALID_SOURCE.DATABASE_URL_TEST,
      REDIS_URL: VALID_SOURCE.REDIS_URL_TEST,
      NODE_ENV: "test",
      JWT_SECRET: "test-secret-at-least-32-characters-long",
      JWT_ACCESS_TTL: "15m",
      JWT_REFRESH_TTL: "7d",
      CORS_ORIGIN: "*",
    });
  });

  it("gives Docker-free unit tests safe loopback service placeholders", async () => {
    delete process.env.DATABASE_URL_TEST;
    delete process.env.REDIS_URL_TEST;
    vi.resetModules();

    await import("./setup.env");

    expect(process.env.DATABASE_URL).toBe(
      "postgresql://iam:iam@localhost:5433/iam_test?schema=public",
    );
    expect(process.env.REDIS_URL).toBe("redis://localhost:6380/1");
  });
});
