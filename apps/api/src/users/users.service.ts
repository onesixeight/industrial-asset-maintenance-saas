import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import type { CreateUserRequest, UserResponse, UserRole } from "@iam/shared";
import { PrismaService } from "../prisma";

const BCRYPT_ROUNDS = 12;

function toUserResponse(u: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  companyId: string;
  mustChangePassword: boolean;
}): UserResponse {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role as UserRole,
    companyId: u.companyId,
    mustChangePassword: u.mustChangePassword,
  };
}

/**
 * Multi-tenant user management. list/create are admin+manager; role-change is
 * admin-only (enforced on the controller). Create sets mustChangePassword=true
 * so the new user is forced through /auth/change-password on first login.
 * Password is never returned (spec §5).
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string): Promise<UserResponse[]> {
    const us = await this.prisma.getClient().user.findMany({
      where: { companyId },
      orderBy: { createdAt: "asc" },
    });
    return us.map(toUserResponse);
  }

  async create(input: CreateUserRequest, companyId: string): Promise<UserResponse> {
    const password = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    try {
      const u = await this.prisma.getClient().user.create({
        data: {
          email: input.email,
          password,
          firstName: input.firstName,
          lastName: input.lastName,
          role: input.role,
          // Force a password change on first login (spec §3.1).
          mustChangePassword: true,
          companyId,
        },
      });
      return toUserResponse(u);
    } catch (err) {
      // The unique constraint on User.email is the source of truth; a race that
      // slips past any future pre-check surfaces as P2002 → 409 (Phase 1a pattern).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Email already registered");
      }
      throw err;
    }
  }

  async changeRole(
    id: string,
    role: UserRole,
    companyId: string,
  ): Promise<UserResponse> {
    const u = await this.prisma.getClient().user.findFirst({
      where: { id, companyId },
    });
    if (!u) throw new NotFoundException();
    const updated = await this.prisma.getClient().user.update({
      where: { id },
      data: { role },
    });
    return toUserResponse(updated);
  }
}
