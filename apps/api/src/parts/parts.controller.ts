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
import { ApiTags } from "@nestjs/swagger";
import type {
  CreatePartRequest,
  JwtPayload,
  PartFilters,
  UpdatePartRequest,
} from "@iam/shared";
import {
  createPartRequestSchema,
  partFiltersSchema,
  updatePartRequestSchema,
} from "@iam/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { PartsService } from "./parts.service";

/**
 * Part CRUD. Reads open to any authenticated user; create/update/delete require
 * admin/manager (Phase 3 RBAC pattern). All operations are tenant-scoped via
 * `user.companyId`. The consumption endpoints live on WorkOrdersController.
 */
@ApiTags("parts")
@Controller("parts")
@UseGuards(JwtAuthGuard)
export class PartsController {
  constructor(private readonly parts: PartsService) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(partFiltersSchema)) q: PartFilters,
  ) {
    return this.parts.list(user.companyId, q);
  }

  @Get(":id")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.parts.get(id, user.companyId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createPartRequestSchema)) body: CreatePartRequest,
  ) {
    return this.parts.create(body, user.companyId);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePartRequestSchema)) body: UpdatePartRequest,
  ) {
    return this.parts.update(id, body, user.companyId);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.parts.remove(id, user.companyId);
  }
}
