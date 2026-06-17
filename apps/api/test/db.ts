import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../src/prisma";
import type { Env } from "../src/config";
import { VALIDATED_ENV } from "../src/config";

/**
 * Test DB helpers. Backed by the docker-compose.test Postgres (port 5433).
 *
 * `truncate()` clears all tables in dependency order; safe to call in
 * beforeEach for integration specs.
 *
 * NOTE: returns a singleton PrismaService (one connection pool per process).
 * Tests that import this MUST NOT also import @prisma/client directly (see
 * ADR 0002 — vite-node Proxy recursion).
 */

let _prisma: PrismaService | undefined;

const TEST_ENV: Env = {
  NODE_ENV: "test",
  PORT: 0,
  DATABASE_URL: "postgresql://iam:iam@localhost:5433/iam_test?schema=public",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "test-secret-at-least-16-chars",
  JWT_ACCESS_TTL: "15m",
  JWT_REFRESH_TTL: "7d",
  CORS_ORIGIN: "*",
};

/** Shared test PrismaService connected to the test DB. */
export function testPrisma(): PrismaService {
  if (!_prisma) {
    const config = { get: () => undefined } as unknown as ConfigService;
    _prisma = new PrismaService(config, TEST_ENV);
  }
  return _prisma;
}

/** Truncate all tables in dependency order. Idempotent. */
export async function truncate(): Promise<void> {
  const c = testPrisma().getClient();
  await c.notification.deleteMany();
  await c.user.deleteMany();
  await c.company.deleteMany();
}

/** Disconnect the shared pool (call from afterAll at the suite level). */
export async function teardown(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = undefined;
  }
}

export { TEST_ENV };
export type { Env };
export const VALIDATED_ENV_TEST = VALIDATED_ENV;
