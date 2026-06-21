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
import type { JwtPayload, LocationRequest, ListQuery } from "@iam/shared";
import { listQuerySchema, locationRequestSchema } from "@iam/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { LocationsService } from "./locations.service";

/**
 * Location CRUD. Reads are open to any authenticated user; writes
 * (create/update/delete) require admin or manager (spec §3.6).
 */
@ApiTags("locations")
@Controller("locations")
@UseGuards(JwtAuthGuard)
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listQuerySchema)) q: ListQuery,
  ) {
    return this.locations.list(user.companyId, q.search);
  }

  @Get(":id")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.locations.get(id, user.companyId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(locationRequestSchema)) body: LocationRequest,
  ) {
    return this.locations.create(body, user.companyId);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(locationRequestSchema)) body: LocationRequest,
  ) {
    return this.locations.update(id, body, user.companyId);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.locations.remove(id, user.companyId);
  }
}
