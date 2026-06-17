// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

/**
 * Root flat ESLint config for the monorepo.
 * Apps may extend with their own .eslintrc-style overrides via their lint scripts.
 * Phase 0 keeps this intentionally minimal: JS recommended + TS recommended + prettier compat.
 */
export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/.turbo/**", "**/node_modules/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.spec.ts", "**/*.test.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
