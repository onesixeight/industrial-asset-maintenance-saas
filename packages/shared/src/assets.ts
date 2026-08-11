import { z } from "zod";
import { listQuerySchema } from "./reference";
import { dateOnlyToIsoSchema } from "./dates";

export const assetStatusSchema = z.enum(["active", "maintenance", "retired"]);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

export const updateAssetStatusRequestSchema = z.object({
  status: assetStatusSchema,
});
export type UpdateAssetStatusRequest = z.infer<
  typeof updateAssetStatusRequestSchema
>;

export const assetFiltersSchema = listQuerySchema.extend({
  status: assetStatusSchema.optional(),
  locationId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
});
export type AssetFilters = z.infer<typeof assetFiltersSchema>;

const dateOrNull = z.union([z.string().datetime(), z.null()]);
const optionalDateFromForm = z
  .union([dateOnlyToIsoSchema, z.literal("").transform(() => undefined)])
  .optional();

export const createAssetRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  serialNumber: z.string().max(100).optional(),
  locationId: z.string().uuid(),
  categoryId: z.string().uuid(),
  purchaseDate: optionalDateFromForm,
  warrantyDate: optionalDateFromForm,
});
export type CreateAssetRequest = z.infer<typeof createAssetRequestSchema>;

export const updateAssetRequestSchema = createAssetRequestSchema.partial();
export type UpdateAssetRequest = z.infer<typeof updateAssetRequestSchema>;

export const assetResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  serialNumber: z.string().nullable(),
  qrCode: z.string(),
  status: assetStatusSchema,
  locationId: z.string().uuid(),
  categoryId: z.string().uuid(),
  companyId: z.string().uuid(),
  purchaseDate: dateOrNull,
  warrantyDate: dateOrNull,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AssetResponse = z.infer<typeof assetResponseSchema>;
