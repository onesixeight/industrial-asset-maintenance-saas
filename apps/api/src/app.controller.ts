import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@iam/shared";

@Controller()
export class AppController {
  @Get("health")
  health(): HealthResponse {
    return { status: "ok", timestamp: new Date().toISOString() };
  }
}
