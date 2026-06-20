import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  ConsumePartRequest,
  JwtPayload,
  WorkOrderPartResponse,
} from "@iam/shared";
import { PrismaService } from "../prisma";
import { toPartResponse } from "../parts/to-part-response";

type PartRow = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  quantity: number;
  minQuantity: number;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
};

type WorkOrderPartRow = {
  id: string;
  workOrderId: string;
  partId: string;
  quantity: number;
  createdAt: Date;
  part: PartRow;
};

/**
 * Maps a WorkOrderPart row (with nested part) to the API response shape.
 */
function toWorkOrderPartResponse(r: WorkOrderPartRow): WorkOrderPartResponse {
  return {
    id: r.id,
    workOrderId: r.workOrderId,
    partId: r.partId,
    quantity: r.quantity,
    part: toPartResponse(r.part),
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Transactional parts consumption against a WorkOrder. Consuming decrements
 * `Part.quantity` and upserts a `WorkOrderPart` line — both inside one
 * `prisma.$transaction` so a failure rolls back (no consumption without
 * decrement). Insufficient stock → 409. A low-stock Notification fires only on
 * the downward threshold crossing (was above min, now at/below). Restock
 * (DELETE) reverses the consumption and never triggers a low-stock event.
 */
@Injectable()
export class WorkOrderPartsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workOrderId: string, companyId: string): Promise<WorkOrderPartResponse[]> {
    // Tenant-scope via the work order; an unknown/wrong-tenant WO → empty list.
    const wo = await this.prisma.getClient().workOrder.findFirst({
      where: { id: workOrderId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!wo) return [];
    const rows = await this.prisma.getClient().workOrderPart.findMany({
      where: { workOrderId },
      include: { part: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toWorkOrderPartResponse);
  }

  async consume(
    workOrderId: string,
    input: ConsumePartRequest,
    user: JwtPayload,
  ): Promise<WorkOrderPartResponse> {
    return this.prisma.getClient().$transaction(async (tx) => {
      const wo = await tx.workOrder.findFirst({
        where: { id: workOrderId, companyId: user.companyId, deletedAt: null },
      });
      if (!wo) throw new NotFoundException();

      // Technician may only consume on WOs assigned to them (Phase 4 pattern).
      if (user.role === "technician" && wo.assignedToId !== user.sub) {
        throw new ForbiddenException();
      }

      const part = await tx.part.findFirst({
        where: { id: input.partId, companyId: user.companyId },
      });
      if (!part) throw new NotFoundException("Part not found");

      if (part.quantity < input.quantity) {
        throw new ConflictException("Insufficient stock");
      }

      const newQuantity = part.quantity - input.quantity;
      const crossedLowStock = part.quantity > part.minQuantity && newQuantity <= part.minQuantity;

      const updatedPart = await tx.part.update({
        where: { id: part.id },
        data: { quantity: newQuantity },
      });

      const existing = await tx.workOrderPart.findUnique({
        where: { workOrderId_partId: { workOrderId, partId: part.id } },
      });
      let line: WorkOrderPartRow;
      if (existing) {
        line = (await tx.workOrderPart.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + input.quantity },
          include: { part: true },
        })) as WorkOrderPartRow;
      } else {
        line = (await tx.workOrderPart.create({
          data: { workOrderId, partId: part.id, quantity: input.quantity },
          include: { part: true },
        })) as WorkOrderPartRow;
      }

      // Low-stock trigger — bounded: direct inserts, no read service (Phase 8).
      if (crossedLowStock) {
        const recipients = await tx.user.findMany({
          where: { companyId: user.companyId, role: { in: ["admin", "manager"] } },
          select: { id: true },
        });
        if (recipients.length > 0) {
          await tx.notification.createMany({
            data: recipients.map((r) => ({
              userId: r.id,
              title: "Low stock alert",
              message: `${updatedPart.name} (${updatedPart.sku}) dropped to ${newQuantity} units (min ${part.minQuantity}).`,
            })),
          });
        }
      }

      return toWorkOrderPartResponse(line);
    });
  }

  async restock(workOrderId: string, partId: string, companyId: string): Promise<void> {
    await this.prisma.getClient().$transaction(async (tx) => {
      const line = await tx.workOrderPart.findFirst({
        where: { workOrderId, partId, workOrder: { companyId, deletedAt: null } },
        include: { part: true },
      });
      if (!line) throw new NotFoundException();

      // Restore stock; restock never crosses low-stock downward.
      await tx.part.update({
        where: { id: partId },
        data: { quantity: line.part.quantity + line.quantity },
      });
      await tx.workOrderPart.delete({ where: { id: line.id } });
    });
  }
}
