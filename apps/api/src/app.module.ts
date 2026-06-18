import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { ConfigModule } from "./config";
import { LocationsModule } from "./locations/locations.module";
import { PrismaModule } from "./prisma";
import { RedisModule } from "./redis";

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRoot([
      { name: "default", ttl: 60_000, limit: 60 },
    ]),
    PrismaModule,
    RedisModule,
    AuthModule,
    LocationsModule,
  ],
  controllers: [AppController],
  providers: [
    // Global throttle guard — per-route @Throttle overrides this.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
