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
function makePrisma(
  delegOverrides: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {},
  rawResults: unknown[][] = [],
) {
  const workOrder = {
    findFirst: vi.fn().mockResolvedValue(null),
    ...delegOverrides.workOrder,
  };
  const part = {
    findFirst: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
    updateMany: vi.fn(),
    ...delegOverrides.part,
  };
  const workOrderPart = {
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    ...delegOverrides.workOrderPart,
  };
  const user = {
    findMany: vi.fn().mockResolvedValue([]),
    ...delegOverrides.user,
  };
  const notification = { createMany: vi.fn(), ...delegOverrides.notification };
  const inventoryMovement = {
    create: vi.fn(),
    ...delegOverrides.inventoryMovement,
  };
  const $queryRaw = vi
    .fn()
    .mockImplementation((query: TemplateStringsArray) => {
      const sql = query.join("?");
      if (sql.includes('FROM "WorkOrder"') && sql.includes("FOR UPDATE")) {
        return workOrder
          .findFirst()
          .then((row: { id: string; assignedToId?: string | null } | null) =>
            row ? [{ id: row.id, assignedToId: row.assignedToId ?? null }] : [],
          );
      }
      return Promise.resolve(rawResults.shift() ?? []);
    });
  const client = {
    workOrder,
    part,
    workOrderPart,
    user,
    notification,
    inventoryMovement,
    $queryRaw,
    $transaction: null as unknown,
  };
  client.$transaction = vi.fn(
    async (cb: (tx: typeof client) => Promise<unknown>) => cb(client),
  );
  return { getClient: () => client } as unknown as PrismaService;
}

const techOwner: JwtPayload = {
  sub: TECH,
  companyId: COMPANY,
  role: "technician",
  ver: 0,
  sid: "44444444-4444-4444-8444-444444444444",
  jti: "jti",
  typ: "access",
};
const managerUser: JwtPayload = { ...techOwner, sub: MANAGER, role: "manager" };
const viewerUser: JwtPayload = {
  ...techOwner,
  sub: OTHER_USER,
  role: "viewer",
};

