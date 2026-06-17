// Prisma 7 configuration.
// The datasource URL previously lived in schema.prisma; in v7 it lives here.
// `prisma migrate` / `prisma validate` / `prisma generate` read this file.
//
// The .env lives at the monorepo root (apps/api is TWO levels below root).
// We load it explicitly so the CLI works regardless of cwd. Tests override
// DATABASE_URL to the test DB (port 5433) before bootstrapping the app.
import { config } from "dotenv";
import { defineConfig } from "@prisma/config";
import { resolve } from "node:path";

const rootEnv = resolve(__dirname, "../../.env");
const result = config({ path: rootEnv });
if (result.error && process.env.NODE_ENV !== "test") {
  // Non-fatal in tests (env is set by the harness); warn otherwise.
  console.warn(`[prisma.config] could not load ${rootEnv}: ${result.error.message}`);
}

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
