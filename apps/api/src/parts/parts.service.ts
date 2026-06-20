import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  CreatePartRequest,
  PartFilters,
  PartResponse,
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

  async list(companyId: string, filters: PartFilters): Promise<PartResponse[]> {
    // Prisma cannot compare two columns (quantity vs minQuantity) in a `where`
    // clause, so the lowStock filter is applied in memory. Parts lists per
    // company are small (hundreds, not millions), so fetching the search match
    // then slicing is acceptable and keeps the filter correctness simple.
    const rows = await this.prisma.getClient().part.findMany({
      where: {
        companyId,
        OR: filters.search
          ? [
              { name: { contains: filters.search, mode: "insensitive" } },
              { sku: { contains: filters.search, mode: "insensitive" } },
            ]
          : undefined,
      },
      orderBy: { createdAt: "desc" },
    });
    let filtered = rows;
    if (filters.lowStock === true) {
      filtered = rows.filter((p) => p.quantity <= p.minQuantity);
    }
    const start = (filters.page - 1) * filters.limit;
    return filtered.slice(start, start + filters.limit).map(toPartResponse);
  }

  async get(id: string, companyId: string): Promise<PartResponse> {
    const part = await this.prisma.getClient().part.findFirst({
      where: { id, companyId },
    });
    if (!part) throw new NotFoundException();
    return toPartResponse(part);
  }

  async create(input: CreatePartRequest, companyId: string): Promise<PartResponse> {
    try {
      const row = await this.prisma.getClient().part.create({
        data: {
          name: input.name,
          sku: input.sku,
          description: input.description ?? null,
          quantity: input.quantity,
          minQuantity: input.minQuantity,
          companyId,
        },
      });
      return toPartResponse(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
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
    if (input.quantity !== undefined) data.quantity = input.quantity;
    if (input.minQuantity !== undefined) data.minQuantity = input.minQuantity;
    try {
      const row = await this.prisma.getClient().part.update({
        where: { id },
        data,
      });
      return toPartResponse(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("SKU already exists in this company");
      }
      throw err;
    }
  }

  async remove(id: string, companyId: string): Promise<void> {
    await this.get(id, companyId);
    await this.prisma.getClient().part.delete({ where: { id } });
  }
}
