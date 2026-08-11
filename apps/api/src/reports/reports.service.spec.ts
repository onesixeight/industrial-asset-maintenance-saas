import { PayloadTooLargeException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  escapeCsvField,
  ReportsService,
  toCsv,
  WORK_ORDER_EXPORT_MAX_ROWS,
} from "./reports.service";
import type { PrismaService } from "../prisma";

describe("escapeCsvField", () => {
  it("returns empty string for null/undefined", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });

  it("leaves a plain field unquoted", () => {
    expect(escapeCsvField("bearing")).toBe("bearing");
  });

  it("wraps fields containing a comma", () => {
    expect(escapeCsvField("a,b")).toBe('"a,b"');
  });

  it("doubles embedded quotes and wraps", () => {
    expect(escapeCsvField('he said "hi"')).toBe('"he said ""hi"""');
  });

  it("wraps fields containing a newline", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("prefixes spreadsheet formula-leading cells", () => {
    expect(escapeCsvField("=1+1")).toBe("'=1+1");
    expect(escapeCsvField("+SUM(A1:A2)")).toBe("'+SUM(A1:A2)");
    expect(escapeCsvField("-10")).toBe("'-10");
    expect(escapeCsvField("@HYPERLINK")).toBe("'@HYPERLINK");
  });

  it("keeps formula hardening when the cell also needs quotes", () => {
    expect(escapeCsvField('="hi, there"')).toBe('"\'=""hi, there"""');
  });
});

describe("toCsv", () => {
  it("emits a header row + CRLF line endings", () => {
    expect(toCsv(["a", "b"], [])).toBe("a,b\r\n");
  });

  it("serializes data rows after the header", () => {
    const csv = toCsv(
      ["a", "b"],
      [
        ["1", "2"],
        ["3", "4"],
      ],
    );
    expect(csv).toBe("a,b\r\n1,2\r\n3,4\r\n");
  });

  it("applies escaping to data cells", () => {
    const csv = toCsv(["title"], [["Fix pump, urgent"]]);
    expect(csv).toBe('title\r\n"Fix pump, urgent"\r\n');
  });

  it("applies formula hardening to data cells", () => {
    const csv = toCsv(["title"], [["=cmd|'/C calc'!A0"]]);
    expect(csv).toBe("title\r\n'=cmd|'/C calc'!A0\r\n");
  });
});

describe("ReportsService.generateWorkOrdersCsv", () => {
  it("returns header only and bounds the database query to max rows plus one", async () => {
    expect(WORK_ORDER_EXPORT_MAX_ROWS).toBe(10_000);
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      getClient: () => ({ workOrder: { findMany } }),
    } as unknown as PrismaService;
    const svc = new ReportsService(prisma);
    const csv = await svc.generateWorkOrdersCsv("c1");
    expect(csv).toBe(
      "id,title,status,priority,type,assetName,assignedEmail,createdAt,completedAt,dueDate\r\n",
    );
    expect(findMany).toHaveBeenCalledWith({
      where: { companyId: "c1", deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        asset: { select: { name: true } },
        assignedTo: { select: { email: true } },
      },
      take: WORK_ORDER_EXPORT_MAX_ROWS + 1,
    });
  });

  it("serializes a work order row with ISO dates and relation fields", async () => {
    const prisma = {
      getClient: () => ({
        workOrder: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "wo-1",
              title: "=Inspect",
              status: "open",
              priority: "medium",
              type: "preventive",
              createdAt: new Date("2026-01-01T00:00:00Z"),
              completedAt: null,
              dueDate: null,
              asset: { name: "Pump 1" },
              assignedTo: null,
            },
          ]),
        },
      }),
    } as unknown as PrismaService;
    const svc = new ReportsService(prisma);
    const csv = await svc.generateWorkOrdersCsv("c1");
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe(
      "wo-1,'=Inspect,open,medium,preventive,Pump 1,,2026-01-01T00:00:00.000Z,,",
    );
  });

  it("rejects an export larger than 10,000 rows with HTTP 413", async () => {
    const row = {
      id: "wo-over-limit",
      title: "Inspect",
      status: "open",
      priority: "medium",
      type: "preventive",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      completedAt: null,
      dueDate: null,
      asset: null,
      assignedTo: null,
    };
    const findMany = vi
      .fn()
      .mockResolvedValue(
        Array.from({ length: WORK_ORDER_EXPORT_MAX_ROWS + 1 }, () => row),
      );
    const prisma = {
      getClient: () => ({ workOrder: { findMany } }),
    } as unknown as PrismaService;
    const svc = new ReportsService(prisma);

    const exportPromise = svc.generateWorkOrdersCsv("c1");

    await expect(exportPromise).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
    await expect(exportPromise).rejects.toMatchObject({
      response: {
        statusCode: 413,
        message: "Work-order export exceeds the 10,000 row limit",
      },
      status: 413,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: WORK_ORDER_EXPORT_MAX_ROWS + 1 }),
    );
  });
});
