import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../src/prisma";
import type { Env } from "../src/config";
import { VALIDATED_ENV } from "../src/config";
import {
  assertDestructiveTestEnvironment,
  getTestEnvironment,
} from "./environment";

/**
 * Test DB helpers. Backed by the caller-provided isolated test services.
 *
 * `truncate()` clears all tables in dependency order; safe to call in
 * beforeEach for integration specs.
 *
 * NOTE: returns a singleton PrismaService (one connection pool per process).
 * Tests that import this MUST NOT also import @prisma/client directly (see
 * ADR 0002 — vite-node Proxy recursion).
 */

let _prisma: PrismaService | undefined;

const testEnvironment = getTestEnvironment(process.env);

const TEST_ENV: Env = {
  NODE_ENV: testEnvironment.nodeEnv,
  PORT: testEnvironment.port,
  TRUST_PROXY_HOPS: 0,
  DATABASE_URL: testEnvironment.databaseUrl,
  REDIS_URL: testEnvironment.redisUrl,
  JWT_SECRET: testEnvironment.jwtSecret,
  JWT_ACCESS_TTL: testEnvironment.jwtAccessTtl,
  JWT_REFRESH_TTL: testEnvironment.jwtRefreshTtl,
  CORS_ORIGIN: testEnvironment.corsOrigin,
  PUBLIC_SCAN_BASE: "http://localhost:3000",
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
  assertDestructiveTestEnvironment();
  const c = testPrisma().getClient();
  // The database name is validated as a dedicated test database before this
  // module loads. TRUNCATE intentionally bypasses the production append-only
  // InventoryMovement DML trigger and clears every application table at once.
  await c.$executeRaw`
    TRUNCATE TABLE
      "Notification",
      "InventoryMovement",
      "WorkOrderPart",
      "Inspection",
      "WorkOrder",
      "InspectionTemplate",
      "Part",
      "Asset",
      "Category",
      "Location",
      "Report",
      "User",
      "Company"
    RESTART IDENTITY CASCADE
  `;
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
