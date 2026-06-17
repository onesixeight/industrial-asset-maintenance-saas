import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt } from "passport-jwt";
import { Strategy } from "passport-jwt";
import type { JwtPayload } from "@iam/shared";
import { TokenService } from "./token.service";

/**
 * Extracts a Bearer token from the Authorization header and verifies it via
 * TokenService (signature + Redis denylist). On success req.user is set to
 * the JwtPayload; on failure passport returns 401.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(private readonly tokens: TokenService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // TokenService does its own signature verification (incl. denylist),
      // so we pass the raw token through validate() instead of letting
      // passport verify the signature separately. ignoreExpiration=false is
      // moot since secretOrKey is unused in pass-through mode.
      secretOrKey: "unused-pass-through",
      ignoreExpiration: false,
    });
  }

  // Passport calls validate(payload) AFTER verifying the signature. Because
  // we want denylist checks + a single verification source, we instead take
  // the raw token from the request and re-verify with TokenService.
  authenticate(req: any): void {
    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) {
      this.fail(UnauthorizedException, 401);
      return;
    }
    this.tokens
      .verify(token, "access")
      .then((payload) => {
        if (!payload) {
          this.fail(UnauthorizedException, 401);
          return;
        }
        this.success(payload);
      })
      .catch(() => this.fail(UnauthorizedException, 401));
  }

  // Required by PassportStrategy typing; not used in pass-through mode.
  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