describe("WorkOrderPartsService", () => {
  it("consume decrements stock and creates a WorkOrderPart line", async () => {
    const partUpdate = vi.fn().mockResolvedValue(part({ quantity: 7 }));
    const upsert = vi.fn().mockResolvedValue(woPart());
    const prisma = makePrisma(
      {
        workOrder: {
          findFirst: vi.fn().mockResolvedValue({
            id: WO,
            companyId: COMPANY,
            assignedToId: TECH,
          }),
        },
        part: { update: partUpdate },
        workOrderPart: { upsert },
      },
      [[part()]],
    );
    const svc = new WorkOrderPartsService(prisma);
    const result = await svc.consume(
      WO,
      { partId: PART, quantity: 3 },
      techOwner,
    );
    expect(partUpdate).toHaveBeenCalledWith({
      where: { id: PART },
      data: { quantity: { decrement: 3 } },
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { workOrderId: WO, partId: PART, quantity: 3 },
        update: { quantity: { increment: 3 } },
      }),
    );
    const client = prisma.getClient() as never as {
      inventoryMovement: { create: ReturnType<typeof vi.fn> };
    };
    expect(client.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        partId: PART,
        workOrderId: WO,
        actorId: TECH,
        companyId: COMPANY,
        delta: -3,
        kind: "consumption",
        reason: "Consumed for work order wo-1",
      },
    });
    const raw = (
      prisma.getClient() as never as { $queryRaw: ReturnType<typeof vi.fn> }
    ).$queryRaw;
    expect((raw.mock.calls[0][0] as TemplateStringsArray).join("?")).toContain(
      'FROM "WorkOrder"',
    );
    expect((raw.mock.calls[0][0] as TemplateStringsArray).join("?")).toContain(
      "FOR UPDATE",
    );
    expect((raw.mock.calls[1][0] as TemplateStringsArray).join("?")).toContain(
      'FROM "Part"',
    );
    expect(result.partId).toBe(PART);
  });

  it("consume accumulates onto an existing WorkOrderPart line", async () => {
    const upsert = vi.fn().mockResolvedValue(woPart({ quantity: 6 }));
    const prisma = makePrisma(
      {
        workOrder: {
          findFirst: vi.fn().mockResolvedValue({
            id: WO,
            companyId: COMPANY,
            assignedToId: TECH,
          }),
        },
        part: { update: vi.fn().mockResolvedValue(part({ quantity: 4 })) },
        workOrderPart: { upsert },
      },
      [[part()]],
    );
    const svc = new WorkOrderPartsService(prisma);
    await svc.consume(WO, { partId: PART, quantity: 3 }, techOwner);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { quantity: { increment: 3 } } }),
    );
  });

  it("consume with insufficient stock → 409 and no decrement", async () => {
    const partUpdate = vi.fn();
    const prisma = makePrisma(
      {
        workOrder: {
          findFirst: vi.fn().mockResolvedValue({
            id: WO,
            companyId: COMPANY,
            assignedToId: TECH,
          }),
        },
        part: { update: partUpdate },
      },
      [[part({ quantity: 2 })]],
    );
    const svc = new WorkOrderPartsService(prisma);
    await expect(
      svc.consume(WO, { partId: PART, quantity: 3 }, techOwner),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(partUpdate).not.toHaveBeenCalled();
  });

  it("technician not assigned to the WO → 403", async () => {
    const prisma = makePrisma({
      workOrder: {
        findFirst: vi.fn().mockResolvedValue({
          id: WO,
          companyId: COMPANY,
          assignedToId: OTHER_USER,
        }),
      },
    });
    const svc = new WorkOrderPartsService(prisma);
    await expect(
      svc.consume(WO, { partId: PART, quantity: 1 }, techOwner),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("viewer cannot consume inventory on any work order", async () => {
    const prisma = makePrisma({
      workOrder: {
        findFirst: vi.fn().mockResolvedValue({
          id: WO,
          companyId: COMPANY,
          assignedToId: OTHER_USER,
        }),
      },
    });
    const svc = new WorkOrderPartsService(prisma);

    await expect(
      svc.consume(WO, { partId: PART, quantity: 1 }, viewerUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("cross-tenant WO → 404", async () => {
    const prisma = makePrisma();
    const svc = new WorkOrderPartsService(prisma);
    await expect(
      svc.consume(
        WO,
        { partId: PART, quantity: 1 },
        { ...techOwner, companyId: OTHER },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("low-stock crossing creates a Notification for managers", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = makePrisma(
      {
        workOrder: {
          findFirst: vi.fn().mockResolvedValue({
            id: WO,
            companyId: COMPANY,
            assignedToId: TECH,
          }),
        },
        // quantity 6 → after consuming 3 → 3 (at/below min 5): crossing
        part: {
          update: vi
            .fn()
            .mockResolvedValue(part({ quantity: 3, minQuantity: 5 })),
        },
        user: { findMany: vi.fn().mockResolvedValue([{ id: MANAGER }]) },
        notification: { createMany },
        workOrderPart: { upsert: vi.fn().mockResolvedValue(woPart()) },
      },
      [[part({ quantity: 6, minQuantity: 5 })]],
    );
    const svc = new WorkOrderPartsService(prisma);
    await svc.consume(WO, { partId: PART, quantity: 3 }, techOwner);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: MANAGER,
          title: "Low stock alert",
          message: expect.any(String),
        },
      ],
    });
  });

  it("does NOT fire low-stock when already at/below min", async () => {
    const createMany = vi.fn();
    const prisma = makePrisma(
      {
        workOrder: {
          findFirst: vi.fn().mockResolvedValue({
            id: WO,
            companyId: COMPANY,
            assignedToId: TECH,
          }),
        },
        // already below min (qty 4, min 5) → consuming more should NOT fire
        part: {
          update: vi
            .fn()
            .mockResolvedValue(part({ quantity: 2, minQuantity: 5 })),
        },
        notification: { createMany },
        workOrderPart: { upsert: vi.fn().mockResolvedValue(woPart()) },
      },
      [[part({ quantity: 4, minQuantity: 5 })]],
    );
    const svc = new WorkOrderPartsService(prisma);
    await svc.consume(WO, { partId: PART, quantity: 2 }, techOwner);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("restock restores quantity and deletes the WorkOrderPart line", async () => {
    const partUpdate = vi.fn();
    const wopDelete = vi.fn();
    const prisma = makePrisma(
      {
        workOrderPart: {
          delete: wopDelete,
        },
        part: { update: partUpdate },
      },
      [[{ id: PART }], [{ id: "wop-1", quantity: 3 }]],
    );
    const svc = new WorkOrderPartsService(prisma);
    await svc.restock(WO, PART, managerUser);
    expect(partUpdate).toHaveBeenCalledWith({
      where: { id: PART },
      data: { quantity: { increment: 3 } },
    });
    expect(wopDelete).toHaveBeenCalledWith({ where: { id: "wop-1" } });
    const client = prisma.getClient() as never as {
      inventoryMovement: { create: ReturnType<typeof vi.fn> };
    };
    expect(client.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        partId: PART,
        workOrderId: WO,
        actorId: MANAGER,
        companyId: COMPANY,
        delta: 3,
        kind: "restock",
        reason: "Restocked from work order wo-1",
      },
    });
  });

  it("restock does NOT fire low-stock trigger", async () => {
    const createMany = vi.fn();
    const prisma = makePrisma(
      {
        workOrderPart: {
          delete: vi.fn(),
        },
        part: { update: vi.fn() },
        notification: { createMany },
      },
      [[{ id: PART }], [{ id: "wop-1", quantity: 3 }]],
    );
    const svc = new WorkOrderPartsService(prisma);
    await svc.restock(WO, PART, managerUser);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("restock on missing line → 404", async () => {
    const prisma = makePrisma({}, [[{ id: PART }], []]);
    const svc = new WorkOrderPartsService(prisma);
    await expect(svc.restock(WO, PART, managerUser)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("restock on missing part → 404", async () => {
    const prisma = makePrisma({}, [[]]);
    const svc = new WorkOrderPartsService(prisma);
    await expect(svc.restock(WO, PART, managerUser)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("list returns empty for cross-tenant WO", async () => {
    const prisma = makePrisma();
    const svc = new WorkOrderPartsService(prisma);
    const result = await svc.list(WO, OTHER);
    expect(result).toEqual([]);
  });

  it("list returns mapped lines for the tenant", async () => {
    const findMany = vi.fn().mockResolvedValue([woPart()]);
    const prisma = makePrisma({
      workOrder: { findFirst: vi.fn().mockResolvedValue({ id: WO }) },
      workOrderPart: { findMany },
    });
    const svc = new WorkOrderPartsService(prisma);
    const result = await svc.list(WO, COMPANY);
    expect(result).toHaveLength(1);
    expect(result[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(findMany).toHaveBeenCalledWith({
      where: { workOrderId: WO },
      include: { part: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  });

  it("manager can consume on a WO they don't own", async () => {
    const prisma = makePrisma(
      {
        workOrder: {
          findFirst: vi.fn().mockResolvedValue({
            id: WO,
            companyId: COMPANY,
            assignedToId: OTHER_USER,
          }),
        },
        part: { update: vi.fn().mockResolvedValue(part({ quantity: 7 })) },
        workOrderPart: { upsert: vi.fn().mockResolvedValue(woPart()) },
      },
      [[part()]],
    );
    const svc = new WorkOrderPartsService(prisma);
    const result = await svc.consume(
      WO,
      { partId: PART, quantity: 3 },
      managerUser,
    );
    expect(result.partId).toBe(PART);
  });
});
