import { Module } from "@nestjs/common";
// ConfigModule is @Global() and exports ConfigService — no import needed here.
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";

@Module({
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AssetsModule {}
