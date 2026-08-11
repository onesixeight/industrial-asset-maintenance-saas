import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    coverage: {
      all: true,
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/**/*.d.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        statements: 60,
        branches: 78,
        functions: 58,
        lines: 60,
      },
    },
    environment: "node",
    include: [
      "src/**/*.spec.ts",
      "test/**/*.e2e.spec.ts",
      "test/environment.spec.ts",
    ],
    fileParallelism: false,
    setupFiles: ["./test/setup.integration.env.ts"],
    server: {
      deps: {
        fallbackCjs: true,
      },
    },
  },
});
