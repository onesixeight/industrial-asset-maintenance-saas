import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardService } from "./dashboard.service";
import type { PrismaService } from "../prisma";

const COMPANY = "11111111-1111-1111-1111-111111111111";

function makePrisma(
  deleg: Record<string, Record<string, ReturnType<typeof vi.fn>>>,
  root: Record<string, ReturnType<typeof vi.fn>> = {},
) {
  const workOrder = {
    groupBy: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
    ...deleg.workOrder,
  };
  const asset = { count: vi.fn().mockResolvedValue(0), ...deleg.asset };
  const inspection = {
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
    ...deleg.inspection,
  };
  const part = { findMany: vi.fn().mockResolvedValue([]), ...deleg.part };
  const client = {
    workOrder,
    asset,
    inspection,
    part,
    $queryRaw: vi.fn().mockResolvedValue([{ lowStock: 0n, outOfStock: 0n }]),
    ...root,
  };
  return { getClient: () => client } as unknown as PrismaService;
}

describe("DashboardService.stats", () => {
  it("maps groupBy rows to status counts and defaults missing to 0", async () => {
    const prisma = makePrisma({
      workOrder: {
        groupBy: vi.fn().mockResolvedValue([
          { status: "open", _count: { _all: 3 } },
          { status: "completed", _count: { _all: 5 } },
        ]),
      },
    });
    const svc = new DashboardService(prisma);
    const s = await svc.stats(COMPANY);
    expect(s.workOrders.open).toBe(3);
    expect(s.workOrders.completed).toBe(5);
    expect(s.workOrders.inProgress).toBe(0);
    expect(s.workOrders.cancelled).toBe(0);
  });

  it("passRate is null when no inspections in last 30 days", async () => {
    const prisma = makePrisma({
      inspection: { count: vi.fn().mockResolvedValue(0) },
    });
    const svc = new DashboardService(prisma);
    const s = await svc.stats(COMPANY);
    expect(s.inspections.passRate).toBeNull();
  });

  it("passRate = passed/total when inspections exist", async () => {
    let calls = 0;
    const prisma = makePrisma({
      inspection: {
        count: vi.fn().mockImplementation(() => {
          calls += 1;
          // first call = last30Days (10), second = passed (8)
          return Promise.resolve(calls === 1 ? 10 : 8);
        }),
      },
    });
    const svc = new DashboardService(prisma);
    const s = await svc.stats(COMPANY);
    expect(s.inspections.last30Days).toBe(10);
    expect(s.inspections.passed).toBe(8);
    expect(s.inspections.passRate).toBeCloseTo(0.8);
  });

  it("lowStock counts parts at/below min; outOfStock counts quantity<=0", async () => {
    const findMany = vi.fn();
    const queryRaw = vi
      .fn()
      .mockResolvedValue([{ lowStock: 3n, outOfStock: 1n }]);
    const prisma = makePrisma({ part: { findMany } }, { $queryRaw: queryRaw });
    const svc = new DashboardService(prisma);
    const s = await svc.stats(COMPANY);
    expect(s.parts.lowStock).toBe(3); // 5, 2, 0
    expect(s.parts.outOfStock).toBe(1); // 0
    expect(findMany).not.toHaveBeenCalled();
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [sql, boundCompanyId] = queryRaw.mock.calls[0];
    expect((sql as TemplateStringsArray).join("?")).toContain(
      'COUNT(*) FILTER (WHERE "quantity" <= "minQuantity")',
    );
    expect((sql as TemplateStringsArray).join("?")).toContain(
      'COUNT(*) FILTER (WHERE "quantity" <= 0)',
    );
    expect((sql as TemplateStringsArray).join("?")).toContain(
      '"deletedAt" IS NULL',
    );
    expect(boundCompanyId).toBe(COMPANY);
  });

  it("passes companyId through to every query", async () => {
    const groupBy = vi.fn().mockResolvedValue([]);
    const prisma = makePrisma({ workOrder: { groupBy } });
    const svc = new DashboardService(prisma);
    await svc.stats(COMPANY);
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: COMPANY }),
      }),
    );
  });
});

describe("DashboardService.trends", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-30T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("buckets by UTC calendar day and counts created/completed/inspections", async () => {
    const prisma = makePrisma({
      workOrder: {
        findMany: vi.fn().mockResolvedValue([
          {
            createdAt: new Date("2026-01-01T05:00:00Z"),
            completedAt: new Date("2026-01-02T05:00:00Z"),
          },
          { createdAt: new Date("2026-01-01T22:00:00Z"), completedAt: null },
        ]),
      },
      inspection: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ createdAt: new Date("2026-01-01T10:00:00Z") }]),
      },
    });
    const svc = new DashboardService(prisma);
    const t = await svc.trends(COMPANY, 30);
    expect(t.windowDays).toBe(30);
    expect(t.series).toHaveLength(30);
    expect(t.series[0]?.date).toBe("2026-01-01");
    expect(t.series.at(-1)?.date).toBe("2026-01-30");
    const jan1 = t.series.find((p) => p.date === "2026-01-01");
    expect(jan1).toEqual({
      date: "2026-01-01",
      woCreated: 2,
      woCompleted: 0,
      inspections: 1,
    });
    const jan2 = t.series.find((p) => p.date === "2026-01-02");
    expect(jan2?.woCompleted).toBe(1);
    expect(t.series.find((p) => p.date === "2026-01-03")).toEqual({
      date: "2026-01-03",
      woCreated: 0,
      woCompleted: 0,
      inspections: 0,
    });
  });

  it("MTTR reflects completed WOs in the window", async () => {
    const prisma = makePrisma({
      workOrder: {
        findMany: vi.fn().mockResolvedValue([
          {
            createdAt: new Date("2026-01-01T00:00:00Z"),
            completedAt: new Date("2026-01-01T10:00:00Z"),
          }, // 10h
        ]),
      },
    });
    const svc = new DashboardService(prisma);
    const t = await svc.trends(COMPANY, 30);
    expect(t.mttrHours).toBe(10);
  });

  it("counts an older work order when its completion falls inside the window", async () => {
    const completedAt = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    const createdAt = new Date(
      completedAt.getTime() - 40 * 24 * 60 * 60 * 1_000,
    );
    const findMany = vi.fn().mockResolvedValue([{ createdAt, completedAt }]);
    const prisma = makePrisma({ workOrder: { findMany } });
    const svc = new DashboardService(prisma);

    const trends = await svc.trends(COMPANY, 30);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        companyId: COMPANY,
        deletedAt: null,
        OR: [
          { createdAt: { gte: expect.any(Date) } },
          { completedAt: { gte: expect.any(Date) } },
        ],
      },
      select: { createdAt: true, completedAt: true },
    });
    expect(trends.series).toHaveLength(30);
    expect(
      trends.series.find(
        (point) => point.date === completedAt.toISOString().slice(0, 10),
      ),
    ).toEqual({
      date: completedAt.toISOString().slice(0, 10),
      woCreated: 0,
      woCompleted: 1,
      inspections: 0,
    });
    expect(trends.mttrHours).toBe(40 * 24);
  });

  it("empty window → null MTTR and a zero-filled calendar series", async () => {
    const prisma = makePrisma({});
    const svc = new DashboardService(prisma);
    const t = await svc.trends(COMPANY, 30);
    expect(t.mttrHours).toBeNull();
    expect(t.series).toHaveLength(30);
    expect(
      t.series.every(
        (point) =>
          point.woCreated === 0 &&
          point.woCompleted === 0 &&
          point.inspections === 0,
      ),
    ).toBe(true);
  });
});
