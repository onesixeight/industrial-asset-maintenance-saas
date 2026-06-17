import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import type { RegisterRequest, LoginRequest, JwtPayload, UserResponse } from "@iam/shared";
import { PrismaService } from "../prisma";
import { TokenService } from "./token.service";

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async register(input: RegisterRequest) {
    const existing = await this.prisma.getClient().user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException("Email already registered");
    }
    const password = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = await this.prisma.getClient().user.create({
      data: {
        email: input.email,
        password,
        firstName: input.firstName,
        lastName: input.lastName,
        companyId: input.companyId,
        // Role: schema default (viewer). Admin/manager provisioning is a
        // separate bootstrap flow (Phase 1b/10), out of scope for 1a.
      },
    });
    const pair = await this.tokens.issuePair({
      userId: user.id,
      companyId: user.companyId,
      role: user.role,
    });
    return pair;
  }

  async login(input: LoginRequest) {
    const user = await this.prisma.getClient().user.findUnique({
      where: { email: input.email },
    });
    if (!user) {
      // Constant-time-ish: still hash to avoid user-enumeration timing.
      await bcrypt.hash(input.password, BCRYPT_ROUNDS);
      throw new UnauthorizedException("Invalid credentials");
    }
    const ok = await bcrypt.compare(input.password, user.password);
    if (!ok) {
      throw new UnauthorizedException("Invalid credentials");
    }
    return this.tokens.issuePair({
      userId: user.id,
      companyId: user.companyId,
      role: user.role,
    });
  }

  async refresh(refreshToken: string) {
    const payload = await this.tokens.verify(refreshToken, "refresh");
    if (!payload) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    // Rotate: revoke old refresh, issue a new pair.
    await this.tokens.revoke(payload);
    return this.tokens.issuePair({
      userId: payload.sub,
      companyId: payload.companyId,
      role: payload.role,
    });
  }

  async logout(refreshToken: string): Promise<void> {
    const payload = await this.tokens.verify(refreshToken, "refresh");
    if (!payload) {
      // Idempotent: logging out with an invalid token is a no-op.
      return;
    }
    await this.tokens.revoke(payload);
  }

  async me(payload: JwtPayload): Promise<UserResponse> {
    const user = await this.prisma.getClient().user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      companyId: user.companyId,
    };
  }
}
