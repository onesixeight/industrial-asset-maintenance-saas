import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { PartFilters } from "@iam/shared";
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
  const partDeleg = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const client = { part: partDeleg };
  return { getClient: () => client } as unknown as PrismaService;
}

const baseFilters: PartFilters = { search: undefined, lowStock: undefined, page: 1, limit: 50 };

describe("PartsService", () => {
  it("list returns mapped parts for the company", async () => {
    const prisma = makePrisma({
      findMany: vi.fn().mockResolvedValue([part(), part({ id: "part-2" })]),
    });
    const svc = new PartsService(prisma);
    const result = await svc.list(COMPANY, baseFilters);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "part-1", createdAt: "2026-01-01T00:00:00.000Z" });
  });

  it("list with lowStock=true keeps only parts at/below min", async () => {
    const prisma = makePrisma({
      findMany: vi.fn().mockResolvedValue([
        part({ id: "low", quantity: 3, minQuantity: 5 }),
        part({ id: "ok", quantity: 10, minQuantity: 5 }),
        part({ id: "edge", quantity: 5, minQuantity: 5 }),
      ]),
    });
    const svc = new PartsService(prisma);
    const result = await svc.list(COMPANY, { ...baseFilters, lowStock: true });
    expect(result.map((p) => p.id).sort()).toEqual(["edge", "low"]);
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
    await expect(svc.get("part-1", OTHER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("create maps Prisma P2002 (dup sku) to Conflict", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "7.0.0",
    });
    const prisma = makePrisma({ create: vi.fn().mockRejectedValue(p2002) });
    const svc = new PartsService(prisma);
    await expect(
      svc.create({ name: "X", sku: "BRG-001", quantity: 1, minQuantity: 0 }, COMPANY),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("create persists defaults when quantity/minQuantity omitted", async () => {
    const create = vi.fn().mockResolvedValue(part({ quantity: 0, minQuantity: 0 }));
    const prisma = makePrisma({ create });
    const svc = new PartsService(prisma);
    await svc.create({ name: "X", sku: "NEW", quantity: 0, minQuantity: 0 }, COMPANY);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 0, minQuantity: 0 }) }),
    );
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
    await expect(svc.update("part-1", { sku: "TAKEN" }, COMPANY)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("remove throws NotFound on missing part", async () => {
    const prisma = makePrisma();
    const svc = new PartsService(prisma);
    await expect(svc.remove("missing", COMPANY)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("remove deletes after existence check", async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const prisma = makePrisma({ findFirst: vi.fn().mockResolvedValue(part()), delete: del });
    const svc = new PartsService(prisma);
    await svc.remove("part-1", COMPANY);
    expect(del).toHaveBeenCalledWith({ where: { id: "part-1" } });
  });
});
