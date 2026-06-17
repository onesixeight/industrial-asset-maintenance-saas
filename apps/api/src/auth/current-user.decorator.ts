import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import type { JwtPayload } from "@iam/shared";

/**
 * Extracts the validated JWT payload attached to req.user by JwtStrategy.
 * Usage: `me(@CurrentUser() user: JwtPayload)`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as JwtPayload;
  },
);
