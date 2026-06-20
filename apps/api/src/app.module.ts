import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AppController } from "./app.controller";
import { AssetsModule } from "./assets/assets.module";
import { AuthModule } from "./auth/auth.module";
import { CategoriesModule } from "./categories/categories.module";
import { ConfigModule } from "./config";
import { LocationsModule } from "./locations/locations.module";
import { PrismaModule } from "./prisma";
import { RedisModule } from "./redis";
import { UsersModule } from "./users/users.module";

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
    CategoriesModule,
    UsersModule,
    AssetsModule,
  ],
  controllers: [AppController],
  providers: [
    // Global throttle guard — per-route @Throttle overrides this.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
