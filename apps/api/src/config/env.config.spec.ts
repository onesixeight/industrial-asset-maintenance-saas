import { describe, expect, it, afterEach } from "vitest";
import { envSchema, validateEnv } from "./env.config";

const validEnv = {
  NODE_ENV: "development",
  PORT: "4000",
  DATABASE_URL: "postgresql://u:p@localhost:5432/iam_dev",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "super-secret-key-1234",
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
    const minimal = { ...validEnv, JWT_ACCESS_TTL: undefined, CORS_ORIGIN: undefined, PUBLIC_SCAN_BASE: undefined };
    const parsed = envSchema.parse(minimal);
    expect(parsed.JWT_ACCESS_TTL).toBe("15m");
    expect(parsed.CORS_ORIGIN).toBe("http://localhost:3000");
    expect(parsed.PUBLIC_SCAN_BASE).toBe("http://localhost:3000");
  });

  it("rejects a JWT_SECRET shorter than 16 chars", () => {
    expect(() =>
      envSchema.parse({ ...validEnv, JWT_SECRET: "short" }),
    ).toThrow(/JWT_SECRET/);
  });

  it("rejects an invalid DATABASE_URL", () => {
    expect(() => envSchema.parse({ ...validEnv, DATABASE_URL: "not-a-url" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => envSchema.parse({ ...validEnv, NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
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
