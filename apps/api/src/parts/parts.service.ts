import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  AdjustPartRequest,
  CreatePartRequest,
  JwtPayload,
  PartFilters,
  PartResponse,
  PaginatedResponse,
  UpdatePartRequest,
} from "@iam/shared";
import { PrismaService } from "../prisma";
import { toPartResponse } from "./to-part-response";

/**
 * Multi-tenant Part CRUD. SKU is unique per company (@@unique([companyId, sku]));
 * a duplicate surfaces as Prisma P2002 and is mapped to 409. Cross-tenant
 * lookups → 404. The lowStock filter selects parts at or below their minQuantity.
 */
@Injectable()
export class PartsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    companyId: string,
    filters: PartFilters,
  ): Promise<PaginatedResponse<PartResponse>> {
    return this.listByArchiveStatus(companyId, filters, false);
  }

  async listArchived(
    companyId: string,
    filters: PartFilters,
  ): Promise<PaginatedResponse<PartResponse>> {
    return this.listByArchiveStatus(companyId, filters, true);
  }

  private async listByArchiveStatus(
    companyId: string,
    filters: PartFilters,
    archived: boolean,
  ): Promise<PaginatedResponse<PartResponse>> {
    const client = this.prisma.getClient();
    const where: Prisma.PartWhereInput = {
      companyId,
      deletedAt: archived ? { not: null } : null,
      OR: filters.search
        ? [
            { name: { contains: filters.search, mode: "insensitive" } },
            { sku: { contains: filters.search, mode: "insensitive" } },
          ]
        : undefined,
      quantity: filters.lowStock
        ? { lte: client.part.fields.minQuantity }
        : undefined,
    };
    const [rows, total] = await Promise.all([
      client.part.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      client.part.count({ where }),
    ]);
    return {
      items: rows.map(toPartResponse),
      page: filters.page,
      pageSize: filters.limit,
      total,
    };
  }

  async get(id: string, companyId: string): Promise<PartResponse> {
    const part = await this.prisma.getClient().part.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!part) throw new NotFoundException();
    return toPartResponse(part);
  }

  async create(
    input: CreatePartRequest,
    user: JwtPayload,
  ): Promise<PartResponse> {
    try {
      const row = await this.prisma.getClient().$transaction(async (tx) => {
        const created = await tx.part.create({
          data: {
            name: input.name,
            sku: input.sku,
            description: input.description ?? null,
            quantity: input.quantity,
            minQuantity: input.minQuantity,
            companyId: user.companyId,
          },
        });
        if (input.quantity > 0) {
          await tx.inventoryMovement.create({
            data: {
              partId: created.id,
              workOrderId: null,
              actorId: user.sub,
              companyId: user.companyId,
              delta: input.quantity,
              kind: "initial_stock",
              reason: "Initial stock",
            },
          });
        }
        return created;
      });
      return toPartResponse(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException("SKU already exists in this company");
      }
      throw err;
    }
  }

  async update(
    id: string,
    input: UpdatePartRequest,
    companyId: string,
  ): Promise<PartResponse> {
    await this.get(id, companyId);
    const data: Prisma.PartUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.sku !== undefined) data.sku = input.sku;
    if (input.description !== undefined) data.description = input.description;
    if (input.minQuantity !== undefined) data.minQuantity = input.minQuantity;
    try {
      const row = await this.prisma.getClient().part.update({
        where: { id },
        data,
      });
      return toPartResponse(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException("SKU already exists in this company");
      }
      throw err;
    }
  }

  async remove(id: string, companyId: string): Promise<void> {
    await this.get(id, companyId);
    await this.prisma.getClient().part.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async restore(id: string, companyId: string): Promise<PartResponse> {
    const client = this.prisma.getClient();
    const restored = await client.part.updateMany({
      where: { id, companyId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    if (restored.count === 0) throw new NotFoundException();

    const row = await client.part.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!row) throw new NotFoundException();
    return toPartResponse(row);
  }

  async adjust(
    id: string,
    input: AdjustPartRequest,
    user: JwtPayload,
  ): Promise<PartResponse> {
    return this.prisma.getClient().$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<
        Array<{ id: string; quantity: number }>
      >`
        SELECT id, quantity
        FROM "Part"
        WHERE id = ${id}
          AND "companyId" = ${user.companyId}
          AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (!locked) throw new NotFoundException();
      if (locked.quantity + input.delta < 0) {
        throw new ConflictException("Adjustment would make stock negative");
      }

      const updated = await tx.part.update({
        where: { id: locked.id },
        data: { quantity: { increment: input.delta } },
      });
      await tx.inventoryMovement.create({
        data: {
          partId: locked.id,
          workOrderId: null,
          actorId: user.sub,
          companyId: user.companyId,
          delta: input.delta,
          kind: "adjustment",
          reason: input.reason,
        },
      });
      return toPartResponse(updated);
    });
  }
}
