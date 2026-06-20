import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CreateTemplateRequest,
  InspectionFilters,
  InspectionResponse,
  SubmitInspectionRequest,
  TemplateResponse,
  UpdateTemplateRequest,
} from "@iam/shared";
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

  async listTemplates(companyId: string, search?: string): Promise<TemplateResponse[]> {
    const rows = await this.prisma.getClient().inspectionTemplate.findMany({
      where: {
        companyId,
        name: search ? { contains: search, mode: "insensitive" } : undefined,
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((t) => this.toTemplateResponse(t));
  }

  async getTemplate(id: string, companyId: string): Promise<TemplateResponse> {
    const tpl = await this.prisma.getClient().inspectionTemplate.findFirst({
      where: { id, companyId },
    });
    if (!tpl) throw new NotFoundException();
    return this.toTemplateResponse(tpl);
  }

  async createTemplate(input: CreateTemplateRequest, companyId: string): Promise<TemplateResponse> {
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
      throw new ConflictException("Template has submitted inspections; cannot delete");
    }
    await this.prisma.getClient().inspectionTemplate.delete({ where: { id } });
  }

  // --- Inspections ---------------------------------------------------------

  async listInspections(companyId: string, filters: InspectionFilters): Promise<InspectionResponse[]> {
    const rows = await this.prisma.getClient().inspection.findMany({
      where: {
        companyId,
        assetId: filters.assetId,
        templateId: filters.templateId,
        passed: filters.passed,
      },
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    });
    return rows.map((r) => this.toInspectionResponse(r));
  }

  async getInspection(id: string, companyId: string): Promise<InspectionResponse> {
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
    // Validate asset + template belong to the caller's company.
    const [asset, template] = await Promise.all([
      this.prisma.getClient().asset.findFirst({ where: { id: input.assetId, companyId } }),
      this.prisma.getClient().inspectionTemplate.findFirst({ where: { id: input.templateId, companyId } }),
    ]);
    if (!asset) throw new NotFoundException("Asset not found");
    if (!template) throw new NotFoundException("Template not found");

    const templateItemIds = (template.items as { id: string }[]).map((it) => it.id);
    const validation = validateResults(templateItemIds, input.results);
    if (!validation.ok) {
      throw new BadRequestException(`Invalid inspection results: ${validation.reason}`);
    }

    const row = await this.prisma.getClient().inspection.create({
      data: {
        assetId: input.assetId,
        templateId: input.templateId,
        results: input.results,
        passed: validation.passed,
        notes: input.notes ?? null,
        inspectedById: userId,
        companyId,
      },
    });
    return this.toInspectionResponse(row);
  }

  // --- mappers -------------------------------------------------------------

  private toTemplateResponse(t: {
    id: string;
    name: string;
    items: unknown;
    companyId: string;
    createdAt: Date;
  }): TemplateResponse {
    return {
      id: t.id,
      name: t.name,
      items: t.items as TemplateResponse["items"],
      companyId: t.companyId,
      createdAt: t.createdAt.toISOString(),
    };
  }

  private toInspectionResponse(i: {
    id: string;
    assetId: string;
    templateId: string;
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
      results: i.results as InspectionResponse["results"],
      passed: i.passed,
      notes: i.notes,
      inspectedById: i.inspectedById,
      companyId: i.companyId,
      createdAt: i.createdAt.toISOString(),
    };
  }
}
