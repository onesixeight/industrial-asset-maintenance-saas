import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { VALIDATED_ENV, type Env } from "./config";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const express = app.getHttpAdapter().getInstance() as {
    set: (key: string, value: unknown) => void;
  };
  const env = app.get<Env>(VALIDATED_ENV);
  express.set("trust proxy", env.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use(cookieParser());

  // credentials:true so the browser sends the httpOnly refresh cookie
  // cross-origin (spec §10). Same-site dev uses sameSite:'lax' on the cookie.
  app.enableCors({
    origin: env.CORS_ORIGIN.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
  });

  // Swagger UI at /docs in non-production environments (Phase 9).
  if (env.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("Industrial Asset Maintenance API")
      .setDescription("B2B industrial asset maintenance SaaS — REST API")
      .setVersion("1.0.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("docs", app, document);
  }

  await app.listen(env.PORT);
}

void bootstrap();
