import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { InspectionsService } from "./inspections.service";
import type { PrismaService } from "../prisma";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const ASSET = "33333333-3333-3333-3333-333333333333";
const USER = "44444444-4444-4444-4444-444444444444";

function makePrisma(opts: {
  templateFindFirst?: ReturnType<typeof vi.fn>;
  templateCreate?: ReturnType<typeof vi.fn>;
  templateUpdate?: ReturnType<typeof vi.fn>;
  inspectionCount?: ReturnType<typeof vi.fn>;
  inspectionCreate?: ReturnType<typeof vi.fn>;
  assetFindFirst?: ReturnType<typeof vi.fn>;
  inspectionFindFirst?: ReturnType<typeof vi.fn>;
  inspectionFindMany?: ReturnType<typeof vi.fn>;
} = {}): PrismaService {
  const client = {
    inspectionTemplate: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: opts.templateFindFirst ?? vi.fn().mockResolvedValue(null),
      create: opts.templateCreate ?? vi.fn(),
      update: opts.templateUpdate ?? vi.fn(),
      delete: vi.fn(),
    },
    inspection: {
      findMany: opts.inspectionFindMany ?? vi.fn().mockResolvedValue([]),
      findFirst: opts.inspectionFindFirst ?? vi.fn().mockResolvedValue(null),
      count: opts.inspectionCount ?? vi.fn().mockResolvedValue(0),
      create: opts.inspectionCreate ?? vi.fn(),
    },
    asset: { findFirst: opts.assetFindFirst ?? vi.fn().mockResolvedValue(null) },
  };
  return { getClient: () => client } as unknown as PrismaService;
}

const TPL_ROW = {
  id: "tpl-1",
  name: "Daily",
  items: [{ id: "a" }, { id: "b" }],
  companyId: COMPANY,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("InspectionsService", () => {
  it("createTemplate generates item ids and sets type=pass_fail", async () => {
    const templateCreate = vi.fn().mockResolvedValue({
      id: "tpl-1", name: "Daily", items: [{ id: "x", label: "Oil", type: "pass_fail" }],
      companyId: COMPANY, createdAt: new Date("2026-01-01"),
    });
    const prisma = makePrisma({ templateCreate });
    const svc = new InspectionsService(prisma);
    const out = await svc.createTemplate({ name: "Daily", items: [{ label: "Oil" }] }, COMPANY);
    expect(templateCreate.mock.calls[0][0].data.items[0].id).toBeTruthy();
    expect(out.items[0].type).toBe("pass_fail");
  });

  it("submit all-pass → passed=true", async () => {
    const inspectionCreate = vi.fn().mockResolvedValue({
      id: "insp-1", assetId: ASSET, templateId: "tpl-1",
      results: [{ itemId: "a", value: "pass" }, { itemId: "b", value: "pass" }],
      passed: true, notes: null, inspectedById: USER, companyId: COMPANY,
      createdAt: new Date("2026-01-01"),
    });
    const prisma = makePrisma({
      assetFindFirst: vi.fn().mockResolvedValue({ id: ASSET }),
      templateFindFirst: vi.fn().mockResolvedValue(TPL_ROW),
      inspectionCreate,
    });
    const svc = new InspectionsService(prisma);
    const out = await svc.submit(
      { assetId: ASSET, templateId: "tpl-1", results: [{ itemId: "a", value: "pass" }, { itemId: "b", value: "pass" }] },
      USER, COMPANY,
    );
    expect(out.passed).toBe(true);
    expect(inspectionCreate.mock.calls[0][0].data.passed).toBe(true);
  });

  it("submit one-fail → passed=false", async () => {
    const inspectionCreate = vi.fn().mockResolvedValue({
      id: "insp-2", assetId: ASSET, templateId: "tpl-1",
      results: [{ itemId: "a", value: "pass" }, { itemId: "b", value: "fail" }],
      passed: false, notes: null, inspectedById: USER, companyId: COMPANY,
      createdAt: new Date("2026-01-01"),
    });
    const prisma = makePrisma({
      assetFindFirst: vi.fn().mockResolvedValue({ id: ASSET }),
      templateFindFirst: vi.fn().mockResolvedValue(TPL_ROW),
      inspectionCreate,
    });
    const svc = new InspectionsService(prisma);
    await svc.submit(
      { assetId: ASSET, templateId: "tpl-1", results: [{ itemId: "a", value: "pass" }, { itemId: "b", value: "fail" }] },
      USER, COMPANY,
    );
    expect(inspectionCreate.mock.calls[0][0].data.passed).toBe(false);
  });

  it("submit with missing item → BadRequest", async () => {
    const prisma = makePrisma({
      assetFindFirst: vi.fn().mockResolvedValue({ id: ASSET }),
      templateFindFirst: vi.fn().mockResolvedValue(TPL_ROW),
    });
    const svc = new InspectionsService(prisma);
    await expect(
      svc.submit({ assetId: ASSET, templateId: "tpl-1", results: [{ itemId: "a", value: "pass" }] }, USER, COMPANY),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("submit with foreign-tenant asset → NotFound", async () => {
    const prisma = makePrisma({ assetFindFirst: vi.fn().mockResolvedValue(null) });
    const svc = new InspectionsService(prisma);
    await expect(
      svc.submit({ assetId: "foreign", templateId: "tpl-1", results: [] }, USER, COMPANY),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("removeTemplate 409 when inspections reference it", async () => {
    const prisma = makePrisma({
      templateFindFirst: vi.fn().mockResolvedValue({
        id: "tpl-1", items: [{ id: "a" }], companyId: COMPANY,
        createdAt: new Date("2026-01-01"),
      }),
      inspectionCount: vi.fn().mockResolvedValue(3),
    });
    const svc = new InspectionsService(prisma);
    await expect(svc.removeTemplate("tpl-1", COMPANY)).rejects.toBeInstanceOf(ConflictException);
  });

  it("getTemplate cross-tenant → NotFound", async () => {
    const prisma = makePrisma({ templateFindFirst: vi.fn().mockResolvedValue(null) });
    const svc = new InspectionsService(prisma);
    await expect(svc.getTemplate("tpl-x", OTHER)).rejects.toBeInstanceOf(NotFoundException);
  });
});
