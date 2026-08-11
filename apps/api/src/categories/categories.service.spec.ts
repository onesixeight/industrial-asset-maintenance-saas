import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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
    count: vi.fn().mockResolvedValue(0),
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
  it("list filters by companyId and returns pagination metadata", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "c1" }]);
    const count = vi.fn().mockResolvedValue(6);
    const prisma = makePrisma({ findMany, count });
    const svc = new CategoriesService(prisma);
    const out = await svc.list(COMPANY, { search: "pump", page: 2, limit: 2 });
    const where = {
      companyId: COMPANY,
      name: { contains: "pump", mode: "insensitive" },
    };
    expect(out).toEqual({
      items: [{ id: "c1" }],
      page: 2,
      pageSize: 2,
      total: 6,
    });
    expect(findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: 2,
      take: 2,
    });
    expect(count).toHaveBeenCalledWith({ where });
  });

  it("get throws NotFound when findFirst returns null (cross-tenant)", async () => {
    const prisma = makePrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    const svc = new CategoriesService(prisma);
    await expect(svc.get("cat-x", OTHER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("create passes companyId through", async () => {
    const create = vi.fn().mockResolvedValue({ id: "c1", companyId: COMPANY });
    const prisma = makePrisma({ create });
    const svc = new CategoriesService(prisma);
    const out = await svc.create({ name: "Pumps" }, COMPANY);
    expect(out).toEqual({ id: "c1", companyId: COMPANY });
    expect(create).toHaveBeenCalledWith({
      data: { name: "Pumps", companyId: COMPANY },
    });
  });

  it("remove throws Conflict when assets exist (counts by categoryId)", async () => {
    const count = vi.fn().mockResolvedValue(2);
    const prisma = makePrisma(
      {
        findFirst: vi.fn().mockResolvedValue({ id: "c1", companyId: COMPANY }),
      },
      { count },
    );
    const svc = new CategoriesService(prisma);
    await expect(svc.remove("c1", COMPANY)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(count).toHaveBeenCalledWith({
      where: { categoryId: "c1", companyId: COMPANY },
    });
  });

  it("remove deletes when no assets", async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const prisma = makePrisma(
      {
        findFirst: vi.fn().mockResolvedValue({ id: "c1", companyId: COMPANY }),
        delete: del,
      },
      { count: vi.fn().mockResolvedValue(0) },
    );
    const svc = new CategoriesService(prisma);
    await svc.remove("c1", COMPANY);
    expect(del).toHaveBeenCalledWith({ where: { id: "c1" } });
  });

  it("remove maps a P2003 delete race to Conflict", async () => {
    const p2003 = new Prisma.PrismaClientKnownRequestError("foreign key", {
      code: "P2003",
      clientVersion: "7.9.1",
    });
    const prisma = makePrisma(
      {
        findFirst: vi.fn().mockResolvedValue({ id: "c1", companyId: COMPANY }),
        delete: vi.fn().mockRejectedValue(p2003),
      },
      { count: vi.fn().mockResolvedValue(0) },
    );
    const svc = new CategoriesService(prisma);

    await expect(svc.remove("c1", COMPANY)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
