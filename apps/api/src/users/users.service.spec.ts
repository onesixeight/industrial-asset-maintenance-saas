import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { UsersService } from "./users.service";
import type { PrismaService } from "../prisma";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

function makePrisma(usr: Record<string, ReturnType<typeof vi.fn>> = {}): PrismaService {
  const user = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    ...usr,
  };
  return { getClient: () => ({ user }) } as unknown as PrismaService;
}

describe("UsersService", () => {
  it("list maps rows to UserResponse (no password) and filters by companyId", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "u1", email: "a@b.test", firstName: "A", lastName: "B", role: "viewer", companyId: COMPANY, mustChangePassword: true, password: "hash" },
    ]);
    const prisma = makePrisma({ findMany });
    const svc = new UsersService(prisma);
    const out = await svc.list(COMPANY);
    expect(findMany).toHaveBeenCalledWith({ where: { companyId: COMPANY }, orderBy: { createdAt: "asc" } });
    expect(out).toEqual([
      { id: "u1", email: "a@b.test", firstName: "A", lastName: "B", role: "viewer", companyId: COMPANY, mustChangePassword: true },
    ]);
    expect(out[0]).not.toHaveProperty("password");
  });

  it("create hashes the password, sets mustChangePassword=true, and returns no password", async () => {
    const create = vi.fn().mockImplementation((args: { data: { password: string; mustChangePassword: boolean } }) =>
      Promise.resolve({
        id: "u1", email: "new@b.test", firstName: "N", lastName: "U", role: "viewer",
        companyId: COMPANY, mustChangePassword: args.data.mustChangePassword, password: args.data.password,
      }),
    );
    const prisma = makePrisma({ create });
    const svc = new UsersService(prisma);
    const out = await svc.create(
      { email: "new@b.test", firstName: "N", lastName: "U", role: "viewer", password: "TempPass1" },
      COMPANY,
    );
    expect(create).toHaveBeenCalled();
    const data = create.mock.calls[0][0].data;
    expect(data.mustChangePassword).toBe(true);
    expect(data.password).not.toBe("TempPass1"); // hashed
    expect(out.mustChangePassword).toBe(true);
    expect(out).not.toHaveProperty("password");
  });

  it("create maps a P2002 (dup email) to ConflictException", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("unique", {
      code: "P2002",
      clientVersion: "7.8.0",
    });
    const create = vi.fn().mockImplementation(() => {
      throw p2002;
    });
    const prisma = makePrisma({ create });
    const svc = new UsersService(prisma);
    await expect(
      svc.create(
        { email: "dup@b.test", firstName: "D", lastName: "U", role: "viewer", password: "TempPass1" },
        COMPANY,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("changeRole throws NotFound when findFirst returns null (cross-tenant)", async () => {
    const prisma = makePrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    const svc = new UsersService(prisma);
    await expect(svc.changeRole("u-x", "manager", OTHER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("changeRole updates and returns the new role", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "u1", email: "a@b.test", firstName: "A", lastName: "B", role: "manager",
      companyId: COMPANY, mustChangePassword: false,
    });
    const prisma = makePrisma({
      findFirst: vi.fn().mockResolvedValue({ id: "u1", companyId: COMPANY }),
      update,
    });
    const svc = new UsersService(prisma);
    const out = await svc.changeRole("u1", "manager", COMPANY);
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { role: "manager" } });
    expect(out.role).toBe("manager");
  });
});
