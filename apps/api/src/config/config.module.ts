import { Global, Module, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { validateEnv, type Env } from "./env.config";

/**
 * Typed, validated access to process.env.
 *
 * Wraps @nestjs/config so the rest of the app can `ConfigService.get('KEY')`,
 * while guaranteeing via Zod that every required variable is present and shaped
 * correctly at bootstrap time. Throws synchronously if the environment is invalid.
 */
export const VALIDATED_ENV = "VALIDATED_ENV";

function buildValidatedEnv(): Env {
  return validateEnv();
}

function findWorkspaceEnv(startDirectory = process.cwd()): string {
  let directory = resolve(startDirectory);

  while (true) {
    if (existsSync(join(directory, "pnpm-workspace.yaml"))) {
      return join(directory, ".env");
    }

    const parent = dirname(directory);
    if (parent === directory) return join(startDirectory, ".env");
    directory = parent;
  }
}

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      // We perform our own Zod validation; let @nestjs/config load the raw env
      // (and the documented workspace-root .env) without its own validation.
      envFilePath: findWorkspaceEnv(),
      validate: () => buildValidatedEnv() as unknown as Record<string, unknown>,
      cache: true,
      expandVariables: true,
    }),
  ],
  providers: [
    {
      provide: VALIDATED_ENV,
      useFactory: () => buildValidatedEnv(),
    },
  ],
  exports: [NestConfigModule, VALIDATED_ENV],
})
export class ConfigModule implements OnApplicationBootstrap {
  // Re-validate at bootstrap to surface clear errors before the app starts
  // serving requests, even if this module is imported lazily.
  onApplicationBootstrap(): void {
    buildValidatedEnv();
  }
}
