import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * Protects handlers by requiring a valid (non-revoked) access token via the
 * "jwt" passport strategy. Combine with @Roles() + RolesGuard for authz.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}
