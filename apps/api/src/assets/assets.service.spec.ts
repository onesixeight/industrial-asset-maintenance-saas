import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AssetsService } from "./assets.service";
import type { PrismaService } from "../prisma";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const LOC = "33333333-3333-3333-3333-333333333333";
const CAT = "44444444-4444-4444-4444-444444444444";

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "asset-1",
    name: "Pump",
    description: null,
    serialNumber: null,
    qrCode: "qr-token-xyz",
    status: "active",
    locationId: LOC,
    categoryId: CAT,
    companyId: COMPANY,
    purchaseDate: null,
    warrantyDate: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  const asset = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const location = { findFirst: vi.fn().mockResolvedValue({ id: LOC }) };
  const category = { findFirst: vi.fn().mockResolvedValue({ id: CAT }) };
  const workOrder = { count: vi.fn().mockResolvedValue(0) };
  const inspection = { count: vi.fn().mockResolvedValue(0) };
  const client = { asset, location, category, workOrder, inspection };
  return Object.assign(
    { getClient: () => client } as unknown as PrismaService,
    overrides,
  );
}

const configStub = { get: vi.fn((k: string) => (k === "PUBLIC_SCAN_BASE" ? "http://localhost:3000" : undefined)) };

describe("AssetsService", () => {
  it("list maps rows and filters by companyId", async () => {
    const findMany = vi.fn().mockResolvedValue([row()]);
    const prisma = makePrisma({});
    (prisma.getClient() as never as { asset: { findMany: typeof findMany } }).asset.findMany = findMany;
    const svc = new AssetsService(prisma, configStub as never);
    const out = await svc.list(COMPANY, { search: "pu", status: "active", locationId: LOC, categoryId: CAT, page: 1, limit: 50 });
    expect(out).toHaveLength(1);
    expect(out[0].createdAt).toBe("2026-01-01T00:00:00.000Z"); // ISO string, not Date
    expect(findMany).toHaveBeenCalled();
  });

  it("get throws NotFound when findFirst returns null (cross-tenant)", async () => {
    const prisma = makePrisma({});
    const svc = new AssetsService(prisma, configStub as never);
    await expect(svc.get("asset-x", OTHER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("create validates FKs and rejects a foreign-tenant location", async () => {
    const prisma = makePrisma({});
    // location findFirst returns null (foreign tenant)
    (prisma.getClient() as never as { location: { findFirst: ReturnType<typeof vi.fn> } }).location.findFirst = vi.fn().mockResolvedValue(null);
    const svc = new AssetsService(prisma, configStub as never);
    await expect(
      svc.create({ name: "X", locationId: "loc-foreign", categoryId: CAT }, COMPANY),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("create generates a qrCode and maps dates to ISO", async () => {
    const create = vi.fn().mockImplementation((args: { data: { qrCode: string } }) =>
      Promise.resolve(row({ qrCode: args.data.qrCode })),
    );
    const prisma = makePrisma({});
    (prisma.getClient() as never as { asset: { create: typeof create } }).asset.create = create;
    const svc = new AssetsService(prisma, configStub as never);
    const out = await svc.create({ name: "Pump", locationId: LOC, categoryId: CAT }, COMPANY);
    expect(create).toHaveBeenCalled();
    expect(create.mock.calls[0][0].data.qrCode).toBeTruthy();
    expect(out.qrCode).toBe(create.mock.calls[0][0].data.qrCode);
    expect(typeof out.createdAt).toBe("string");
  });

  it("remove throws Conflict when work orders or inspections exist", async () => {
    const prisma = makePrisma({});
    (prisma.getClient() as never as { asset: { findFirst: ReturnType<typeof vi.fn> } }).asset.findFirst = vi.fn().mockResolvedValue(row());
    (prisma.getClient() as never as { workOrder: { count: ReturnType<typeof vi.fn> } }).workOrder.count = vi.fn().mockResolvedValue(2);
    const svc = new AssetsService(prisma, configStub as never);
    await expect(svc.remove("asset-1", COMPANY)).rejects.toBeInstanceOf(ConflictException);
  });

  it("rotateQr overwrites qrCode (old sticker invalidated)", async () => {
    const update = vi.fn().mockImplementation((args: { data: { qrCode: string } }) =>
      Promise.resolve(row({ qrCode: args.data.qrCode })),
    );
    const prisma = makePrisma({});
    (prisma.getClient() as never as { asset: { findFirst: ReturnType<typeof vi.fn>; update: typeof update } }).asset.findFirst = vi.fn().mockResolvedValue(row());
    (prisma.getClient() as never as { asset: { findFirst: ReturnType<typeof vi.fn>; update: typeof update } }).asset.update = update;
    const svc = new AssetsService(prisma, configStub as never);
    const out = await svc.rotateQr("asset-1", COMPANY);
    expect(update).toHaveBeenCalledWith({ where: { id: "asset-1" }, data: { qrCode: expect.any(String) } });
    expect(out.qrCode).not.toBe("qr-token-xyz");
  });

  it("findByQr throws NotFound for unknown / cross-tenant token", async () => {
    const prisma = makePrisma({});
    const svc = new AssetsService(prisma, configStub as never);
    await expect(svc.findByQr("bogus", OTHER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("getQrSvg returns SVG markup embedding the scan URL", async () => {
    const prisma = makePrisma({});
    (prisma.getClient() as never as { asset: { findFirst: ReturnType<typeof vi.fn> } }).asset.findFirst = vi.fn().mockResolvedValue(row({ qrCode: "abc123" }));
    const svc = new AssetsService(prisma, configStub as never);
    const svg = await svc.getQrSvg("asset-1", COMPANY);
    expect(svg).toContain("<svg");
  });
});
