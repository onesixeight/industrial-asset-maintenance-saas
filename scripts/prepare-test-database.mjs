import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL_TEST is required before preparing the integration database",
  );
}

const parsedDatabaseUrl = new URL(databaseUrl);
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const queryEntries = [...parsedDatabaseUrl.searchParams.entries()];
const canonicalQuery =
  queryEntries.length <= 1 &&
  queryEntries.every(([key, value]) => key === "schema" && value === "public");
if (
  !["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol) ||
  !loopbackHosts.has(parsedDatabaseUrl.hostname.toLowerCase()) ||
  parsedDatabaseUrl.pathname.replace(/^\/+/, "") !== "iam_test" ||
  !canonicalQuery ||
  parsedDatabaseUrl.hash
) {
  throw new Error(
    "DATABASE_URL_TEST must be the canonical loopback iam_test database",
  );
}

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("test:prepare must be invoked through pnpm");
const commands = [
  ["--filter", "@iam/api", "prisma:generate"],
  [
    "--filter",
    "@iam/api",
    "exec",
    "prisma",
    "migrate",
    "deploy",
    "--schema",
    "prisma/schema.prisma",
  ],
];

for (const args of commands) {
  const result = spawnSync(process.execPath, [pnpmCli, ...args], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
