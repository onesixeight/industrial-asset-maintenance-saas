import { z } from "zod";

/**
 * Shared auth request/response schemas. Imported by the API (input
 * validation + types) and will be reused by the web client.
 */

export const USER_ROLES = ["admin", "manager", "technician", "viewer"] as const;
export const userRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof userRoleSchema>;

// --- Password policy (shared by register, createUser, changePassword) --------

/** Password policy: min 8, at most 1 letter + 1 digit. */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a digit");

// --- Register ---------------------------------------------------------------

export const registerRequestSchema = z.object({
  email: z.string().email().max(254),
  password: passwordSchema,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  // Company name — registration transactionally creates the Company and its
  // first admin User (spec §3.2 / §4). Later users join via /users (Phase 2).
  company: z.string().min(1).max(100),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

// --- Login ------------------------------------------------------------------

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

// --- Refresh ----------------------------------------------------------------

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

// --- Token response ---------------------------------------------------------

export const tokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Seconds until the access token expires. */
  expiresIn: z.number().int().positive(),
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

// --- Authenticated user (from /me) ------------------------------------------

export const userResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  role: userRoleSchema,
  companyId: z.string().uuid(),
  /** True for users created via /users (admin/manager) until they change it. */
  mustChangePassword: z.boolean(),
});
export type UserResponse = z.infer<typeof userResponseSchema>;

// --- Auth response (register / login) ---------------------------------------

/** Register/login return the authenticated user plus a fresh token pair. */
export const authResponseSchema = tokenResponseSchema.extend({
  user: userResponseSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

// --- JWT payload (internal) -------------------------------------------------

export const jwtPayloadSchema = z.object({
  sub: z.string().uuid(), // userId
  companyId: z.string().uuid(),
  role: userRoleSchema,
  jti: z.string().uuid(), // token id (for denylist)
  typ: z.enum(["access", "refresh"]),
  // Standard JWT claim, present on verified tokens (added by the signer).
  exp: z.number().int().nonnegative().optional(),
});
export type JwtPayload = z.infer<typeof jwtPayloadSchema>;
