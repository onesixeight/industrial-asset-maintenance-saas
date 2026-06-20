import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { JwtPayload } from "@iam/shared";
import { WorkOrdersService } from "./work-orders.service";
import type { PrismaService } from "../prisma";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const ASSET = "33333333-3333-3333-3333-333333333333";
const TECH = "44444444-4444-4444-4444-444444444444";
const OTHER_USER = "55555555-5555-5555-5555-555555555555";

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "wo-1",
    title: "Inspect pump",
    description: null,
    type: "preventive",
    status: "open",
    priority: "medium",
    assetId: ASSET,
    assignedToId: null,
    dueDate: null,
    completedAt: null,
    deletedAt: null,
    companyId: COMPANY,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  const workOrder = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    ...overrides,
  };
  const asset = { findFirst: vi.fn().mockResolvedValue({ id: ASSET }) };
  const user = { findFirst: vi.fn().mockResolvedValue({ id: TECH }) };
  const client = { workOrder, asset, user };
  return { getClient: () => client } as unknown as PrismaService;
}

const techUser: JwtPayload = {
  sub: TECH,
  companyId: COMPANY,
  role: "technician",
  jti: "jti",
  typ: "access",
};
const managerUser: JwtPayload = { ...techUser, sub: OTHER_USER, role: "manager" };

describe("WorkOrdersService", () => {
  it("list excludes soft-deleted and filters by companyId", async () => {
    const findMany = vi.fn().mockResolvedValue([row()]);
    const prisma = makePrisma({ findMany });
    const svc = new WorkOrdersService(prisma);
    const out = await svc.list(COMPANY, { search: "", page: 1, limit: 50 });
    expect(out).toHaveLength(1);
    expect(findMany).toHaveBeenCalled();
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.deletedAt).toBeNull();
    expect(arg.where.companyId).toBe(COMPANY);
  });

  it("get throws NotFound when findFirst returns null (deleted / cross-tenant)", async () => {
    const prisma = makePrisma();
    const svc = new WorkOrdersService(prisma);
    await expect(svc.get("wo-x", OTHER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("create rejects a foreign-tenant asset (BadRequest)", async () => {
    const prisma = makePrisma();
    (prisma.getClient() as never as { asset: { findFirst: ReturnType<typeof vi.fn> } }).asset.findFirst = vi.fn().mockResolvedValue(null);
    const svc = new WorkOrdersService(prisma);
    await expect(
      svc.create({ title: "X", type: "preventive", assetId: "foreign-asset", priority: "medium" }, COMPANY),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("transition rejects open→completed (the §497 rule)", async () => {
    const prisma = makePrisma();
    (prisma.getClient() as never as { workOrder: { findFirst: ReturnType<typeof vi.fn> } }).workOrder.findFirst = vi.fn().mockResolvedValue(row({ status: "open" }));
    const svc = new WorkOrdersService(prisma);
    await expect(svc.transition("wo-1", "completed", managerUser)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("transition sets completedAt when landing on completed", async () => {
    const update = vi.fn().mockImplementation((args: { data: { status: string; completedAt: Date } }) =>
      Promise.resolve(row({ status: args.data.status, completedAt: args.data.completedAt })),
    );
    const prisma = makePrisma({ update });
    (prisma.getClient() as never as { workOrder: { findFirst: ReturnType<typeof vi.fn> } }).workOrder.findFirst = vi.fn().mockResolvedValue(row({ status: "in_progress" }));
    const svc = new WorkOrdersService(prisma);
    const out = await svc.transition("wo-1", "completed", managerUser);
    expect(update.mock.calls[0][0].data.completedAt).toBeInstanceOf(Date);
    expect(out.status).toBe("completed");
  });

  it("transition 403 when technician not the assignee", async () => {
    const prisma = makePrisma();
    (prisma.getClient() as never as { workOrder: { findFirst: ReturnType<typeof vi.fn> } }).workOrder.findFirst = vi.fn().mockResolvedValue(row({ status: "open", assignedToId: OTHER_USER }));
    const svc = new WorkOrdersService(prisma);
    await expect(svc.transition("wo-1", "in_progress", techUser)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("transition allows technician on their own assigned WO", async () => {
    const update = vi.fn().mockResolvedValue(row({ status: "in_progress", assignedToId: TECH }));
    const prisma = makePrisma({ update });
    (prisma.getClient() as never as { workOrder: { findFirst: ReturnType<typeof vi.fn> } }).workOrder.findFirst = vi.fn().mockResolvedValue(row({ status: "open", assignedToId: TECH }));
    const svc = new WorkOrdersService(prisma);
    const out = await svc.transition("wo-1", "in_progress", techUser);
    expect(out.status).toBe("in_progress");
  });

  it("soft-delete sets deletedAt", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const prisma = makePrisma({ update });
    (prisma.getClient() as never as { workOrder: { findFirst: ReturnType<typeof vi.fn> } }).workOrder.findFirst = vi.fn().mockResolvedValue(row());
    const svc = new WorkOrdersService(prisma);
    await svc.remove("wo-1", COMPANY);
    expect(update).toHaveBeenCalled();
    expect(update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
  });
});
