import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  plugins: [
    // SWC emits decorator metadata (design:paramtypes) which esbuild does
    // not — required for NestJS DI to resolve constructor-injected deps
    // under vite-node/vitest. Settings live in .swcrc (legacyDecorator +
    // decoratorMetadata + useDefineForClassFields:false).
    swc.vite(),
  ],
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts", "test/**/*.e2e.spec.ts"],
    // DB-touching integration specs share the test Postgres; their
    // beforeEach truncate hooks conflict if files run in parallel. Run files
    // serially (still many tests per file run concurrently is fine because
    // beforeEach truncates before each `it`).
    fileParallelism: false,
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
