import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { AppController } from "./app.controller";

@Module({
  imports: [LoggerModule.forRoot()],
  controllers: [AppController],
})
export class AppModule {}
