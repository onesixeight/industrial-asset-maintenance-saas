export type TestEnvironmentSource = Readonly<
  Record<string, string | undefined>
>;

export interface TestEnvironment {
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly nodeEnv: "test";
  readonly port: 0;
  readonly jwtSecret: string;
  readonly jwtAccessTtl: string;
  readonly jwtRefreshTtl: string;
  readonly corsOrigin: string;
}

const DEFAULTS = {
  nodeEnv: "test" as const,
  port: 0 as const,
  jwtSecret: "test-secret-at-least-32-characters-long",
  jwtAccessTtl: "15m",
  jwtRefreshTtl: "7d",
  corsOrigin: "*",
} as const;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function requireLoopback(url: URL, variable: string): void {
  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(
      `${variable} must use a loopback host for destructive tests`,
    );
  }
}

function requiredUrl(
  source: TestEnvironmentSource,
  variable: "DATABASE_URL_TEST" | "REDIS_URL_TEST",
): URL {
  const value = source[variable];
  if (!value) {
    throw new Error(`${variable} is required for the test environment`);
  }

  try {
    return new URL(value);
  } catch {
    throw new Error(`${variable} must be a valid URL`);
  }
}

function validatePostgres(url: URL): void {
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL_TEST must be a PostgreSQL URL");
  }

  requireLoopback(url, "DATABASE_URL_TEST");
  const databaseName = decodeURIComponent(url.pathname)
    .replace(/^\/+/, "")
    .toLowerCase();
  if (databaseName !== "iam_test") {
    throw new Error(
      "DATABASE_URL_TEST must name the dedicated iam_test database exactly",
    );
  }

  const queryEntries = [...url.searchParams.entries()];
  const hasOnlyCanonicalSchema =
    queryEntries.length <= 1 &&
    queryEntries.every(
      ([key, value]) => key === "schema" && value === "public",
    );
  if (!hasOnlyCanonicalSchema) {
    throw new Error(
      "DATABASE_URL_TEST query parameters may only contain the canonical schema=public setting",
    );
  }
  if (url.hash) {
    throw new Error("DATABASE_URL_TEST fragments are not allowed");
  }
}

function validateRedis(url: URL): void {
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REDIS_URL_TEST must be a Redis URL");
  }

  requireLoopback(url, "REDIS_URL_TEST");
  if (!/^\/[1-9]\d*$/.test(url.pathname)) {
    throw new Error(
      "REDIS_URL_TEST must use a dedicated nonzero database index",
    );
  }
  if ([...url.searchParams].length > 0) {
    throw new Error("REDIS_URL_TEST query parameters are not allowed");
  }
  if (url.hash) {
    throw new Error("REDIS_URL_TEST fragments are not allowed");
  }
}

/**
 * Validates the two caller-provided test service URLs and derives the complete,
 * deterministic environment used by every test entry point.
 */
export function getTestEnvironment(
  source: TestEnvironmentSource,
): TestEnvironment {
  const database = requiredUrl(source, "DATABASE_URL_TEST");
  const redis = requiredUrl(source, "REDIS_URL_TEST");
  validatePostgres(database);
  validateRedis(redis);

  return Object.freeze({
    databaseUrl: database.toString(),
    redisUrl: redis.toString(),
    ...DEFAULTS,
  });
}

/** Separate opt-in used only by suites that can mutate shared service state. */
export function assertDestructiveTestEnvironment(
  source: TestEnvironmentSource = process.env,
): void {
  getTestEnvironment(source);
  if (source.ALLOW_DESTRUCTIVE_TEST_DATABASE !== "true") {
    throw new Error(
      "ALLOW_DESTRUCTIVE_TEST_DATABASE=true is required before destructive integration tests",
    );
  }
}

/** Applies the authoritative test values before application modules are imported. */
export function applyTestEnvironment(
  source: TestEnvironmentSource = process.env,
): TestEnvironment {
  const environment = getTestEnvironment(source);
  process.env.DATABASE_URL = environment.databaseUrl;
  process.env.REDIS_URL = environment.redisUrl;
  process.env.NODE_ENV = environment.nodeEnv;
  process.env.PORT = String(environment.port);
  process.env.JWT_SECRET = environment.jwtSecret;
  process.env.JWT_ACCESS_TTL = environment.jwtAccessTtl;
  process.env.JWT_REFRESH_TTL = environment.jwtRefreshTtl;
  process.env.CORS_ORIGIN = environment.corsOrigin;
  return environment;
}
