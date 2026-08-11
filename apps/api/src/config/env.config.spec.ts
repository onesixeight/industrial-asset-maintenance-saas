import { describe, expect, it, afterEach } from "vitest";
import { envSchema, validateEnv } from "./env.config";

const validEnv = {
  NODE_ENV: "development",
  PORT: "4000",
  DATABASE_URL: "postgresql://u:p@localhost:5432/iam_dev",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "super-secret-key-for-tests-1234567890",
  JWT_ACCESS_TTL: "15m",
  JWT_REFRESH_TTL: "7d",
  CORS_ORIGIN: "http://localhost:3000",
} as NodeJS.ProcessEnv;

describe("envSchema", () => {
  afterEach(() => {
    // restore minimal env so tests don't leak process.env state
    for (const k of Object.keys(validEnv ?? {})) delete process.env[k];
  });

  it("accepts a fully valid environment", () => {
    const parsed = envSchema.parse(validEnv);
    expect(parsed.PORT).toBe(4000); // coerced to number
    expect(parsed.NODE_ENV).toBe("development");
    expect(parsed.JWT_ACCESS_TTL).toBe("15m");
  });

  it("applies defaults for optional fields", () => {
    const minimal = {
      ...validEnv,
      JWT_ACCESS_TTL: undefined,
      CORS_ORIGIN: undefined,
      PUBLIC_SCAN_BASE: undefined,
    };
    const parsed = envSchema.parse(minimal);
    expect(parsed.JWT_ACCESS_TTL).toBe("15m");
    expect(parsed.CORS_ORIGIN).toBe("http://localhost:3000");
    expect(parsed.PUBLIC_SCAN_BASE).toBe("http://localhost:3000");
  });

  it("rejects a JWT_SECRET shorter than the configured minimum", () => {
    expect(() => envSchema.parse({ ...validEnv, JWT_SECRET: "short" })).toThrow(
      /JWT_SECRET/,
    );
  });

  it("rejects an invalid DATABASE_URL", () => {
    expect(() =>
      envSchema.parse({ ...validEnv, DATABASE_URL: "not-a-url" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => envSchema.parse({ ...validEnv, NODE_ENV: "staging" })).toThrow(
      /NODE_ENV/,
    );
  });

  it("rejects service URLs with unsupported protocols", () => {
    expect(() =>
      envSchema.parse({
        ...validEnv,
        DATABASE_URL: "https://db.example.com/iam",
      }),
    ).toThrow(/DATABASE_URL/);
    expect(() =>
      envSchema.parse({ ...validEnv, REDIS_URL: "https://cache.example.com" }),
    ).toThrow(/REDIS_URL/);
  });

  it("accepts only bounded JWT lifetimes", () => {
    expect(() =>
      envSchema.parse({ ...validEnv, JWT_ACCESS_TTL: "forever" }),
    ).toThrow(/JWT_ACCESS_TTL/);
    expect(() =>
      envSchema.parse({ ...validEnv, JWT_ACCESS_TTL: "30s" }),
    ).toThrow(/JWT_ACCESS_TTL/);
    expect(() =>
      envSchema.parse({ ...validEnv, JWT_ACCESS_TTL: "2h" }),
    ).toThrow(/JWT_ACCESS_TTL/);
    expect(() =>
      envSchema.parse({ ...validEnv, JWT_ACCESS_TTL: "16m" }),
    ).toThrow(/JWT_ACCESS_TTL/);
    expect(() =>
      envSchema.parse({ ...validEnv, JWT_REFRESH_TTL: "30m" }),
    ).toThrow(/JWT_REFRESH_TTL/);
    expect(() =>
      envSchema.parse({ ...validEnv, JWT_REFRESH_TTL: "31d" }),
    ).toThrow(/JWT_REFRESH_TTL/);

    expect(
      envSchema.parse({ ...validEnv, JWT_ACCESS_TTL: "1m" }).JWT_ACCESS_TTL,
    ).toBe("1m");
    expect(
      envSchema.parse({ ...validEnv, JWT_REFRESH_TTL: "30d" }).JWT_REFRESH_TTL,
    ).toBe("30d");
  });

  it("requires at least 32 characters of JWT secret material", () => {
    expect(() =>
      envSchema.parse({ ...validEnv, JWT_SECRET: "x".repeat(31) }),
    ).toThrow(/JWT_SECRET/);
  });

  it("rejects the documented development JWT placeholder in production", () => {
    expect(() =>
      envSchema.parse({
        ...validEnv,
        NODE_ENV: "production",
        JWT_SECRET: "dev-only-secret-change-before-prod-123456",
        CORS_ORIGIN: "https://app.example.com",
        PUBLIC_SCAN_BASE: "https://app.example.com",
      }),
    ).toThrow(/placeholder/);
  });

  it("parses an explicit bounded trust-proxy hop count", () => {
    expect(
      envSchema.parse({ ...validEnv, TRUST_PROXY_HOPS: "1" }).TRUST_PROXY_HOPS,
    ).toBe(1);
    expect(() =>
      envSchema.parse({ ...validEnv, TRUST_PROXY_HOPS: "99" }),
    ).toThrow(/TRUST_PROXY_HOPS/);
  });

  it("rejects production localhost defaults", () => {
    expect(() =>
      envSchema.parse({
        ...validEnv,
        NODE_ENV: "production",
        CORS_ORIGIN: undefined,
        PUBLIC_SCAN_BASE: undefined,
      }),
    ).toThrow(/CORS_ORIGIN/);
  });

  it("rejects production local or insecure public URLs", () => {
    expect(() =>
      envSchema.parse({
        ...validEnv,
        NODE_ENV: "production",
        CORS_ORIGIN: "https://app.example.com",
        PUBLIC_SCAN_BASE: "http://localhost:3000",
      }),
    ).toThrow(/PUBLIC_SCAN_BASE/);

    expect(() =>
      envSchema.parse({
        ...validEnv,
        NODE_ENV: "production",
        CORS_ORIGIN: "http://app.example.com",
        PUBLIC_SCAN_BASE: "https://app.example.com",
      }),
    ).toThrow(/CORS_ORIGIN/);
  });

  it("accepts production HTTPS non-local origins", () => {
    const parsed = envSchema.parse({
      ...validEnv,
      NODE_ENV: "production",
      REDIS_URL: "rediss://cache.example.com:6380/0",
      CORS_ORIGIN: "https://app.example.com,https://ops.example.com",
      PUBLIC_SCAN_BASE: "https://app.example.com",
    });
    expect(parsed.CORS_ORIGIN).toBe(
      "https://app.example.com,https://ops.example.com",
    );
    expect(parsed.PUBLIC_SCAN_BASE).toBe("https://app.example.com");
  });

  it("requires TLS for Redis in production", () => {
    expect(() =>
      envSchema.parse({
        ...validEnv,
        NODE_ENV: "production",
        REDIS_URL: "redis://cache.example.com:6379/0",
        CORS_ORIGIN: "https://app.example.com",
        PUBLIC_SCAN_BASE: "https://app.example.com",
      }),
    ).toThrow(/REDIS_URL/);
  });
});

describe("validateEnv", () => {
  afterEach(() => {
    for (const k of Object.keys(validEnv ?? {})) delete process.env[k];
  });

  it("returns parsed env when process.env is valid", () => {
    Object.assign(process.env, validEnv);
    expect(validateEnv().PORT).toBe(4000);
  });

  it("throws a descriptive error when env is invalid", () => {
    process.env.DATABASE_URL = "not-a-url";
    process.env.JWT_SECRET = "short";
    expect(() => validateEnv()).toThrow(/Invalid environment configuration/);
  });
});
