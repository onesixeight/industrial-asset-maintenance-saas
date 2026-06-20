import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma";

/** RFC 4180 escaping: wrap a field in quotes if it contains comma/quote/newline; double any embedded quotes. */
export function escapeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const needsQuoting = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

/** Serialize a header row + data rows to an RFC 4180 CSV string (CRLF line endings). */
export function toCsv(headers: string[], rows: (string | null | undefined)[][]): string {
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
 * BullMQ/R2 are deferred). Returns the full CSV string.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateWorkOrdersCsv(companyId: string): Promise<string> {
    const rows = await this.prisma.getClient().workOrder.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { asset: { select: { name: true } }, assignedTo: { select: { email: true } } },
    });

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
