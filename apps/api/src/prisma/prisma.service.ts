import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { ConfigService } from "@nestjs/config";
import { VALIDATED_ENV, type Env } from "../config";

/**
 * Wrapper around PrismaClient wired with the @prisma/adapter-pg driver
 * adapter (Prisma 7, per ADR 0001).
 *
 * We COMPOSE (not extend) PrismaClient. Under vite-node/vitest the generated
 * PrismaClient uses a Proxy-based constructor that recurses infinitely when
 * subclassed (`extends PrismaClient`), so the standard NestJS recipe is
 * unusable here. Composition also matches Prisma's recommended adapter
 * pattern. Callers obtain the client via `getClient()`.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly client: PrismaClient;
  private readonly pool: Pool;

  constructor(config: ConfigService, @Inject(VALIDATED_ENV) env: Env) {
    const url = config.get<string>("DATABASE_URL") ?? env.DATABASE_URL;
    this.pool = new Pool({ connectionString: url });
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });
  }

  /** The underlying PrismaClient. Use `svc.getClient().user.findMany(...)` etc. */
  getClient(): PrismaClient {
    return this.client;
  }

  /** Disconnect Prisma (leaves the pg pool open; see onModuleDestroy). */
  async $disconnect(): Promise<void> {
    await this.client.$disconnect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}
