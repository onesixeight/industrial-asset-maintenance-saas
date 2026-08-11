import { Injectable, PayloadTooLargeException } from "@nestjs/common";
import { PrismaService } from "../prisma";

const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * Synchronous CSV generation is intentionally capped to keep one request from
 * retaining an unbounded result set and CSV string in the API process.
 */
export const WORK_ORDER_EXPORT_MAX_ROWS = 10_000;

/** RFC 4180 escaping plus formula-injection hardening for spreadsheet apps. */
export function escapeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const safeValue = CSV_FORMULA_PREFIX.test(value) ? `'${value}` : value;
  const needsQuoting = /[",\n\r]/.test(safeValue);
  const escaped = safeValue.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

/** Serialize a header row + data rows to an RFC 4180 CSV string (CRLF line endings). */
export function toCsv(
  headers: string[],
  rows: (string | null | undefined)[][],
): string {
  const lines = [headers.map(escapeCsvField).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

type WorkOrderExportRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  createdAt: Date;
  completedAt: Date | null;
  dueDate: Date | null;
  asset: { name: string } | null;
  assignedTo: { email: string } | null;
};

const HEADERS = [
  "id",
  "title",
  "status",
  "priority",
  "type",
  "assetName",
  "assignedEmail",
  "createdAt",
  "completedAt",
  "dueDate",
];

/**
 * Tenant-scoped work-order CSV export. Excludes soft-deleted rows. The CSV is
 * generated synchronously (portfolio-scale data volume — see ADR 0005 for why
 * BullMQ/R2 are deferred). Exports above WORK_ORDER_EXPORT_MAX_ROWS fail with
 * HTTP 413 so callers get an explicit signal instead of a partial CSV.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateWorkOrdersCsv(companyId: string): Promise<string> {
    const rows = await this.prisma.getClient().workOrder.findMany({
      where: { companyId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        asset: { select: { name: true } },
        assignedTo: { select: { email: true } },
      },
      // Fetch one sentinel row so an exactly-at-the-limit export still works.
      take: WORK_ORDER_EXPORT_MAX_ROWS + 1,
    });

    if (rows.length > WORK_ORDER_EXPORT_MAX_ROWS) {
      throw new PayloadTooLargeException(
        "Work-order export exceeds the 10,000 row limit",
      );
    }

    const data = (rows as WorkOrderExportRow[]).map((r) => [
      r.id,
      r.title,
      r.status,
      r.priority,
      r.type,
      r.asset?.name ?? null,
      r.assignedTo?.email ?? null,
      r.createdAt.toISOString(),
      r.completedAt?.toISOString() ?? null,
      r.dueDate?.toISOString() ?? null,
    ]);

    return toCsv(HEADERS, data);
  }
}
