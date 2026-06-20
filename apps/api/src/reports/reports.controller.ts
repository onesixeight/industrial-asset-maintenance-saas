import { Controller, Get, Header, UseGuards } from "@nestjs/common";
import type { JwtPayload } from "@iam/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ReportsService } from "./reports.service";

/**
 * Synchronous report downloads (ADR 0005 — BullMQ/R2 deferred). CSV is built
 * on demand and returned as `text/csv` with an attachment disposition so the
 * browser saves it. Tenant-scoped via `user.companyId`.
 */
@Controller("reports")
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("work-orders.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="work-orders.csv"')
  async workOrdersCsv(@CurrentUser() user: JwtPayload): Promise<string> {
    return this.reports.generateWorkOrdersCsv(user.companyId);
  }
}
