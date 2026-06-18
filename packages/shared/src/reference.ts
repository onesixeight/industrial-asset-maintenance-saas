import { z } from "zod";
import { passwordSchema, userRoleSchema } from "./auth";

/** Common list query: search + page + limit (capped). */
export const listQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const locationRequestSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});
export type LocationRequest = z.infer<typeof locationRequestSchema>;

export const categoryRequestSchema = locationRequestSchema;
export type CategoryRequest = z.infer<typeof categoryRequestSchema>;

export const locationResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  companyId: z.string().uuid(),
});
export type LocationResponse = z.infer<typeof locationResponseSchema>;

export const categoryResponseSchema = locationResponseSchema;
export type CategoryResponse = z.infer<typeof categoryResponseSchema>;

export const createUserRequestSchema = z.object({
  email: z.string().email().max(254),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: userRoleSchema,
  password: passwordSchema,
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const changeRoleRequestSchema = z.object({ role: userRoleSchema });
export type ChangeRoleRequest = z.infer<typeof changeRoleRequestSchema>;

export const changePasswordRequestSchema = z.object({
  email: z.string().email(),
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
