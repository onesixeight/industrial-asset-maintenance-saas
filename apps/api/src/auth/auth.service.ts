import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import type {
  AuthResponse,
  RegisterRequest,
  LoginRequest,
  JwtPayload,
  UserResponse,
  UserRole,
} from "@iam/shared";
import { PrismaService } from "../prisma";
import { TokenService } from "./token.service";

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Transactionally create a Company + its first admin User, then issue a
   * token pair. Spec §3.2: registration is the first-admin bootstrap; later
   * users join via /users (Phase 2).
   */
  async register(input: RegisterRequest): Promise<AuthResponse> {
    const existing = await this.prisma.getClient().user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException("Email already registered");
    }
    const password = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    let user;
    try {
      user = await this.prisma.getClient().$transaction(async (tx) => {
        const company = await tx.company.create({ data: { name: input.company } });
        return tx.user.create({
          data: {
            email: input.email,
            password,
            firstName: input.firstName,
            lastName: input.lastName,
            // First user of a company is the admin (spec §3.2, §5).
            role: "admin",
            companyId: company.id,
          },
        });
      });
    } catch (err) {
      // The pre-check above is a fast-path; the unique constraint on
      // User.email is the source of truth. A concurrent registration that
      // wins the race surfaces here as P2002 — map it to 409 rather than 500.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException("Email already registered");
      }
      throw err;
    }
    const userResponse = this.toUserResponse(user);
    const pair = await this.tokens.issuePair({
      userId: user.id,
      companyId: user.companyId,
      role: user.role,
    });
    return { ...pair, user: userResponse };
  }

  async login(input: LoginRequest): Promise<AuthResponse> {
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
    const userResponse = this.toUserResponse(user);
    const pair = await this.tokens.issuePair({
      userId: user.id,
      companyId: user.companyId,
      role: user.role,
    });
    return { ...pair, user: userResponse };
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
    return this.toUserResponse(user);
  }

  private toUserResponse(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    companyId: string;
    mustChangePassword: boolean;
  }): UserResponse {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      companyId: user.companyId,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
