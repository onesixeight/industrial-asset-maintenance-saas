import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { LocationRequest, LocationResponse } from "@iam/shared";
import { PrismaService } from "../prisma";

/**
 * Multi-tenant CRUD for Location. Every method is scoped to the caller's
 * companyId (from the JWT) so one company can never see or mutate another's
 * reference data. Cross-tenant lookups by id surface as 404 (no existence leak).
 */
@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string, search?: string): Promise<LocationResponse[]> {
    return this.prisma.getClient().location.findMany({
      where: {
        companyId,
        name: search ? { contains: search, mode: "insensitive" } : undefined,
      },
      orderBy: { name: "asc" },
    });
  }

  async get(id: string, companyId: string): Promise<LocationResponse> {
    const loc = await this.prisma.getClient().location.findFirst({
      where: { id, companyId },
    });
    if (!loc) throw new NotFoundException();
    return loc;
  }

  create(input: LocationRequest, companyId: string): Promise<LocationResponse> {
    return this.prisma.getClient().location.create({
      data: { ...input, companyId },
    });
  }

  async update(
    id: string,
    input: LocationRequest,
    companyId: string,
  ): Promise<LocationResponse> {
    await this.get(id, companyId); // 404 if missing / other tenant
    return this.prisma.getClient().location.update({
      where: { id },
      data: input,
    });
  }

  async remove(id: string, companyId: string): Promise<void> {
    await this.get(id, companyId);
    // Delete guard (spec §3.4 / PROJECT_PLAN §884): a location with assets
    // cannot be removed — protects audit history.
    const assets = await this.prisma.getClient().asset.count({
      where: { locationId: id, companyId },
    });
    if (assets > 0) {
      throw new ConflictException("Location has assets; remove them first");
    }
    await this.prisma.getClient().location.delete({ where: { id } });
  }
}
