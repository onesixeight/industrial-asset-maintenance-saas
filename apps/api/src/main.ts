import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(cookieParser());
  // credentials:true so the browser sends the httpOnly refresh cookie
  // cross-origin (spec §10). Same-site dev uses sameSite:'lax' on the cookie.
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? true,
    credentials: true,
  });
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();
