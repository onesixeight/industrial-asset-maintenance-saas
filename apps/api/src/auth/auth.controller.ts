import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type {
  JwtPayload,
  LoginRequest,
  RefreshRequest,
  RegisterRequest,
  UserResponse,
} from "@iam/shared";
import {
  loginRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
} from "@iam/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";

/**
 * Auth endpoints. Body validation via Zod pipes; throttling on the
 * brute-force-sensitive login/refresh routes.
 */
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
  ) {
    return this.auth.register(body);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest) {
    return this.auth.login(body);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  refresh(@Body(new ZodValidationPipe(refreshRequestSchema)) body: RefreshRequest) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body(new ZodValidationPipe(refreshRequestSchema)) body: RefreshRequest) {
    return this.auth.logout(body.refreshToken);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload): Promise<UserResponse> {
    return this.auth.me(user);
  }
}
