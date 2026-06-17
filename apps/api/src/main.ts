import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(",") ?? true });
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();
