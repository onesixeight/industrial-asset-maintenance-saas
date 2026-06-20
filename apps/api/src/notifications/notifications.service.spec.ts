import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { NotificationsService } from "./notifications.service";
import type { PrismaService } from "../prisma";

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "n-1",
    userId: USER,
    title: "Low stock alert",
    message: "Bearing dropped to 3 units",
    read: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makePrisma(deleg: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {}) {
  const notification = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    ...deleg.notification,
  };
  const client = { notification };
  return { getClient: () => client } as unknown as PrismaService;
}

describe("NotificationsService.list", () => {
  it("scopes by userId, paginates, maps createdAt to ISO", async () => {
    const findMany = vi.fn().mockResolvedValue([row(), row({ id: "n-2" })]);
    const prisma = makePrisma({ notification: { findMany } });
    const svc = new NotificationsService(prisma);
    const result = await svc.list(USER, { page: 1, limit: 50, search: undefined });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: USER } }));
    expect(result).toHaveLength(2);
    expect(result[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("applies pagination skip/take", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = makePrisma({ notification: { findMany } });
    const svc = new NotificationsService(prisma);
    await svc.list(USER, { page: 3, limit: 10, search: undefined });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
  });
});

describe("NotificationsService.unreadCount", () => {
  it("counts read:false for the user", async () => {
    const count = vi.fn().mockResolvedValue(4);
    const prisma = makePrisma({ notification: { count } });
    const svc = new NotificationsService(prisma);
    const result = await svc.unreadCount(USER);
    expect(count).toHaveBeenCalledWith({ where: { userId: USER, read: false } });
    expect(result).toEqual({ count: 4 });
  });
});

describe("NotificationsService.markRead", () => {
  it("get-then-update and returns the read notification", async () => {
    const update = vi.fn().mockResolvedValue(row({ read: true }));
    const prisma = makePrisma({
      notification: { findFirst: vi.fn().mockResolvedValue(row()), update },
    });
    const svc = new NotificationsService(prisma);
    const result = await svc.markRead("n-1", USER);
    expect(update).toHaveBeenCalledWith({ where: { id: "n-1" }, data: { read: true } });
    expect(result.read).toBe(true);
  });

  it("throws NotFound when the notification belongs to another user (IDOR)", async () => {
    const prisma = makePrisma();
    const svc = new NotificationsService(prisma);
    await expect(svc.markRead("n-1", OTHER)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("NotificationsService.markAllRead", () => {
  it("updateMany scoped to user + read:false, returns the count", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 3 });
    const prisma = makePrisma({ notification: { updateMany } });
    const svc = new NotificationsService(prisma);
    const result = await svc.markAllRead(USER);
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: USER, read: false },
      data: { read: true },
    });
    expect(result).toEqual({ updated: 3 });
  });

  it("is idempotent — second call returns updated: 0", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = makePrisma({ notification: { updateMany } });
    const svc = new NotificationsService(prisma);
    const result = await svc.markAllRead(USER);
    expect(result).toEqual({ updated: 0 });
  });
});
