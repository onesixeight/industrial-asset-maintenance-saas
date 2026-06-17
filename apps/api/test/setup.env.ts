/**
 * Vitest global setup. Sets sane test env defaults so ConfigModule's Zod
 * validation does not throw at import time when no real .env is present.
 *
 * Individual specs may override process.env before building the app (e.g. to
 * point at the test DB). These defaults point at the docker-compose.test DB.
 */
process.env.NODE_ENV ??= "test";
process.env.PORT ??= "0";
process.env.DATABASE_URL ??=
  "postgresql://iam:iam@localhost:5433/iam_test?schema=public";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-secret-at-least-16-chars";
process.env.JWT_ACCESS_TTL ??= "15m";
process.env.JWT_REFRESH_TTL ??= "7d";
process.env.CORS_ORIGIN ??= "*";
