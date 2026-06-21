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
  ConsumePartRequest,
  CreateWorkOrderRequest,
  JwtPayload,
  TransitionWorkOrderRequest,
  UpdateWorkOrderRequest,
  WorkOrderFilters,
} from "@iam/shared";
import {
  consumePartRequestSchema,
  createWorkOrderRequestSchema,
  transitionWorkOrderRequestSchema,
  updateWorkOrderRequestSchema,
  workOrderFiltersSchema,
} from "@iam/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { WorkOrdersService } from "./work-orders.service";
import { WorkOrderPartsService } from "./work-order-parts.service";

/**
 * WorkOrder CRUD + status transitions + soft-delete. Reads are open to any
 * authenticated user; field writes (create/update) and soft-delete require
 * admin/manager. Status transitions are NOT class-role-gated — the service
 * enforces technician-ownership (assigned WOs) vs manager/admin (any), since
 * "technician if owner" can't be expressed by RolesGuard alone (spec §3.4).
 */
@ApiTags("work-orders")
@Controller("work-orders")
@UseGuards(JwtAuthGuard)
export class WorkOrdersController {
  constructor(
    private readonly workOrders: WorkOrdersService,
    private readonly woParts: WorkOrderPartsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(workOrderFiltersSchema)) q: WorkOrderFilters,
  ) {
    return this.workOrders.list(user.companyId, q);
  }

  @Get(":id")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.workOrders.get(id, user.companyId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createWorkOrderRequestSchema)) body: CreateWorkOrderRequest,
  ) {
    return this.workOrders.create(body, user.companyId);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateWorkOrderRequestSchema)) body: UpdateWorkOrderRequest,
  ) {
    return this.workOrders.update(id, body, user.companyId);
  }

  @Patch(":id/status")
  @HttpCode(HttpStatus.OK)
  transition(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(transitionWorkOrderRequestSchema)) body: TransitionWorkOrderRequest,
  ) {
    // No class-level role gate: service enforces technician-ownership + manager/admin.
    return this.workOrders.transition(id, body.status, user);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.workOrders.remove(id, user.companyId);
  }

  // --- Parts consumption (spec §3.1: transactional decrement) -------------

  @Get(":id/parts")
  listParts(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.woParts.list(id, user.companyId);
  }

  @Post(":id/parts")
  @HttpCode(HttpStatus.CREATED)
  consumePart(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(consumePartRequestSchema)) body: ConsumePartRequest,
  ) {
    // No class-level role gate: service enforces technician-ownership + admin/manager.
    return this.woParts.consume(id, body, user);
  }

  @Delete(":id/parts/:partId")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  @HttpCode(HttpStatus.NO_CONTENT)
  async restockPart(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("partId") partId: string,
  ) {
    await this.woParts.restock(id, partId, user.companyId);
  }
}
