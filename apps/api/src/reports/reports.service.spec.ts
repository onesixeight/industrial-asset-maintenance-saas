import { describe, expect, it, vi } from "vitest";
import { escapeCsvField, toCsv, ReportsService } from "./reports.service";
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
});

describe("toCsv", () => {
  it("emits a header row + CRLF line endings", () => {
    expect(toCsv(["a", "b"], [])).toBe("a,b\r\n");
  });

  it("serializes data rows after the header", () => {
    const csv = toCsv(["a", "b"], [["1", "2"], ["3", "4"]]);
    expect(csv).toBe("a,b\r\n1,2\r\n3,4\r\n");
  });

  it("applies escaping to data cells", () => {
    const csv = toCsv(["title"], [["Fix pump, urgent"]]);
    expect(csv).toBe('title\r\n"Fix pump, urgent"\r\n');
  });
});

describe("ReportsService.generateWorkOrdersCsv", () => {
  it("returns header only when no work orders", async () => {
    const prisma = {
      getClient: () => ({ workOrder: { findMany: vi.fn().mockResolvedValue([]) } }),
    } as unknown as PrismaService;
    const svc = new ReportsService(prisma);
    const csv = await svc.generateWorkOrdersCsv("c1");
    expect(csv).toBe(
      "id,title,status,priority,type,assetName,assignedEmail,createdAt,completedAt,dueDate\r\n",
    );
  });

  it("serializes a work order row with ISO dates and relation fields", async () => {
    const prisma = {
      getClient: () => ({
        workOrder: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "wo-1",
              title: "Inspect",
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
    expect(lines[1]).toBe("wo-1,Inspect,open,medium,preventive,Pump 1,,2026-01-01T00:00:00.000Z,,");
  });
});
