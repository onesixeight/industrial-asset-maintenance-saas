import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { JwtPayload } from "@iam/shared";
import { WorkOrderPartsService } from "./work-order-parts.service";
import type { PrismaService } from "../prisma";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const WO = "wo-1";
const PART = "part-1";
const TECH = "44444444-4444-4444-4444-444444444444";
const OTHER_USER = "55555555-5555-5555-5555-555555555555";
const MANAGER = "66666666-6666-6666-6666-666666666666";

function part(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PART,
    name: "Bearing",
    sku: "BRG-001",
    description: null,
    quantity: 10,
    minQuantity: 5,
    companyId: COMPANY,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function woPart(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "wop-1",
    workOrderId: WO,
    partId: PART,
    quantity: 3,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    part: part(),
    ...overrides,
  };
}

/**
 * Build a mocked PrismaService whose `$transaction` invokes the callback with
 * the same client (no real rollback) — sufficient for unit-level behavior.
 */
function makePrisma(delegOverrides: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {}) {
  const workOrder = {
    findFirst: vi.fn().mockResolvedValue(null),
    ...delegOverrides.workOrder,
  };
  const part = {
    findFirst: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
    ...delegOverrides.part,
  };
  const workOrderPart = {
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ...delegOverrides.workOrderPart,
  };
  const user = { findMany: vi.fn().mockResolvedValue([]), ...delegOverrides.user };
  const notification = { createMany: vi.fn(), ...delegOverrides.notification };
  const client = { workOrder, part, workOrderPart, user, notification, $transaction: null as unknown };
  client.$transaction = vi.fn(async (cb: (tx: typeof client) => Promise<unknown>) => cb(client));
  return { getClient: () => client } as unknown as PrismaService;
}

const techOwner: JwtPayload = {
  sub: TECH,
  companyId: COMPANY,
  role: "technician",
  jti: "jti",
  typ: "access",
};
const managerUser: JwtPayload = { ...techOwner, sub: MANAGER, role: "manager" };

