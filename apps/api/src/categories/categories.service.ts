import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { CategoryRequest, CategoryResponse } from "@iam/shared";
import { PrismaService } from "../prisma";

/**
 * Multi-tenant CRUD for Category. Mirror of LocationsService; the delete guard
 * counts assets referencing the category (spec §3.4 / PROJECT_PLAN §884).
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string, search?: string): Promise<CategoryResponse[]> {
    return this.prisma.getClient().category.findMany({
      where: {
        companyId,
        name: search ? { contains: search, mode: "insensitive" } : undefined,
      },
      orderBy: { name: "asc" },
    });
  }

  async get(id: string, companyId: string): Promise<CategoryResponse> {
    const cat = await this.prisma.getClient().category.findFirst({
      where: { id, companyId },
    });
    if (!cat) throw new NotFoundException();
    return cat;
  }

  create(input: CategoryRequest, companyId: string): Promise<CategoryResponse> {
    return this.prisma.getClient().category.create({
      data: { ...input, companyId },
    });
  }

  async update(
    id: string,
    input: CategoryRequest,
    companyId: string,
  ): Promise<CategoryResponse> {
    await this.get(id, companyId); // 404 if missing / other tenant
    return this.prisma.getClient().category.update({
      where: { id },
      data: input,
    });
  }

  async remove(id: string, companyId: string): Promise<void> {
    await this.get(id, companyId);
    const assets = await this.prisma.getClient().asset.count({
      where: { categoryId: id, companyId },
    });
    if (assets > 0) {
      throw new ConflictException("Category has assets; remove them first");
    }
    await this.prisma.getClient().category.delete({ where: { id } });
  }
}
