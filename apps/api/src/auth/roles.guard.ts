import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { JwtPayload, UserRole } from "@iam/shared";
import { ROLES_KEY } from "./roles.decorator";

/**
 * Allows the request only if req.user.role is in the @Roles(...) list.
 * Must run AFTER JwtAuthGuard (which populates req.user). If no @Roles
 * metadata is present, access is allowed (role-checking is opt-in).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException("Insufficient role");
    }
    return true;
  }
}
