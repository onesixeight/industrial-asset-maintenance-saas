import { describe, expect, it } from "vitest";
import { RolesGuard } from "./roles.guard";
import type { JwtPayload } from "@iam/shared";

function ctx(user: JwtPayload | undefined, roles?: string[]) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => "h",
    getClass: () => "C",
  } as never;
}

function makeGuard(roles?: string[]) {
  return new RolesGuard({
    getAllAndOverride: () => roles,
  } as never);
}

const USER = (role: JwtPayload["role"]): JwtPayload =>
  ({
    sub: "12345678-1234-1234-1234-123456789012",
    companyId: "11111111-1111-1111-1111-111111111111",
    role,
    jti: "22222222-2222-2222-2222-222222222222",
    typ: "access",
  }) as JwtPayload;

describe("RolesGuard", () => {
  it("allows when no roles required", () => {
    const g = makeGuard(undefined);
    expect(g.canActivate(ctx(USER("viewer")) as never)).toBe(true);
  });

  it("allows when user role is in the required list", () => {
    const g = makeGuard(["admin", "manager"]);
    expect(g.canActivate(ctx(USER("manager")) as never)).toBe(true);
  });

  it("throws ForbiddenException when role is insufficient", () => {
    const g = makeGuard(["admin"]);
    expect(() => g.canActivate(ctx(USER("viewer")) as never)).toThrow(/Insufficient role/);
  });

  it("throws ForbiddenException when no user present", () => {
    const g = makeGuard(["admin"]);
    expect(() => g.canActivate(ctx(undefined) as never)).toThrow(/Insufficient role/);
  });
});
