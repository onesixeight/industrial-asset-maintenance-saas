import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { CategoryRequest, JwtPayload, ListQuery } from "@iam/shared";
import { categoryRequestSchema, listQuerySchema } from "@iam/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CategoriesService } from "./categories.service";

/**
 * Category CRUD. Reads open to any authenticated user; writes require
 * admin or manager (spec §3.6). Mirror of LocationsController.
 */
@Controller("categories")
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listQuerySchema)) q: ListQuery,
  ) {
    return this.categories.list(user.companyId, q.search);
  }

  @Get(":id")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.categories.get(id, user.companyId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(categoryRequestSchema)) body: CategoryRequest,
  ) {
    return this.categories.create(body, user.companyId);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(categoryRequestSchema)) body: CategoryRequest,
  ) {
    return this.categories.update(id, body, user.companyId);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.categories.remove(id, user.companyId);
  }
}
