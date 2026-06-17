import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { VALIDATED_ENV, type Env } from "../config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { TokenService } from "./token.service";

/**
 * Wires the auth feature: AuthService + TokenService + JwtStrategy + the
 * controller. JWT secret/TTL come from the validated environment; the
 * Prisma/Redis/Config modules are @Global and don't need importing here.
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [VALIDATED_ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_SECRET,
        signOptions: { expiresIn: env.JWT_ACCESS_TTL as unknown as number },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtStrategy],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
