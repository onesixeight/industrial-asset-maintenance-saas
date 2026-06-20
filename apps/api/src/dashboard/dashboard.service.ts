import { Injectable } from "@nestjs/common";
import type { StatsResponse, TrendPoint, TrendsResponse } from "@iam/shared";
import { PrismaService } from "../prisma";
import { computeMttr } from "./mttr";

/**
 * Tenant-scoped dashboard aggregates. All queries carry `companyId`; a viewer
 * only sees their own tenant's counts. `lowStock`/`outOfStock` are computed in
 * memory because Prisma cannot compare two columns in a `where` (Phase 6
 * pattern). Trend buckets use the UTC calendar day of `createdAt`.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(companyId: string): Promise<StatsResponse> {
    const c = this.prisma.getClient();

    const [woByStatus, overdue, assetTotal, assetMaintenance, inspLast30, inspPassed, parts] =
      await Promise.all([
        c.workOrder.groupBy({
          by: ["status"],
          where: { companyId, deletedAt: null },
          _count: { _all: true },
        }),
        c.workOrder.count({
          where: {
            companyId,
            deletedAt: null,
            dueDate: { lt: new Date() },
            status: { notIn: ["completed", "cancelled"] },
          },
        }),
        c.asset.count({ where: { companyId } }),
        c.asset.count({ where: { companyId, status: "maintenance" } }),
        c.inspection.count({
          where: {
            companyId,
            createdAt: { gte: daysAgo(30) },
          },
        }),
        c.inspection.count({
          where: { companyId, createdAt: { gte: daysAgo(30) }, passed: true },
        }),
        c.part.findMany({ where: { companyId }, select: { quantity: true, minQuantity: true } }),
      ]);

    const statusMap = Object.fromEntries(
      woByStatus.map((r) => [r.status, r._count._all] as const),
    );

    return {
      workOrders: {
        open: statusMap.open ?? 0,
        inProgress: statusMap.in_progress ?? 0,
        onHold: statusMap.on_hold ?? 0,
        completed: statusMap.completed ?? 0,
        cancelled: statusMap.cancelled ?? 0,
        overdue,
      },
      assets: { total: assetTotal, maintenance: assetMaintenance },
      inspections: {
        last30Days: inspLast30,
        passed: inspPassed,
        passRate: inspLast30 === 0 ? null : inspPassed / inspLast30,
      },
      parts: {
        lowStock: parts.filter((p) => p.quantity <= p.minQuantity).length,
        outOfStock: parts.filter((p) => p.quantity <= 0).length,
      },
    };
  }

  async trends(companyId: string, windowDays: number): Promise<TrendsResponse> {
    const c = this.prisma.getClient();
    const start = daysAgo(windowDays);

    const [woRows, inspRows] = await Promise.all([
      c.workOrder.findMany({
        where: { companyId, deletedAt: null, createdAt: { gte: start } },
        select: { createdAt: true, completedAt: true },
      }),
      c.inspection.findMany({
        where: { companyId, createdAt: { gte: start } },
        select: { createdAt: true },
      }),
    ]);

    const buckets = new Map<string, TrendPoint>();
    const ensure = (date: string): TrendPoint => {
      let p = buckets.get(date);
      if (!p) {
        p = { date, woCreated: 0, woCompleted: 0, inspections: 0 };
        buckets.set(date, p);
      }
      return p;
    };

    for (const w of woRows) {
      const created = dayKey(w.createdAt);
      ensure(created).woCreated += 1;
      if (w.completedAt) {
        const completed = dayKey(w.completedAt);
        ensure(completed).woCompleted += 1;
      }
    }
    for (const i of inspRows) {
      ensure(dayKey(i.createdAt)).inspections += 1;
    }

    const series = [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
    return {
      windowDays,
      mttrHours: computeMttr(woRows),
      series,
    };
  }
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/** YYYY-MM-DD in UTC — stable bucket key regardless of server timezone. */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