describe("WorkOrderPartsService", () => {
  it("consume decrements stock and creates a WorkOrderPart line", async () => {
    const partUpdate = vi.fn().mockResolvedValue(part({ quantity: 7 }));
    const wopCreate = vi.fn().mockResolvedValue(woPart());
    const prisma = makePrisma({
      workOrder: { findFirst: vi.fn().mockResolvedValue({ id: WO, companyId: COMPANY, assignedToId: TECH }) },
      part: { findFirst: vi.fn().mockResolvedValue(part()), update: partUpdate },
      workOrderPart: { findUnique: vi.fn().mockResolvedValue(null), create: wopCreate },
    });
    const svc = new WorkOrderPartsService(prisma);
    const result = await svc.consume(WO, { partId: PART, quantity: 3 }, techOwner);
    expect(partUpdate).toHaveBeenCalledWith({ where: { id: PART }, data: { quantity: 7 } });
    expect(wopCreate).toHaveBeenCalled();
    expect(result.partId).toBe(PART);
  });

  it("consume accumulates onto an existing WorkOrderPart line", async () => {
    const wopUpdate = vi.fn().mockResolvedValue(woPart({ quantity: 6 }));
    const prisma = makePrisma({
      workOrder: { findFirst: vi.fn().mockResolvedValue({ id: WO, companyId: COMPANY, assignedToId: TECH }) },
      part: { findFirst: vi.fn().mockResolvedValue(part()), update: vi.fn().mockResolvedValue(part({ quantity: 4 })) },
      workOrderPart: { findUnique: vi.fn().mockResolvedValue(woPart({ quantity: 3 })), update: wopUpdate },
    });
    const svc = new WorkOrderPartsService(prisma);
    await svc.consume(WO, { partId: PART, quantity: 3 }, techOwner);
    expect(wopUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { quantity: 6 } }));
  });

  it("consume with insufficient stock → 409 and no decrement", async () => {
    const partUpdate = vi.fn();
    const prisma = makePrisma({
      workOrder: { findFirst: vi.fn().mockResolvedValue({ id: WO, companyId: COMPANY, assignedToId: TECH }) },
      part: { findFirst: vi.fn().mockResolvedValue(part({ quantity: 2 })), update: partUpdate },
    });
    const svc = new WorkOrderPartsService(prisma);
    await expect(svc.consume(WO, { partId: PART, quantity: 3 }, techOwner)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(partUpdate).not.toHaveBeenCalled();
  });

  it("technician not assigned to the WO → 403", async () => {
    const prisma = makePrisma({
      workOrder: { findFirst: vi.fn().mockResolvedValue({ id: WO, companyId: COMPANY, assignedToId: OTHER_USER }) },
    });
    const svc = new WorkOrderPartsService(prisma);
    await expect(svc.consume(WO, { partId: PART, quantity: 1 }, techOwner)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("cross-tenant WO → 404", async () => {
    const prisma = makePrisma();
    const svc = new WorkOrderPartsService(prisma);
    await expect(
      svc.consume(WO, { partId: PART, quantity: 1 }, { ...techOwner, companyId: OTHER }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("low-stock crossing creates a Notification for managers", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = makePrisma({
      workOrder: { findFirst: vi.fn().mockResolvedValue({ id: WO, companyId: COMPANY, assignedToId: TECH }) },
      // quantity 6 → after consuming 3 → 3 (at/below min 5): crossing
      part: {
        findFirst: vi.fn().mockResolvedValue(part({ quantity: 6, minQuantity: 5 })),
        update: vi.fn().mockResolvedValue(part({ quantity: 3, minQuantity: 5 })),
      },
      user: { findMany: vi.fn().mockResolvedValue([{ id: MANAGER }]) },
      notification: { createMany },
      workOrderPart: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(woPart()) },
    });
    const svc = new WorkOrderPartsService(prisma);
    await svc.consume(WO, { partId: PART, quantity: 3 }, techOwner);
    expect(createMany).toHaveBeenCalledWith({
      data: [{ userId: MANAGER, title: "Low stock alert", message: expect.any(String) }],
    });
  });

  it("does NOT fire low-stock when already at/below min", async () => {
    const createMany = vi.fn();
    const prisma = makePrisma({
      workOrder: { findFirst: vi.fn().mockResolvedValue({ id: WO, companyId: COMPANY, assignedToId: TECH }) },
      // already below min (qty 4, min 5) → consuming more should NOT fire
      part: {
        findFirst: vi.fn().mockResolvedValue(part({ quantity: 4, minQuantity: 5 })),
        update: vi.fn().mockResolvedValue(part({ quantity: 2, minQuantity: 5 })),
      },
      notification: { createMany },
      workOrderPart: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(woPart()) },
    });
    const svc = new WorkOrderPartsService(prisma);
    await svc.consume(WO, { partId: PART, quantity: 2 }, techOwner);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("restock restores quantity and deletes the WorkOrderPart line", async () => {
    const partUpdate = vi.fn().mockResolvedValue(part({ quantity: 13 }));
    const wopDelete = vi.fn();
    const prisma = makePrisma({
      workOrderPart: {
        findFirst: vi.fn().mockResolvedValue(woPart({ quantity: 3, part: part({ quantity: 10 }) })),
        delete: wopDelete,
      },
      part: { update: partUpdate },
    });
    const svc = new WorkOrderPartsService(prisma);
    await svc.restock(WO, PART, COMPANY);
    expect(partUpdate).toHaveBeenCalledWith({ where: { id: PART }, data: { quantity: 13 } });
    expect(wopDelete).toHaveBeenCalledWith({ where: { id: "wop-1" } });
  });

  it("restock does NOT fire low-stock trigger", async () => {
    const createMany = vi.fn();
    const prisma = makePrisma({
      workOrderPart: {
        findFirst: vi.fn().mockResolvedValue(woPart({ part: part({ quantity: 0, minQuantity: 5 }) })),
        delete: vi.fn(),
      },
      part: { update: vi.fn() },
      notification: { createMany },
    });
    const svc = new WorkOrderPartsService(prisma);
    await svc.restock(WO, PART, COMPANY);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("restock on missing line → 404", async () => {
    const prisma = makePrisma();
    const svc = new WorkOrderPartsService(prisma);
    await expect(svc.restock(WO, PART, COMPANY)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("list returns empty for cross-tenant WO", async () => {
    const prisma = makePrisma();
    const svc = new WorkOrderPartsService(prisma);
    const result = await svc.list(WO, OTHER);
    expect(result).toEqual([]);
  });

  it("list returns mapped lines for the tenant", async () => {
    const prisma = makePrisma({
      workOrder: { findFirst: vi.fn().mockResolvedValue({ id: WO }) },
      workOrderPart: { findMany: vi.fn().mockResolvedValue([woPart()]) },
    });
    const svc = new WorkOrderPartsService(prisma);
    const result = await svc.list(WO, COMPANY);
    expect(result).toHaveLength(1);
    expect(result[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("manager can consume on a WO they don't own", async () => {
    const prisma = makePrisma({
      workOrder: { findFirst: vi.fn().mockResolvedValue({ id: WO, companyId: COMPANY, assignedToId: OTHER_USER }) },
      part: { findFirst: vi.fn().mockResolvedValue(part()), update: vi.fn().mockResolvedValue(part({ quantity: 7 })) },
      workOrderPart: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(woPart()) },
    });
    const svc = new WorkOrderPartsService(prisma);
    const result = await svc.consume(WO, { partId: PART, quantity: 3 }, managerUser);
    expect(result.partId).toBe(PART);
  });
});
