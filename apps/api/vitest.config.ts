import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    server: {
      deps: {
        // Heavy CommonJS deps (notably the generated @prisma/client) load more
        // reliably when vite-node falls back to native require. See ADR 0002.
        fallbackCjs: true,
      },
    },
  },
});
