import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { CategoriesService } from "./categories.service";
import type { PrismaService } from "../prisma";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

function makePrisma(
  cat: Record<string, ReturnType<typeof vi.fn>> = {},
  ast: Record<string, ReturnType<typeof vi.fn>> = {},
): PrismaService {
  const category = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ...cat,
  };
  const asset = { count: vi.fn().mockResolvedValue(0), ...ast };
  const client = { category, asset };
  return { getClient: () => client } as unknown as PrismaService;
}

describe("CategoriesService", () => {
  it("list filters by companyId", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "c1" }]);
    const prisma = makePrisma({ findMany });
    const svc = new CategoriesService(prisma);
    const out = await svc.list(COMPANY);
    expect(out).toEqual([{ id: "c1" }]);
    expect(findMany).toHaveBeenCalledWith({
      where: { companyId: COMPANY, name: undefined },
      orderBy: { name: "asc" },
    });
  });

  it("get throws NotFound when findFirst returns null (cross-tenant)", async () => {
    const prisma = makePrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    const svc = new CategoriesService(prisma);
    await expect(svc.get("cat-x", OTHER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("create passes companyId through", async () => {
    const create = vi.fn().mockResolvedValue({ id: "c1", companyId: COMPANY });
    const prisma = makePrisma({ create });
    const svc = new CategoriesService(prisma);
    const out = await svc.create({ name: "Pumps" }, COMPANY);
    expect(out).toEqual({ id: "c1", companyId: COMPANY });
    expect(create).toHaveBeenCalledWith({ data: { name: "Pumps", companyId: COMPANY } });
  });

  it("remove throws Conflict when assets exist (counts by categoryId)", async () => {
    const count = vi.fn().mockResolvedValue(2);
    const prisma = makePrisma(
      { findFirst: vi.fn().mockResolvedValue({ id: "c1", companyId: COMPANY }) },
      { count },
    );
    const svc = new CategoriesService(prisma);
    await expect(svc.remove("c1", COMPANY)).rejects.toBeInstanceOf(ConflictException);
    expect(count).toHaveBeenCalledWith({ where: { categoryId: "c1", companyId: COMPANY } });
  });

  it("remove deletes when no assets", async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const prisma = makePrisma(
      { findFirst: vi.fn().mockResolvedValue({ id: "c1", companyId: COMPANY }), delete: del },
      { count: vi.fn().mockResolvedValue(0) },
    );
    const svc = new CategoriesService(prisma);
    await svc.remove("c1", COMPANY);
    expect(del).toHaveBeenCalledWith({ where: { id: "c1" } });
  });
});
