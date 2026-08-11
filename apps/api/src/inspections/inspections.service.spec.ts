import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { InspectionsService } from "./inspections.service";
import type { PrismaService } from "../prisma";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const ASSET = "33333333-3333-3333-3333-333333333333";
const USER = "44444444-4444-4444-4444-444444444444";

function makePrisma(
  opts: {
    templateFindMany?: ReturnType<typeof vi.fn>;
    templateFindFirst?: ReturnType<typeof vi.fn>;
    templateCount?: ReturnType<typeof vi.fn>;
    templateCreate?: ReturnType<typeof vi.fn>;
    templateUpdate?: ReturnType<typeof vi.fn>;
    templateDelete?: ReturnType<typeof vi.fn>;
    inspectionCount?: ReturnType<typeof vi.fn>;
    inspectionCreate?: ReturnType<typeof vi.fn>;
    assetFindFirst?: ReturnType<typeof vi.fn>;
    inspectionFindFirst?: ReturnType<typeof vi.fn>;
    inspectionFindMany?: ReturnType<typeof vi.fn>;
    templateLockRows?: unknown[];
  } = {},
): PrismaService {
  const client = {
    inspectionTemplate: {
      findMany: opts.templateFindMany ?? vi.fn().mockResolvedValue([]),
      findFirst: opts.templateFindFirst ?? vi.fn().mockResolvedValue(null),
      count: opts.templateCount ?? vi.fn().mockResolvedValue(0),
      create: opts.templateCreate ?? vi.fn(),
      update: opts.templateUpdate ?? vi.fn(),
      delete: opts.templateDelete ?? vi.fn(),
    },
    inspection: {
      findMany: opts.inspectionFindMany ?? vi.fn().mockResolvedValue([]),
      findFirst: opts.inspectionFindFirst ?? vi.fn().mockResolvedValue(null),
      count: opts.inspectionCount ?? vi.fn().mockResolvedValue(0),
      create: opts.inspectionCreate ?? vi.fn(),
    },
    asset: {
      findFirst: opts.assetFindFirst ?? vi.fn().mockResolvedValue(null),
    },
    $queryRaw: vi.fn().mockResolvedValue(opts.templateLockRows ?? []),
    $transaction: null as unknown,
  };
  client.$transaction = vi.fn(
    async (cb: (tx: typeof client) => Promise<unknown>) => cb(client),
  );
  return { getClient: () => client } as unknown as PrismaService;
}

