import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      all: true,
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/**/*.d.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        statements: 78,
        branches: 70,
        functions: 30,
        lines: 78,
      },
    },
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
});
