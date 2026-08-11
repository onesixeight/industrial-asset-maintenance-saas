import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { JwtPayload, PartFilters } from "@iam/shared";
import { PartsService } from "./parts.service";
import type { PrismaService } from "../prisma";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

function part(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "part-1",
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

function makePrisma(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  const minQuantityField = {
    modelName: "Part",
    name: "minQuantity",
    typeName: "Int",
    isList: false,
  };
  const partDeleg = {
    fields: { minQuantity: minQuantityField },
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const inventoryMovement = { create: vi.fn() };
  const client = {
    part: partDeleg,
    inventoryMovement,
    $queryRaw: vi.fn().mockResolvedValue([part()]),
    $transaction: null as unknown,
  };
  client.$transaction = vi.fn(
    async (cb: (tx: typeof client) => Promise<unknown>) => cb(client),
  );
  return { getClient: () => client } as unknown as PrismaService;
}

const baseFilters: PartFilters = {
  search: undefined,
  lowStock: undefined,
  page: 1,
  limit: 50,
};
const managerUser: JwtPayload = {
  sub: "33333333-3333-3333-3333-333333333333",
  companyId: COMPANY,
  role: "manager",
  ver: 0,
  sid: "44444444-4444-4444-8444-444444444444",
  jti: "jti",
  typ: "access",
};

describe("PartsService", () => {
  it("list returns mapped parts for the company", async () => {
    const prisma = makePrisma({
      findMany: vi.fn().mockResolvedValue([part(), part({ id: "part-2" })]),
      count: vi.fn().mockResolvedValue(2),
    });
    const svc = new PartsService(prisma);
    const result = await svc.list(COMPANY, baseFilters);
    expect(result).toMatchObject({ page: 1, pageSize: 50, total: 2 });
    expect(result.items[0]).toMatchObject({
      id: "part-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("paginates low-stock rows in the database using the column reference", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        part({ id: "low", quantity: 3, minQuantity: 5 }),
        part({ id: "edge", quantity: 5, minQuantity: 5 }),
      ]);
    const count = vi.fn().mockResolvedValue(2);
    const prisma = makePrisma({
      findMany,
      count,
    });
    const svc = new PartsService(prisma);
    const result = await svc.list(COMPANY, { ...baseFilters, lowStock: true });
    expect(result.total).toBe(2);
    expect(result.items.map((p) => p.id).sort()).toEqual(["edge", "low"]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          quantity: { lte: expect.objectContaining({ name: "minQuantity" }) },
        }),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: 0,
        take: 50,
      }),
    );
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          quantity: { lte: expect.objectContaining({ name: "minQuantity" }) },
        }),
      }),
    );
  });

  it("get returns the part for the right tenant", async () => {
    const prisma = makePrisma({ findFirst: vi.fn().mockResolvedValue(part()) });
    const svc = new PartsService(prisma);
    const result = await svc.get("part-1", COMPANY);
    expect(result.id).toBe("part-1");
  });

  it("get throws NotFound on cross-tenant", async () => {
    const prisma = makePrisma();
    const svc = new PartsService(prisma);
    await expect(svc.get("part-1", OTHER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("create maps Prisma P2002 (dup sku) to Conflict", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "7.0.0",
    });
    const prisma = makePrisma({ create: vi.fn().mockRejectedValue(p2002) });
    const svc = new PartsService(prisma);
    await expect(
      svc.create(
        { name: "X", sku: "BRG-001", quantity: 1, minQuantity: 0 },
        managerUser,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("create persists defaults when quantity/minQuantity omitted", async () => {
    const create = vi
      .fn()
      .mockResolvedValue(part({ quantity: 0, minQuantity: 0 }));
    const prisma = makePrisma({ create });
    const svc = new PartsService(prisma);
    await svc.create(
      { name: "X", sku: "NEW", quantity: 0, minQuantity: 0 },
      managerUser,
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quantity: 0, minQuantity: 0 }),
      }),
    );
  });

  it("records initial stock as an immutable inventory movement", async () => {
    const create = vi.fn().mockResolvedValue(part({ quantity: 8 }));
    const prisma = makePrisma({ create });
    const client = prisma.getClient() as never as {
      inventoryMovement: { create: ReturnType<typeof vi.fn> };
    };
    const svc = new PartsService(prisma);

    await svc.create(
      { name: "X", sku: "NEW", quantity: 8, minQuantity: 0 },
      managerUser,
    );

    expect(client.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        partId: "part-1",
        actorId: managerUser.sub,
        companyId: COMPANY,
        delta: 8,
        kind: "initial_stock",
      }),
    });
  });

  it("update get-then-updates and returns the new row", async () => {
    const prisma = makePrisma({
      findFirst: vi.fn().mockResolvedValue(part()),
      update: vi.fn().mockResolvedValue(part({ name: "Bearing V2" })),
    });
    const svc = new PartsService(prisma);
    const result = await svc.update("part-1", { name: "Bearing V2" }, COMPANY);
    expect(result.name).toBe("Bearing V2");
  });

  it("update persists null to explicitly clear the description", async () => {
    const update = vi.fn().mockResolvedValue(part({ description: null }));
    const prisma = makePrisma({
      findFirst: vi.fn().mockResolvedValue(part({ description: "Old notes" })),
      update,
    });
    const svc = new PartsService(prisma);

    await svc.update("part-1", { description: null }, COMPANY);

    expect(update).toHaveBeenCalledWith({
      where: { id: "part-1" },
      data: { description: null },
    });
  });

  it("update maps P2002 on sku collision to Conflict", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "7.0.0",
    });
    const prisma = makePrisma({
      findFirst: vi.fn().mockResolvedValue(part()),
      update: vi.fn().mockRejectedValue(p2002),
    });
    const svc = new PartsService(prisma);
    await expect(
      svc.update("part-1", { sku: "TAKEN" }, COMPANY),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("remove throws NotFound on missing part", async () => {
    const prisma = makePrisma();
    const svc = new PartsService(prisma);
    await expect(svc.remove("missing", COMPANY)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("remove deletes after existence check", async () => {
    const update = vi.fn().mockResolvedValue(part({ deletedAt: new Date() }));
    const del = vi.fn();
    const prisma = makePrisma({
      findFirst: vi.fn().mockResolvedValue(part()),
      update,
      delete: del,
    });
    const svc = new PartsService(prisma);
    await svc.remove("part-1", COMPANY);
    expect(update).toHaveBeenCalledWith({
      where: { id: "part-1" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(del).not.toHaveBeenCalled();
  });

  it("lists archived parts separately for the requested tenant", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([part({ deletedAt: new Date() })]);
    const count = vi.fn().mockResolvedValue(1);
    const prisma = makePrisma({ findMany, count });
    const svc = new PartsService(prisma);

    const result = await svc.listArchived(COMPANY, baseFilters);

    expect(result.total).toBe(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: COMPANY,
          deletedAt: { not: null },
        }),
      }),
    );
  });

  it("restores only an archived part from the requested tenant", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findFirst = vi.fn().mockResolvedValue(part());
    const prisma = makePrisma({ updateMany, findFirst });
    const svc = new PartsService(prisma);

    const restored = await svc.restore("part-1", COMPANY);

    expect(restored.id).toBe("part-1");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "part-1", companyId: COMPANY, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
  });

  it("does not restore a missing, active, or cross-tenant part", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = makePrisma({ updateMany });
    const svc = new PartsService(prisma);

    await expect(svc.restore("part-1", OTHER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("adjusts stock through a signed ledger movement", async () => {
    const update = vi.fn().mockResolvedValue(part({ quantity: 14 }));
    const prisma = makePrisma({ update });
    const client = prisma.getClient() as never as {
      inventoryMovement: { create: ReturnType<typeof vi.fn> };
    };
    const svc = new PartsService(prisma);

    const result = await svc.adjust(
      "part-1",
      { delta: 4, reason: "Quarterly restock" },
      managerUser,
    );

    expect(result.quantity).toBe(14);
    expect(update).toHaveBeenCalledWith({
      where: { id: "part-1" },
      data: { quantity: { increment: 4 } },
    });
    expect(client.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        partId: "part-1",
        workOrderId: null,
        actorId: managerUser.sub,
        companyId: COMPANY,
        delta: 4,
        kind: "adjustment",
        reason: "Quarterly restock",
      },
    });
  });

  it("rejects an adjustment that would make stock negative", async () => {
    const prisma = makePrisma();
    const client = prisma.getClient() as never as {
      $queryRaw: ReturnType<typeof vi.fn>;
      part: { update: ReturnType<typeof vi.fn> };
    };
    client.$queryRaw.mockResolvedValueOnce([part({ quantity: 2 })]);
    const svc = new PartsService(prisma);

    await expect(
      svc.adjust(
        "part-1",
        { delta: -3, reason: "Count correction" },
        managerUser,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(client.part.update).not.toHaveBeenCalled();
  });
});
