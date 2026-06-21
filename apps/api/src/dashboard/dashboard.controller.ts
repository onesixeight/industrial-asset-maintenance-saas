import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { JwtPayload, TrendsQuery } from "@iam/shared";
import { trendsQuerySchema } from "@iam/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DashboardService } from "./dashboard.service";

/**
 * Read-only tenant-scoped aggregates. Any authenticated user may read their
 * own tenant's stats/trends — there is nothing to gate (no writes), and the
 * service scopes every query by `user.companyId`.
 */
@ApiTags("dashboard")
@Controller("dashboard")
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("stats")
  stats(@CurrentUser() user: JwtPayload) {
    return this.dashboard.stats(user.companyId);
  }

  @Get("trends")
  trends(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(trendsQuerySchema)) q: TrendsQuery,
  ) {
    return this.dashboard.trends(user.companyId, q.days);
  }
}
