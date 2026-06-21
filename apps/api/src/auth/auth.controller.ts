import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import type {
  AuthResponse,
  ChangePasswordRequest,
  JwtPayload,
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  UserResponse,
} from "@iam/shared";
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
} from "@iam/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CurrentUser } from "./current-user.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { Roles } from "./roles.decorator";
import { RolesGuard } from "./roles.guard";
import { AuthService } from "./auth.service";

/** Cookie name carrying the refresh token (httpOnly, sameSite=lax). */
const REFRESH_COOKIE = "refresh_token";

/**
 * Read the refresh token from the httpOnly cookie, falling back to the JSON
 * body (spec §4: refresh "reads refresh from cookie; falls back to body").
 */
function readRefresh(req: Request): string | undefined {
  return req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken;
}

/**
 * Auth endpoints. Body validation via Zod pipes; throttling on the
 * brute-force-sensitive register/login routes. The refresh token travels in an
 * httpOnly cookie (set on register/login, cleared on logout) with a body
 * fallback for non-browser clients (spec §4, §10).
 */
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.register(body);
    this.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.login(body);
    this.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async changePassword(
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    // No Bearer: the blocked login issued no tokens; the caller proves identity
    // with email + currentPassword (spec §5). On success sets the refresh cookie.
    const result = await this.auth.changePassword(body);
    this.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async refresh(@Req() req: Request): Promise<TokenResponse> {
    // Refresh token comes from the httpOnly cookie primarily, with a body
    // fallback (spec §4). No Zod pipe: the body is optional when the cookie
    // is present; AuthService.refresh rejects an empty/invalid token with 401.
    const refreshToken = readRefresh(req) ?? "";
    return this.auth.refresh(refreshToken);
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = readRefresh(req);
    if (refreshToken) await this.auth.logout(refreshToken);
    res.clearCookie(REFRESH_COOKIE, { path: "/" });
    return { success: true };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload): Promise<UserResponse> {
    return this.auth.me(user);
  }

  /**
   * Phase 1 only — exercises RolesGuard end-to-end. Replaced by /users in
   * Phase 2 (spec §8 Test #10).
   */
  @Get("admin-probe")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  adminProbe() {
    return { ok: true };
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      // Path "/" (not "/auth"): the Next.js (dashboard) Server Component
      // guard reads the refresh cookie at /dashboard to decide whether to
      // allow a silent-refresh attempt. The cookie is httpOnly (no JS access)
      // and only /auth/refresh + /auth/logout consume it server-side.
      path: "/",
    });
  }
}
