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
  CreateTemplateRequest,
  InspectionFilters,
  JwtPayload,
  SubmitInspectionRequest,
  UpdateTemplateRequest,
} from "@iam/shared";
import {
  createTemplateRequestSchema,
  inspectionFiltersSchema,
  submitInspectionRequestSchema,
  updateTemplateRequestSchema,
} from "@iam/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { InspectionsService } from "./inspections.service";

/**
 * Inspection templates + submissions. Reads open to any authenticated user.
 * Template writes (create/edit/delete) require admin/manager. Submitting an
 * inspection is open to technician/manager/admin (the field workers). Static
 * `/templates` segments are declared before `:id` so they aren't swallowed.
 */
@ApiTags("inspections")
@Controller("inspections")
@UseGuards(JwtAuthGuard)
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  // --- Templates (static segment before :id) -------------------------------

  @Get("templates")
  listTemplates(
    @CurrentUser() user: JwtPayload,
    @Query("search") search?: string,
  ) {
    return this.inspections.listTemplates(user.companyId, search);
  }

  @Get("templates/:id")
  getTemplate(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.inspections.getTemplate(id, user.companyId);
  }

  @Post("templates")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  @HttpCode(HttpStatus.CREATED)
  createTemplate(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createTemplateRequestSchema)) body: CreateTemplateRequest,
  ) {
    return this.inspections.createTemplate(body, user.companyId);
  }

  @Patch("templates/:id")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  updateTemplate(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTemplateRequestSchema)) body: UpdateTemplateRequest,
  ) {
    return this.inspections.updateTemplate(id, body, user.companyId);
  }

  @Delete("templates/:id")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTemplate(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.inspections.removeTemplate(id, user.companyId);
  }

  // --- Inspections ---------------------------------------------------------

  @Get()
  listInspections(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(inspectionFiltersSchema)) q: InspectionFilters,
  ) {
    return this.inspections.listInspections(user.companyId, q);
  }

  @Get(":id")
  getInspection(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.inspections.getInspection(id, user.companyId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("technician", "manager", "admin")
  @HttpCode(HttpStatus.CREATED)
  submit(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(submitInspectionRequestSchema)) body: SubmitInspectionRequest,
  ) {
    return this.inspections.submit(body, user.sub, user.companyId);
  }
}
