import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CreateWorkOrderRequest,
  JwtPayload,
  UpdateWorkOrderRequest,
  WorkOrderFilters,
  WorkOrderResponse,
  WorkOrderStatus,
} from "@iam/shared";
import { PrismaService } from "../prisma";
import { canTransition } from "./transitions";

type WorkOrderRow = {
  id: string;
  title: string;
  description: string | null;
  type: WorkOrderResponse["type"];
  status: WorkOrderStatus;
  priority: WorkOrderResponse["priority"];
  assetId: string;
  assignedToId: string | null;
  dueDate: Date | null;
  completedAt: Date | null;
  deletedAt: Date | null;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Prisma returns Date for temporal fields; the API contract uses ISO strings. */
function toWorkOrderResponse(w: WorkOrderRow): WorkOrderResponse {
  const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
  return {
    id: w.id,
    title: w.title,
    description: w.description,
    type: w.type,
    status: w.status,
    priority: w.priority,
    assetId: w.assetId,
    assignedToId: w.assignedToId,
    dueDate: iso(w.dueDate),
    completedAt: iso(w.completedAt),
    deletedAt: iso(w.deletedAt),
    companyId: w.companyId,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

/**
 * Multi-tenant WorkOrder CRUD + validated status transitions + soft-delete.
 * Reads exclude soft-deleted rows (deletedAt != null). Cross-tenant lookups →
 * 404. Status transitions are validated against the `transitions.ts` graph;
 * technicians may only transition WOs assigned to them (spec §3.4).
 */
@Injectable()
export class WorkOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string, filters: WorkOrderFilters): Promise<WorkOrderResponse[]> {
    const rows = await this.prisma.getClient().workOrder.findMany({
      where: {
        companyId,
        deletedAt: null,
        title: filters.search
          ? { contains: filters.search, mode: "insensitive" }
          : undefined,
        status: filters.status,
        priority: filters.priority,
        assetId: filters.assetId,
        assignedToId: filters.assignedToId,
      },
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    });
    return rows.map(toWorkOrderResponse);
  }

  async get(id: string, companyId: string): Promise<WorkOrderResponse> {
    const wo = await this.prisma.getClient().workOrder.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!wo) throw new NotFoundException();
    return toWorkOrderResponse(wo);
  }

  async create(input: CreateWorkOrderRequest, companyId: string): Promise<WorkOrderResponse> {
    await this.validateFks(input.assetId, input.assignedToId ?? null, companyId);
    const row = await this.prisma.getClient().workOrder.create({
      data: {
        title: input.title,
        description: input.description,
        type: input.type,
        priority: input.priority,
        assetId: input.assetId,
        assignedToId: input.assignedToId ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        // status defaults to "open" (schema default).
        companyId,
      },
    });
    return toWorkOrderResponse(row);
  }

  async update(
    id: string,
    input: UpdateWorkOrderRequest,
    companyId: string,
  ): Promise<WorkOrderResponse> {
    const existing = await this.get(id, companyId);
    // status is intentionally NOT settable here — use PATCH /:id/status.
    if (input.assetId || input.assignedToId !== undefined) {
      await this.validateFks(
        input.assetId ?? existing.assetId,
        input.assignedToId !== undefined ? (input.assignedToId ?? null) : existing.assignedToId,
        companyId,
      );
    }
    const row = await this.prisma.getClient().workOrder.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.type !== undefined && { type: input.type }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.assetId !== undefined && { assetId: input.assetId }),
        ...(input.assignedToId !== undefined && { assignedToId: input.assignedToId ?? null }),
        ...(input.dueDate !== undefined && { dueDate: input.dueDate ? new Date(input.dueDate) : null }),
      },
    });
    return toWorkOrderResponse(row);
  }

  /**
   * Transition a WO's status. Technicians may only transition WOs assigned to
   * them; manager/admin can transition any. Invalid transitions → 400.
   */
  async transition(
    id: string,
    target: WorkOrderStatus,
    user: JwtPayload,
  ): Promise<WorkOrderResponse> {
    const wo = await this.prisma.getClient().workOrder.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    });
    if (!wo) throw new NotFoundException();

    if (user.role === "technician" && wo.assignedToId !== user.sub) {
      throw new ForbiddenException("You can only transition work orders assigned to you");
    }

    if (!canTransition(wo.status, target)) {
      throw new BadRequestException(
        `Cannot transition from "${wo.status}" to "${target}"`,
      );
    }

    const row = await this.prisma.getClient().workOrder.update({
      where: { id },
      data: {
        status: target,
        completedAt: target === "completed" ? new Date() : wo.completedAt,
      },
    });
    return toWorkOrderResponse(row);
  }

  /** Soft-delete: set deletedAt, never hard-delete (audit history preserved). */
  async remove(id: string, companyId: string): Promise<void> {
    await this.get(id, companyId); // 404 if missing/deleted/cross-tenant
    await this.prisma.getClient().workOrder.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // --- helpers ------------------------------------------------------------

  /** assetId and (if set) assignedToId must belong to the caller's company. */
  private async validateFks(
    assetId: string,
    assignedToId: string | null,
    companyId: string,
  ): Promise<void> {
    const asset = await this.prisma.getClient().asset.findFirst({
      where: { id: assetId, companyId },
    });
    if (!asset) {
      throw new BadRequestException("Invalid asset for this company");
    }
    if (assignedToId) {
      const assignee = await this.prisma.getClient().user.findFirst({
        where: { id: assignedToId, companyId },
      });
      if (!assignee) {
        throw new BadRequestException("Invalid assignee for this company");
      }
    }
  }
}
