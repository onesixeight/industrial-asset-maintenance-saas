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

type WorkOrderAuthorizationRow = {
  id: string;
  assignedToId: string | null;
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

  async list(
    workOrderId: string,
    companyId: string,
  ): Promise<WorkOrderPartResponse[]> {
    // Tenant-scope via the work order; an unknown/wrong-tenant WO → empty list.
    const wo = await this.prisma.getClient().workOrder.findFirst({
      where: { id: workOrderId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!wo) return [];
    const rows = await this.prisma.getClient().workOrderPart.findMany({
      where: { workOrderId },
      include: { part: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toWorkOrderPartResponse);
  }

  async consume(
    workOrderId: string,
    input: ConsumePartRequest,
    user: JwtPayload,
  ): Promise<WorkOrderPartResponse> {
    return this.prisma.getClient().$transaction(async (tx) => {
      // Linearize ownership checks with manager reassignment/archive. A
      // technician who lost assignment before this lock is acquired cannot
      // proceed to mutate stock.
      const [wo] = await tx.$queryRaw<WorkOrderAuthorizationRow[]>`
        SELECT id, "assignedToId"
        FROM "WorkOrder"
        WHERE id = ${workOrderId}
          AND "companyId" = ${user.companyId}
          AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (!wo) throw new NotFoundException();

      if (
        user.role !== "admin" &&
        user.role !== "manager" &&
        user.role !== "technician"
      ) {
        throw new ForbiddenException("Your role cannot consume inventory");
      }

      // Technician may only consume on WOs assigned to them (Phase 4 pattern).
      if (user.role === "technician" && wo.assignedToId !== user.sub) {
        throw new ForbiddenException();
      }

      const [part] = await tx.$queryRaw<PartRow[]>`
        SELECT id, name, sku, description, quantity, "minQuantity", "companyId", "createdAt", "updatedAt"
        FROM "Part"
        WHERE id = ${input.partId}
          AND "companyId" = ${user.companyId}
          AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (!part) throw new NotFoundException("Part not found");

      if (part.quantity < input.quantity) {
        throw new ConflictException("Insufficient stock");
      }

      const newQuantity = part.quantity - input.quantity;
      const crossedLowStock =
        part.quantity > part.minQuantity && newQuantity <= part.minQuantity;

      const updatedPart = await tx.part.update({
        where: { id: part.id },
        data: { quantity: { decrement: input.quantity } },
      });

      const line = (await tx.workOrderPart.upsert({
        where: { workOrderId_partId: { workOrderId, partId: part.id } },
        create: { workOrderId, partId: part.id, quantity: input.quantity },
        update: { quantity: { increment: input.quantity } },
        include: { part: true },
      })) as WorkOrderPartRow;

      await tx.inventoryMovement.create({
        data: {
          partId: part.id,
          workOrderId,
          actorId: user.sub,
          companyId: user.companyId,
          delta: -input.quantity,
          kind: "consumption",
          reason: `Consumed for work order ${workOrderId}`,
        },
      });

      // Low-stock trigger — bounded: direct inserts, no read service (Phase 8).
      if (crossedLowStock) {
        const recipients = await tx.user.findMany({
          where: {
            companyId: user.companyId,
            role: { in: ["admin", "manager"] },
          },
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

  async restock(
    workOrderId: string,
    partId: string,
    user: JwtPayload,
  ): Promise<void> {
    if (user.role !== "admin" && user.role !== "manager") {
      throw new ForbiddenException("Your role cannot restock inventory");
    }
    await this.prisma.getClient().$transaction(async (tx) => {
      const [part] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM "Part"
        WHERE id = ${partId} AND "companyId" = ${user.companyId}
        FOR UPDATE
      `;
      if (!part) throw new NotFoundException();

      const [line] = await tx.$queryRaw<
        Array<{ id: string; quantity: number }>
      >`
        SELECT wop.id, wop.quantity
        FROM "WorkOrderPart" wop
        JOIN "WorkOrder" wo ON wo.id = wop."workOrderId"
        WHERE wop."workOrderId" = ${workOrderId}
          AND wop."partId" = ${partId}
          AND wo."companyId" = ${user.companyId}
          AND wo."deletedAt" IS NULL
        FOR UPDATE OF wop
      `;
      if (!line) throw new NotFoundException();

      // Restore stock; restock never crosses low-stock downward.
      await tx.part.update({
        where: { id: part.id },
        data: { quantity: { increment: line.quantity } },
      });
      await tx.inventoryMovement.create({
        data: {
          partId: part.id,
          workOrderId,
          actorId: user.sub,
          companyId: user.companyId,
          delta: line.quantity,
          kind: "restock",
          reason: `Restocked from work order ${workOrderId}`,
        },
      });
      await tx.workOrderPart.delete({ where: { id: line.id } });
    });
  }
}
