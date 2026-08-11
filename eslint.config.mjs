// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import { createRequire } from "node:module";

const requireFromWeb = createRequire(new URL("./apps/web/package.json", import.meta.url));
const nextCoreWebVitals = requireFromWeb("eslint-config-next/core-web-vitals");

const webSourceFiles = ["apps/web/src/**/*.{ts,tsx}"];
const scopedNextCoreWebVitals = nextCoreWebVitals.map((config) => ({
  ...config,
  files: webSourceFiles,
}));

/**
 * Root flat ESLint config for the monorepo.
 * Apps may extend with their own .eslintrc-style overrides via their lint scripts.
 * Phase 0 keeps this intentionally minimal: JS recommended + TS recommended + prettier compat.
 */
export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/.turbo/**", "**/node_modules/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...scopedNextCoreWebVitals,
  prettier,
  {
    files: ["**/*.spec.ts", "**/*.test.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
