import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  CreateTemplateRequest,
  InspectionFilters,
  InspectionResponse,
  ListQuery,
  PaginatedResponse,
  SubmitInspectionRequest,
  TemplateResponse,
  UpdateTemplateRequest,
} from "@iam/shared";
import { deleteWithForeignKeyConflict } from "../common/prisma-delete";
import { PrismaService } from "../prisma";
import { validateResults } from "./compute-passed";

/**
 * Multi-tenant inspection templates + submissions. Templates define checklist
 * items (pass_fail); an inspection submission is validated against its template
 * and `passed` is computed server-side (never trusted from the client). The
 * inspector is the authenticated submitter (`inspectedById = user.sub`).
 */
@Injectable()
export class InspectionsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Templates -----------------------------------------------------------

  async listTemplates(
    companyId: string,
    query: ListQuery,
  ): Promise<PaginatedResponse<TemplateResponse>> {
    const where: Prisma.InspectionTemplateWhereInput = {
      companyId,
      name: query.search
        ? { contains: query.search, mode: "insensitive" }
        : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.getClient().inspectionTemplate.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.getClient().inspectionTemplate.count({ where }),
    ]);
    return {
      items: rows.map((t) => this.toTemplateResponse(t)),
      page: query.page,
      pageSize: query.limit,
      total,
    };
  }

  async getTemplate(id: string, companyId: string): Promise<TemplateResponse> {
    const tpl = await this.prisma.getClient().inspectionTemplate.findFirst({
      where: { id, companyId },
    });
    if (!tpl) throw new NotFoundException();
    return this.toTemplateResponse(tpl);
  }

  async createTemplate(
    input: CreateTemplateRequest,
    companyId: string,
  ): Promise<TemplateResponse> {
    const items = input.items.map((it) => ({
      id: randomUUID(),
      label: it.label,
      type: "pass_fail" as const,
    }));
    const row = await this.prisma.getClient().inspectionTemplate.create({
      data: { name: input.name, items, companyId },
    });
    return this.toTemplateResponse(row);
  }

  async updateTemplate(
    id: string,
    input: UpdateTemplateRequest,
    companyId: string,
  ): Promise<TemplateResponse> {
    await this.getTemplate(id, companyId);
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.items !== undefined) {
      data.items = input.items.map((it) => ({
        id: randomUUID(),
        label: it.label,
        type: "pass_fail" as const,
      }));
    }
    data.version = { increment: 1 };
    const row = await this.prisma.getClient().inspectionTemplate.update({
      where: { id },
      data,
    });
    return this.toTemplateResponse(row);
  }

  async removeTemplate(id: string, companyId: string): Promise<void> {
    await this.getTemplate(id, companyId);
    const count = await this.prisma.getClient().inspection.count({
      where: { templateId: id, companyId },
    });
    if (count > 0) {
      throw new ConflictException(
        "Template has submitted inspections; cannot delete",
      );
    }
    await deleteWithForeignKeyConflict(
      () =>
        this.prisma.getClient().inspectionTemplate.delete({ where: { id } }),
      "Template has submitted inspections; cannot delete",
    );
  }

  // --- Inspections ---------------------------------------------------------

  async listInspections(
    companyId: string,
    filters: InspectionFilters,
  ): Promise<PaginatedResponse<InspectionResponse>> {
    const where: Prisma.InspectionWhereInput = {
      companyId,
      assetId: filters.assetId,
      templateId: filters.templateId,
      passed: filters.passed,
    };
    const [rows, total] = await Promise.all([
      this.prisma.getClient().inspection.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.getClient().inspection.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.toInspectionResponse(r)),
      page: filters.page,
      pageSize: filters.limit,
      total,
    };
  }

  async getInspection(
    id: string,
    companyId: string,
  ): Promise<InspectionResponse> {
    const insp = await this.prisma.getClient().inspection.findFirst({
      where: { id, companyId },
    });
    if (!insp) throw new NotFoundException();
    return this.toInspectionResponse(insp);
  }

  async submit(
    input: SubmitInspectionRequest,
    userId: string,
    companyId: string,
  ): Promise<InspectionResponse> {
    return this.prisma.getClient().$transaction(async (tx) => {
      const asset = await tx.asset.findFirst({
        where: { id: input.assetId, companyId },
      });
      if (!asset) throw new NotFoundException("Asset not found");

      // A shared row lock linearizes submission with template edits. The
      // inspection always stores exactly the version it was validated against.
      const [template] = await tx.$queryRaw<
        Array<{
          id: string;
          name: string;
          items: Prisma.JsonValue;
          version: number;
        }>
      >`
        SELECT id, name, items, version
        FROM "InspectionTemplate"
        WHERE id = ${input.templateId} AND "companyId" = ${companyId}
        FOR SHARE
      `;
      if (!template) throw new NotFoundException("Template not found");

      const items = template.items as TemplateResponse["items"];
      const validation = validateResults(
        items.map((item) => item.id),
        input.results,
      );
      if (!validation.ok) {
        throw new BadRequestException(
          `Invalid inspection results: ${validation.reason}`,
        );
      }

      const row = await tx.inspection.create({
        data: {
          assetId: input.assetId,
          templateId: input.templateId,
          templateVersion: template.version,
          templateSnapshot: { name: template.name, items },
          results: input.results,
          passed: validation.passed,
          notes: input.notes ?? null,
          inspectedById: userId,
          companyId,
        },
      });
      return this.toInspectionResponse(row);
    });
  }

  // --- mappers -------------------------------------------------------------

  private toTemplateResponse(t: {
    id: string;
    name: string;
    items: unknown;
    version: number;
    companyId: string;
    createdAt: Date;
  }): TemplateResponse {
    return {
      id: t.id,
      name: t.name,
      version: t.version,
      items: t.items as TemplateResponse["items"],
      companyId: t.companyId,
      createdAt: t.createdAt.toISOString(),
    };
  }

  private toInspectionResponse(i: {
    id: string;
    assetId: string;
    templateId: string;
    templateVersion: number;
    templateSnapshot: unknown;
    results: unknown;
    passed: boolean;
    notes: string | null;
    inspectedById: string;
    companyId: string;
    createdAt: Date;
  }): InspectionResponse {
    return {
      id: i.id,
      assetId: i.assetId,
      templateId: i.templateId,
      templateVersion: i.templateVersion,
      templateSnapshot:
        i.templateSnapshot as InspectionResponse["templateSnapshot"],
      results: i.results as InspectionResponse["results"],
      passed: i.passed,
      notes: i.notes,
      inspectedById: i.inspectedById,
      companyId: i.companyId,
      createdAt: i.createdAt.toISOString(),
    };
  }
}