const TPL_ROW = {
  id: "tpl-1",
  name: "Daily",
  version: 1,
  items: [
    { id: "a", label: "Oil level", type: "pass_fail" },
    { id: "b", label: "Pressure", type: "pass_fail" },
  ],
  companyId: COMPANY,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("InspectionsService", () => {
  it("listTemplates returns a tenant-scoped paginated response", async () => {
    const templateFindMany = vi.fn().mockResolvedValue([TPL_ROW]);
    const templateCount = vi.fn().mockResolvedValue(7);
    const svc = new InspectionsService(
      makePrisma({ templateFindMany, templateCount }),
    );

    const out = await svc.listTemplates(COMPANY, {
      search: "daily",
      page: 2,
      limit: 3,
    });

    const where = {
      companyId: COMPANY,
      name: { contains: "daily", mode: "insensitive" },
    };
    expect(templateFindMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 3,
      take: 3,
    });
    expect(templateCount).toHaveBeenCalledWith({ where });
    expect(out).toEqual({
      items: [
        {
          id: "tpl-1",
          name: "Daily",
          version: 1,
          items: TPL_ROW.items,
          companyId: COMPANY,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      page: 2,
      pageSize: 3,
      total: 7,
    });
  });

  it("listInspections returns a tenant-scoped paginated response", async () => {
    const row = {
      id: "insp-1",
      assetId: ASSET,
      templateId: "tpl-1",
      templateVersion: 1,
      templateSnapshot: { name: TPL_ROW.name, items: TPL_ROW.items },
      results: [{ itemId: "a", value: "fail" }],
      passed: false,
      notes: null,
      inspectedById: USER,
      companyId: COMPANY,
      createdAt: new Date("2026-01-02T00:00:00Z"),
    };
    const inspectionFindMany = vi.fn().mockResolvedValue([row]);
    const inspectionCount = vi.fn().mockResolvedValue(4);
    const svc = new InspectionsService(
      makePrisma({ inspectionFindMany, inspectionCount }),
    );

    const out = await svc.listInspections(COMPANY, {
      page: 2,
      limit: 2,
      assetId: ASSET,
      templateId: "tpl-1",
      passed: false,
    });

    const where = {
      companyId: COMPANY,
      assetId: ASSET,
      templateId: "tpl-1",
      passed: false,
    };
    expect(inspectionFindMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 2,
      take: 2,
    });
    expect(inspectionCount).toHaveBeenCalledWith({ where });
    expect(out).toEqual({
      items: [{ ...row, createdAt: "2026-01-02T00:00:00.000Z" }],
      page: 2,
      pageSize: 2,
      total: 4,
    });
  });

  it("createTemplate generates item ids and sets type=pass_fail", async () => {
    const templateCreate = vi.fn().mockResolvedValue({
      id: "tpl-1",
      name: "Daily",
      items: [{ id: "x", label: "Oil", type: "pass_fail" }],
      version: 1,
      companyId: COMPANY,
      createdAt: new Date("2026-01-01"),
    });
    const prisma = makePrisma({ templateCreate });
    const svc = new InspectionsService(prisma);
    const out = await svc.createTemplate(
      { name: "Daily", items: [{ label: "Oil" }] },
      COMPANY,
    );
    expect(templateCreate.mock.calls[0][0].data.items[0].id).toBeTruthy();
    expect(out.items[0].type).toBe("pass_fail");
  });

  it("increments the immutable template version on every edit", async () => {
    const templateUpdate = vi.fn().mockResolvedValue({
      ...TPL_ROW,
      name: "Daily v2",
      version: 2,
    });
    const svc = new InspectionsService(
      makePrisma({
        templateFindFirst: vi.fn().mockResolvedValue(TPL_ROW),
        templateUpdate,
      }),
    );

    const result = await svc.updateTemplate(
      "tpl-1",
      { name: "Daily v2" },
      COMPANY,
    );

    expect(templateUpdate).toHaveBeenCalledWith({
      where: { id: "tpl-1" },
      data: { name: "Daily v2", version: { increment: 1 } },
    });
    expect(result.version).toBe(2);
  });

  it("submit all-pass → passed=true", async () => {
    const inspectionCreate = vi.fn().mockResolvedValue({
      id: "insp-1",
      assetId: ASSET,
      templateId: "tpl-1",
      results: [
        { itemId: "a", value: "pass" },
        { itemId: "b", value: "pass" },
      ],
      templateVersion: 1,
      templateSnapshot: { name: TPL_ROW.name, items: TPL_ROW.items },
      passed: true,
      notes: null,
      inspectedById: USER,
      companyId: COMPANY,
      createdAt: new Date("2026-01-01"),
    });
    const prisma = makePrisma({
      assetFindFirst: vi.fn().mockResolvedValue({ id: ASSET }),
      templateLockRows: [TPL_ROW],
      inspectionCreate,
    });
    const svc = new InspectionsService(prisma);
    const out = await svc.submit(
      {
        assetId: ASSET,
        templateId: "tpl-1",
        results: [
          { itemId: "a", value: "pass" },
          { itemId: "b", value: "pass" },
        ],
      },
      USER,
      COMPANY,
    );
    expect(out.passed).toBe(true);
    expect(inspectionCreate.mock.calls[0][0].data.passed).toBe(true);
    expect(inspectionCreate.mock.calls[0][0].data).toMatchObject({
      templateVersion: 1,
      templateSnapshot: { name: "Daily", items: TPL_ROW.items },
    });
  });

  it("submit one-fail → passed=false", async () => {
    const inspectionCreate = vi.fn().mockResolvedValue({
      id: "insp-2",
      assetId: ASSET,
      templateId: "tpl-1",
      results: [
        { itemId: "a", value: "pass" },
        { itemId: "b", value: "fail" },
      ],
      templateVersion: 1,
      templateSnapshot: { name: TPL_ROW.name, items: TPL_ROW.items },
      passed: false,
      notes: null,
      inspectedById: USER,
      companyId: COMPANY,
      createdAt: new Date("2026-01-01"),
    });
    const prisma = makePrisma({
      assetFindFirst: vi.fn().mockResolvedValue({ id: ASSET }),
      templateLockRows: [TPL_ROW],
      inspectionCreate,
    });
    const svc = new InspectionsService(prisma);
    await svc.submit(
      {
        assetId: ASSET,
        templateId: "tpl-1",
        results: [
          { itemId: "a", value: "pass" },
          { itemId: "b", value: "fail" },
        ],
      },
      USER,
      COMPANY,
    );
    expect(inspectionCreate.mock.calls[0][0].data.passed).toBe(false);
  });

  it("submit with missing item → BadRequest", async () => {
    const prisma = makePrisma({
      assetFindFirst: vi.fn().mockResolvedValue({ id: ASSET }),
      templateLockRows: [TPL_ROW],
    });
    const svc = new InspectionsService(prisma);
    await expect(
      svc.submit(
        {
          assetId: ASSET,
          templateId: "tpl-1",
          results: [{ itemId: "a", value: "pass" }],
        },
        USER,
        COMPANY,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("submit with foreign-tenant asset → NotFound", async () => {
    const prisma = makePrisma({
      assetFindFirst: vi.fn().mockResolvedValue(null),
    });
    const svc = new InspectionsService(prisma);
    await expect(
      svc.submit(
        { assetId: "foreign", templateId: "tpl-1", results: [] },
        USER,
        COMPANY,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("removeTemplate 409 when inspections reference it", async () => {
    const prisma = makePrisma({
      templateFindFirst: vi.fn().mockResolvedValue({
        id: "tpl-1",
        items: [{ id: "a" }],
        companyId: COMPANY,
        createdAt: new Date("2026-01-01"),
      }),
      inspectionCount: vi.fn().mockResolvedValue(3),
    });
    const svc = new InspectionsService(prisma);
    await expect(svc.removeTemplate("tpl-1", COMPANY)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("removeTemplate maps a P2003 delete race to Conflict", async () => {
    const p2003 = new Prisma.PrismaClientKnownRequestError("foreign key", {
      code: "P2003",
      clientVersion: "7.9.1",
    });
    const svc = new InspectionsService(
      makePrisma({
        templateFindFirst: vi.fn().mockResolvedValue(TPL_ROW),
        inspectionCount: vi.fn().mockResolvedValue(0),
        templateDelete: vi.fn().mockRejectedValue(p2003),
      }),
    );

    await expect(svc.removeTemplate("tpl-1", COMPANY)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("getTemplate cross-tenant → NotFound", async () => {
    const prisma = makePrisma({
      templateFindFirst: vi.fn().mockResolvedValue(null),
    });
    const svc = new InspectionsService(prisma);
    await expect(svc.getTemplate("tpl-x", OTHER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
