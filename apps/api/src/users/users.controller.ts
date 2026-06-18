import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import type {
  ChangeRoleRequest,
  CreateUserRequest,
  JwtPayload,
  UserRole,
} from "@iam/shared";
import { changeRoleRequestSchema, createUserRequestSchema } from "@iam/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { UsersService } from "./users.service";

/**
 * User management. The whole controller requires admin or manager (spec §3.6);
 * the role-change route narrows further to admin-only.
 */
@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "manager")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.users.list(user.companyId);
  }

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createUserRequestSchema)) body: CreateUserRequest,
  ) {
    return this.users.create(body, user.companyId);
  }

  @Patch(":id/role")
  @Roles("admin")
  changeRole(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(changeRoleRequestSchema)) body: ChangeRoleRequest,
  ) {
    return this.users.changeRole(id, body.role as UserRole, user.companyId);
  }
}
