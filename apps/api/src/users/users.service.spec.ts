import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CreateUserRequest } from "@iam/shared";
import { describe, expect, it, vi } from "vitest";
import { UsersService } from "./users.service";
import type { PrismaService } from "../prisma";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const ADMIN = "33333333-3333-3333-3333-333333333333";
const adminActor = { sub: ADMIN, companyId: COMPANY };

function makePrisma(
  usr: Record<string, ReturnType<typeof vi.fn>> = {},
): PrismaService {
  const user = {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    ...usr,
  };
  return { getClient: () => ({ user }) } as unknown as PrismaService;
}

describe("UsersService", () => {
  it("rejects a manager creating an admin", async () => {
    const svc = new UsersService(makePrisma());
    const createAsActor = svc.create as unknown as (
      actor: { companyId: string; role: "manager" },
      input: CreateUserRequest,
    ) => Promise<unknown>;

    await expect(
      createAsActor.call(
        svc,
        { companyId: COMPANY, role: "manager" },
        {
          email: "admin@b.test",
          firstName: "A",
          lastName: "Dmin",
          role: "admin",
          password: "TempPass1",
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows a manager to create a non-admin user", async () => {
    const create = vi
      .fn()
      .mockImplementation(async (args: { data: Record<string, unknown> }) => ({
        id: "u-tech",
        ...args.data,
      }));
    const svc = new UsersService(makePrisma({ create }));

    const created = await svc.create(
      { companyId: COMPANY, role: "manager" },
      {
        email: "tech@b.test",
        firstName: "Tess",
        lastName: "Tech",
        role: "technician",
        password: "TempPass1",
      },
    );

    expect(created.role).toBe("technician");
    expect(created.companyId).toBe(COMPANY);
  });

  it("list maps rows to UserResponse (no password) and filters by companyId", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "u1",
        email: "a@b.test",
        firstName: "A",
        lastName: "B",
        role: "viewer",
        companyId: COMPANY,
        mustChangePassword: true,
        password: "hash",
      },
    ]);
    const count = vi.fn().mockResolvedValue(12);
    const prisma = makePrisma({ findMany, count });
    const svc = new UsersService(prisma);
    const out = await svc.list(COMPANY, { search: "ali", page: 3, limit: 5 });
    const where = {
      companyId: COMPANY,
      OR: [
        { email: { contains: "ali", mode: "insensitive" } },
        { firstName: { contains: "ali", mode: "insensitive" } },
        { lastName: { contains: "ali", mode: "insensitive" } },
      ],
    };
    expect(findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: 10,
      take: 5,
    });
    expect(count).toHaveBeenCalledWith({ where });
    expect(out).toEqual({
      items: [
        {
          id: "u1",
          email: "a@b.test",
          firstName: "A",
          lastName: "B",
          role: "viewer",
          companyId: COMPANY,
          mustChangePassword: true,
        },
      ],
      page: 3,
      pageSize: 5,
      total: 12,
    });
    expect(out.items[0]).not.toHaveProperty("password");
  });

  it("gets one user only from the caller's company and omits the password", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "u-51",
      email: "late@example.test",
      firstName: "Late",
      lastName: "Assignee",
      role: "technician",
      companyId: COMPANY,
      mustChangePassword: false,
      password: "hash",
    });
    const svc = new UsersService(makePrisma({ findFirst }));

    const result = await svc.get("u-51", COMPANY);

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "u-51", companyId: COMPANY },
    });
    expect(result.email).toBe("late@example.test");
    expect(result).not.toHaveProperty("password");
  });

  it("does not reveal a user from another company", async () => {
    const svc = new UsersService(
      makePrisma({ findFirst: vi.fn().mockResolvedValue(null) }),
    );

    await expect(svc.get("u-51", OTHER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("create hashes the password, sets mustChangePassword=true, and returns no password", async () => {
    const create = vi
      .fn()
      .mockImplementation(
        (args: { data: { password: string; mustChangePassword: boolean } }) =>
          Promise.resolve({
            id: "u1",
            email: "new@b.test",
            firstName: "N",
            lastName: "U",
            role: "viewer",
            companyId: COMPANY,
            mustChangePassword: args.data.mustChangePassword,
            password: args.data.password,
          }),
      );
    const prisma = makePrisma({ create });
    const svc = new UsersService(prisma);
    const out = await svc.create(
      { companyId: COMPANY, role: "admin" },
      {
        email: "new@b.test",
        firstName: "N",
        lastName: "U",
        role: "viewer",
        password: "TempPass1",
      },
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
        { companyId: COMPANY, role: "admin" },
        {
          email: "dup@b.test",
          firstName: "D",
          lastName: "U",
          role: "viewer",
          password: "TempPass1",
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("changeRole throws NotFound when findFirst returns null (cross-tenant)", async () => {
    const prisma = makePrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    const svc = new UsersService(prisma);
    await expect(
      svc.changeRole("u-x", "manager", { ...adminActor, companyId: OTHER }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("changeRole updates and returns the new role", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "u1",
      email: "a@b.test",
      firstName: "A",
      lastName: "B",
      role: "manager",
      companyId: COMPANY,
      mustChangePassword: false,
    });
    const prisma = makePrisma({
      findFirst: vi.fn().mockResolvedValue({ id: "u1", companyId: COMPANY }),
      update,
    });
    const svc = new UsersService(prisma);
    const out = await svc.changeRole("u1", "manager", adminActor);
    expect(update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { role: "manager", sessionVersion: { increment: 1 } },
    });
    expect(out.role).toBe("manager");
  });

  it("rejects an administrator demoting their own account", async () => {
    const update = vi.fn();
    const prisma = makePrisma({
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: ADMIN, companyId: COMPANY, role: "admin" }),
      update,
    });
    const svc = new UsersService(prisma);

    await expect(
      svc.changeRole(ADMIN, "viewer", adminActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });
});
