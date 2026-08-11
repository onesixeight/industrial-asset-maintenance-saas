import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { AppController } from "./app.controller";
import { AssetsModule } from "./assets/assets.module";
import { AuthModule } from "./auth/auth.module";
import { CategoriesModule } from "./categories/categories.module";
import { RedisThrottlerStorage } from "./common/redis-throttler.storage";
import { ConfigModule } from "./config";
import { DashboardModule } from "./dashboard/dashboard.module";
import { InspectionsModule } from "./inspections/inspections.module";
import { LocationsModule } from "./locations/locations.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PartsModule } from "./parts/parts.module";
import { PrismaModule } from "./prisma";
import { ReportsModule } from "./reports/reports.module";
import { RedisModule, RedisService } from "./redis";
import { UsersModule } from "./users/users.module";
import { WorkOrdersModule } from "./work-orders/work-orders.module";

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        ...(process.env.NODE_ENV === "test" ? { level: "silent" } : {}),
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            'res.headers["set-cookie"]',
          ],
          censor: "[Redacted]",
        },
        transport:
          process.env.NODE_ENV === "production"
            ? undefined
            : {
                target: "pino-pretty",
                options: { colorize: true, singleLine: true },
              },
      },
    }),
    ConfigModule,
    RedisModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        storage: new RedisThrottlerStorage(redis.client),
        throttlers: [{ name: "default", ttl: 60_000, limit: 60 }],
      }),
    }),
    PrismaModule,
    AuthModule,
    LocationsModule,
    CategoriesModule,
    UsersModule,
    AssetsModule,
    WorkOrdersModule,
    InspectionsModule,
    PartsModule,
    DashboardModule,
    ReportsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [
    // Global throttle guard — per-route @Throttle overrides this.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
