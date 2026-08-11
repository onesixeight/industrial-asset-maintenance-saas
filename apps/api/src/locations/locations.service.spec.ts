import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { LocationsService } from "./locations.service";
import type { PrismaService } from "../prisma";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

/** Minimal mock: only the prisma paths this service touches. */
function makePrisma(
  loc: Record<string, ReturnType<typeof vi.fn>> = {},
  ast: Record<string, ReturnType<typeof vi.fn>> = {},
): PrismaService {
  const location = {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ...loc,
  };
  const asset = { count: vi.fn().mockResolvedValue(0), ...ast };
  const client = { location, asset };
  return { getClient: () => client } as unknown as PrismaService;
}

describe("LocationsService", () => {
  it("list filters by companyId and optional search", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "l1" }]);
    const count = vi.fn().mockResolvedValue(9);
    const prisma = makePrisma({ findMany, count });
    const svc = new LocationsService(prisma);
    const out = await svc.list(COMPANY, { search: "plan", page: 2, limit: 4 });
    const where = {
      companyId: COMPANY,
      name: { contains: "plan", mode: "insensitive" },
    };
    expect(out).toEqual({
      items: [{ id: "l1" }],
      page: 2,
      pageSize: 4,
      total: 9,
    });
    expect(findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: 4,
      take: 4,
    });
    expect(count).toHaveBeenCalledWith({ where });
  });

  it("get throws NotFound when findFirst returns null (cross-tenant)", async () => {
    const prisma = makePrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    const svc = new LocationsService(prisma);
    await expect(svc.get("loc-x", OTHER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("create passes companyId through", async () => {
    const create = vi.fn().mockResolvedValue({ id: "l1", companyId: COMPANY });
    const prisma = makePrisma({ create });
    const svc = new LocationsService(prisma);
    const out = await svc.create({ name: "Warehouse" }, COMPANY);
    expect(out).toEqual({ id: "l1", companyId: COMPANY });
    expect(create).toHaveBeenCalledWith({
      data: { name: "Warehouse", companyId: COMPANY },
    });
  });

  it("remove throws Conflict when assets exist", async () => {
    const prisma = makePrisma(
      {
        findFirst: vi.fn().mockResolvedValue({ id: "l1", companyId: COMPANY }),
      },
      { count: vi.fn().mockResolvedValue(3) },
    );
    const svc = new LocationsService(prisma);
    await expect(svc.remove("l1", COMPANY)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("remove deletes when no assets", async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const prisma = makePrisma(
      {
        findFirst: vi.fn().mockResolvedValue({ id: "l1", companyId: COMPANY }),
        delete: del,
      },
      { count: vi.fn().mockResolvedValue(0) },
    );
    const svc = new LocationsService(prisma);
    await svc.remove("l1", COMPANY);
    expect(del).toHaveBeenCalledWith({ where: { id: "l1" } });
  });

  it("remove maps a P2003 delete race to Conflict", async () => {
    const p2003 = new Prisma.PrismaClientKnownRequestError("foreign key", {
      code: "P2003",
      clientVersion: "7.9.1",
    });
    const prisma = makePrisma(
      {
        findFirst: vi.fn().mockResolvedValue({ id: "l1", companyId: COMPANY }),
        delete: vi.fn().mockRejectedValue(p2003),
      },
      { count: vi.fn().mockResolvedValue(0) },
    );
    const svc = new LocationsService(prisma);

    await expect(svc.remove("l1", COMPANY)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
