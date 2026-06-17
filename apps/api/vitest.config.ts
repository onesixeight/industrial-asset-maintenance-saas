import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    // Sets default test env (DB/Redis/JWT) before any spec imports modules
    // that trigger ConfigModule's Zod validation at import time.
    setupFiles: ["./test/setup.env.ts"],
    server: {
      deps: {
        // Heavy CommonJS deps (notably the generated @prisma/client) load more
        // reliably when vite-node falls back to native require. See ADR 0002.
        fallbackCjs: true,
      },
    },
  },
});
