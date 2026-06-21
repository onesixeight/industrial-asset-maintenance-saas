import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the browser-level E2E suite (Phase 9).
 *
 * The stack (postgres + redis + api on :4000 + web on :3000) is expected to be
 * running already — `webServer` only starts Next.js. The api + infra are
 * started externally (docker compose + `pnpm --filter api dev`) so the same
 * config works for local runs and CI.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // shared test DB; sequential is safer
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_API_URL: "http://localhost:4000",
    },
  },
});
