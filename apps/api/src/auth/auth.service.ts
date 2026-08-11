import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import type {
  AuthResponse,
  ChangePasswordRequest,
  RegisterRequest,
  LoginRequest,
  JwtPayload,
  UserResponse,
  UserRole,
} from "@iam/shared";
import { PrismaService } from "../prisma";
import { TokenService, type IssuedTokenPair } from "./token.service";

const BCRYPT_ROUNDS = 12;
type IssuedAuthResponse = AuthResponse & Pick<IssuedTokenPair, "refreshToken">;
type LockedRefreshUser = {
  id: string;
  companyId: string;
  role: UserRole;
  sessionVersion: number;
  mustChangePassword: boolean;
};

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
  async register(input: RegisterRequest): Promise<IssuedAuthResponse> {
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
        const company = await tx.company.create({
          data: { name: input.company },
        });
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
      sessionVersion: user.sessionVersion,
    });
    return { ...pair, user: userResponse };
  }

  async login(input: LoginRequest): Promise<IssuedAuthResponse> {
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
    // Force-change gate: users created via /users carry a temp password and
    // must change it before they can receive tokens (spec §5). The 403 body
    // carries a code so the client routes to /change-password, not a generic 403.
    if (user.mustChangePassword) {
      throw new ForbiddenException({ code: "MUST_CHANGE_PASSWORD" });
    }
    const userResponse = this.toUserResponse(user);
    const pair = await this.tokens.issuePair({
      userId: user.id,
      companyId: user.companyId,
      role: user.role,
      sessionVersion: user.sessionVersion,
    });
    return { ...pair, user: userResponse };
  }

  /**
   * Verify the current password, set the new one, clear the force-change flag,
   * and issue a fresh token pair (so the caller is now authenticated). Used by
   * the force-change flow (spec §5) — note this is NOT a Bearer endpoint: the
   * blocked login issued no tokens, so the caller proves identity with
   * email + currentPassword.
   */
  async changePassword(
    input: ChangePasswordRequest,
  ): Promise<IssuedAuthResponse> {
    const user = await this.prisma.getClient().user.findUnique({
      where: { email: input.email },
    });
    if (!user) {
      // Constant-time-ish: still hash to avoid user-enumeration timing.
      await bcrypt.hash(input.currentPassword, BCRYPT_ROUNDS);
      throw new UnauthorizedException("Invalid credentials");
    }
    const ok = await bcrypt.compare(input.currentPassword, user.password);
    if (!ok) {
      throw new UnauthorizedException("Invalid credentials");
    }
    // newPassword is already validated against the shared password policy by
    // the controller's ZodValidationPipe, so no extra check here.
    const password = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
    const updated = await this.prisma.getClient().user.update({
      where: { id: user.id },
      data: {
        password,
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
      },
    });
    const userResponse = this.toUserResponse(updated);
    const pair = await this.tokens.issuePair({
      userId: updated.id,
      companyId: updated.companyId,
      role: updated.role,
      sessionVersion: updated.sessionVersion,
    });
    return { ...pair, user: userResponse };
  }

  async refresh(refreshToken: string) {
    // A consumed jti is still authenticated here: claimRefresh must see it so
    // it can treat the second use as replay and revoke the whole token family.
    const payload = await this.tokens.verifyForRefreshRotation(refreshToken);
    if (!payload) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    return this.prisma.getClient().$transaction(async (tx) => {
      // Lock the identity row until the successor pair has been prepared and
      // the old refresh JTI has been claimed. Role/password updates use the
      // same row and therefore serialize either before this read (old token is
      // rejected) or after issuance (their sessionVersion increment revokes
      // the newly issued refresh token).
      const [user] = await tx.$queryRaw<LockedRefreshUser[]>`
        SELECT "id", "companyId", "role", "sessionVersion", "mustChangePassword"
        FROM "User"
        WHERE "id" = ${payload.sub}
        FOR UPDATE
      `;
      if (
        !user ||
        user.mustChangePassword ||
        user.companyId !== payload.companyId ||
        user.role !== payload.role ||
        user.sessionVersion !== payload.ver
      ) {
        throw new UnauthorizedException("Stale refresh token");
      }

      // Prepare the successor before the irreversible Redis claim. Once NX
      // succeeds there are no remaining fallible external operations inside
      // this callback; competing rotations may prepare tokens, but only the
      // claimant can return them.
      const pair = await this.tokens.issuePair(
        {
          userId: user.id,
          companyId: user.companyId,
          role: user.role,
          sessionVersion: user.sessionVersion,
        },
        payload.sid,
      );
      if (!(await this.tokens.claimRefresh(payload))) {
        throw new UnauthorizedException("Refresh token already used");
      }
      return pair;
    });
  }

  async logout(refreshToken: string): Promise<void> {
    // Intentionally ignore Redis revocation state after authenticating the
    // signature. A user may log out with an already-consumed token; its
    // successor must still be invalidated through the shared family id.
    const payload = await this.tokens.verifyAuthentic(refreshToken, "refresh");
    if (!payload) {
      // Idempotent: logging out with an invalid token is a no-op.
      return;
    }
    await this.tokens.revokeFamily(payload.sid);
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
