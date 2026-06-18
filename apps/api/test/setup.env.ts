/**
 * Vitest global setup. Force-sets the test environment so the app under test
 * always talks to a test Postgres and the shared Redis — never the dev DB.
 *
 * The surrounding shell / .env / CI may already export DATABASE_URL pointing
 * at the dev DB (e.g. when the harness loads the repo .env into the session).
 * A `??=` default would be skipped in that case, and e2e specs booting the
 * real AppModule would hit the dev DB (ECONNREFUSED, or worse: stray writes).
 * So the harness OWNS these values.
 *
 * `DATABASE_URL` is forced to `DATABASE_URL_TEST` when that is set, else to the
 * local docker-compose.test DB (:5433). CI sets DATABASE_URL_TEST to its own
 * test container (on :5432). This keeps local and CI both pointing at a test
 * DB without either hard-coding the other's port.
 *
 * `setupFiles` runs before any spec module is imported, so ConfigModule's Zod
 * validation and @nestjs/config's .env loader both observe these values.
 */
process.env.NODE_ENV = "test";
process.env.PORT = "0";
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  "postgresql://iam:iam@localhost:5433/iam_test?schema=public";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.JWT_SECRET = "test-secret-at-least-16-chars";
process.env.JWT_ACCESS_TTL = "15m";
process.env.JWT_REFRESH_TTL = "7d";
process.env.CORS_ORIGIN = "*";
