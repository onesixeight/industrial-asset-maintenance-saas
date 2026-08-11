import { z } from "zod";
import { booleanQuery, listQuerySchema } from "./reference";

// --- Parts ----------------------------------------------------------------

export const partResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  sku: z.string(),
  description: z.string().nullable(),
  quantity: z.number().int(),
  minQuantity: z.number().int(),
  companyId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PartResponse = z.infer<typeof partResponseSchema>;

export const createPartRequestSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  quantity: z.number().int().min(0).default(0),
  minQuantity: z.number().int().min(0).default(0),
});
export type CreatePartRequest = z.infer<typeof createPartRequestSchema>;

export const updatePartRequestSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    sku: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    minQuantity: z.number().int().min(0).optional(),
  })
  .strict();
export type UpdatePartRequest = z.infer<typeof updatePartRequestSchema>;

/** Audited stock mutation. Generic part PATCH intentionally cannot set quantity. */
export const adjustPartRequestSchema = z.object({
  delta: z
    .number()
    .int()
    .refine((value) => value !== 0, "Adjustment must be non-zero"),
  reason: z.string().trim().min(1).max(500),
});
export type AdjustPartRequest = z.infer<typeof adjustPartRequestSchema>;

export const partFiltersSchema = listQuerySchema.extend({
  lowStock: booleanQuery,
});
export type PartFilters = z.infer<typeof partFiltersSchema>;

// --- WorkOrderPart (consumption line items) -------------------------------

export const workOrderPartResponseSchema = z.object({
  id: z.string().uuid(),
  workOrderId: z.string().uuid(),
  partId: z.string().uuid(),
  quantity: z.number().int(),
  part: partResponseSchema,
  createdAt: z.string(),
});
export type WorkOrderPartResponse = z.infer<typeof workOrderPartResponseSchema>;

export const consumePartRequestSchema = z.object({
  partId: z.string().uuid(),
  quantity: z.number().int().min(1),
});
export type ConsumePartRequest = z.infer<typeof consumePartRequestSchema>;
