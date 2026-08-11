import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

const managedEnvKeys = [
  "NODE_ENV",
  "PORT",
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "JWT_ACCESS_TTL",
  "JWT_REFRESH_TTL",
  "CORS_ORIGIN",
] as const;

describe("ConfigModule root environment loading", () => {
  const originalCwd = process.cwd();
  const originalEnv = Object.fromEntries(
    managedEnvKeys.map((key) => [key, process.env[key]]),
  );
  let temporaryRoot: string | undefined;

  afterEach(async () => {
    process.chdir(originalCwd);
    for (const key of managedEnvKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (temporaryRoot)
      await rm(temporaryRoot, { recursive: true, force: true });
    temporaryRoot = undefined;
    vi.resetModules();
  });

  it("loads the documented repository-root .env when the API runs from apps/api", async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "iam-config-"));
    const apiDirectory = join(temporaryRoot, "apps", "api");
    await mkdir(apiDirectory, { recursive: true });
    await writeFile(
      join(temporaryRoot, "pnpm-workspace.yaml"),
      'packages:\n  - "apps/*"\n',
      "utf8",
    );
    await writeFile(join(temporaryRoot, ".env"), "PORT=4111\n", "utf8");

    Object.assign(process.env, {
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://iam:iam@localhost:5432/iam_dev",
      REDIS_URL: "redis://localhost:6379",
      JWT_SECRET: "config-module-test-secret-at-least-32-chars",
      JWT_ACCESS_TTL: "15m",
      JWT_REFRESH_TTL: "7d",
      CORS_ORIGIN: "http://localhost:3000",
    });
    delete process.env.PORT;
    process.chdir(apiDirectory);

    vi.resetModules();
    const { ConfigModule } = await import("./config.module");
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule],
    }).compile();

    expect(moduleRef.get(ConfigService).get<number>("PORT")).toBe(4111);
    await moduleRef.close();
  });
});
