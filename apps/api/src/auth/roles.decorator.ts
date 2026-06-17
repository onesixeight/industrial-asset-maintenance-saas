import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "@iam/shared";

export const ROLES_KEY = "roles";

/**
 * Restrict a handler to the given roles. Combine with RolesGuard on the
 * controller/handler. Example: `@Roles("admin", "manager")`.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
