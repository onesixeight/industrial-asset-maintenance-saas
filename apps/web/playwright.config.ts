import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the browser-level E2E suite (Phase 9).
 *
 * PostgreSQL and Redis are explicit prerequisites. Playwright starts both the
 * prebuilt API and production Next.js output, waits for readiness, and tears
 * them down after the browser suite.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const apiURL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const apiOrigin = apiURL.startsWith("http")
  ? new URL(apiURL).origin
  : (process.env.API_ORIGIN ?? "http://localhost:4000");
const webPort = new URL(baseURL).port || "3000";
const apiPort = new URL(apiOrigin).port || "4000";
const databaseUrl = process.env.DATABASE_URL_TEST;
const redisUrl = process.env.REDIS_URL_TEST;

if (!databaseUrl || !redisUrl) {
  throw new Error(
    "DATABASE_URL_TEST and REDIS_URL_TEST are required for Playwright",
  );
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // shared test DB; sequential is safer
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @iam/api start",
      url: `${apiOrigin}/health`,
      reuseExistingServer:
        process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "true",
      timeout: 120_000,
      env: {
        NODE_ENV: "test",
        PORT: apiPort,
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        JWT_SECRET:
          process.env.JWT_SECRET ?? "playwright-secret-at-least-32-characters",
        JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL ?? "15m",
        JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL ?? "7d",
        CORS_ORIGIN: baseURL,
        PUBLIC_SCAN_BASE: baseURL,
        TRUST_PROXY_HOPS: "0",
      },
    },
    {
      command: `pnpm exec next start -H 127.0.0.1 -p ${webPort}`,
      url: baseURL,
      reuseExistingServer:
        process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "true",
      timeout: 120_000,
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_API_URL: apiURL,
        API_ORIGIN: apiOrigin,
      },
    },
  ],
});
