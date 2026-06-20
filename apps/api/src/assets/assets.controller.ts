import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import type {
  AssetFilters,
  AssetResponse,
  CreateAssetRequest,
  JwtPayload,
  UpdateAssetRequest,
} from "@iam/shared";
import {
  assetFiltersSchema,
  createAssetRequestSchema,
  updateAssetRequestSchema,
} from "@iam/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { AssetsService } from "./assets.service";

/**
 * Asset CRUD + opaque QR lifecycle. Reads (list/get/scan) are open to any
 * authenticated user; writes (create/update/delete) and QR generation/rotation
 * require admin or manager (spec §3.4).
 *
 * Route order matters: `GET qr/:token` is declared before `GET :id` so the
 * static `qr` segment isn't swallowed by the `:id` param.
 */
@Controller("assets")
@UseGuards(JwtAuthGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(assetFiltersSchema)) q: AssetFilters,
  ) {
    return this.assets.list(user.companyId, q);
  }

  @Get("qr/:token")
  scan(@CurrentUser() user: JwtPayload, @Param("token") token: string): Promise<AssetResponse> {
    return this.assets.findByQr(token, user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.assets.get(id, user.companyId);
  }

  @Get(":id/qr")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  @Header("Content-Type", "image/svg+xml")
  async getQr(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const svg = await this.assets.getQrSvg(id, user.companyId);
    res.send(svg);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createAssetRequestSchema)) body: CreateAssetRequest,
  ) {
    return this.assets.create(body, user.companyId);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateAssetRequestSchema)) body: UpdateAssetRequest,
  ) {
    return this.assets.update(id, body, user.companyId);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.assets.remove(id, user.companyId);
  }

  @Post(":id/qr/rotate")
  @UseGuards(RolesGuard)
  @Roles("admin", "manager")
  rotateQr(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.assets.rotateQr(id, user.companyId);
  }
}
