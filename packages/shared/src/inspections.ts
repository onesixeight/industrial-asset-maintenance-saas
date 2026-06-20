import { z } from "zod";
import { listQuerySchema } from "./reference";

// --- Template items (pass_fail only — spec §3.1) --------------------------

export const inspectionItemTypeSchema = z.literal("pass_fail");

/** Request shape: client sends only the label; id/type are added server-side. */
export const templateItemInputSchema = z.object({
  label: z.string().min(1).max(300),
});

/** Response shape: full item with server-generated id and type. */
export const templateItemResponseSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: inspectionItemTypeSchema,
});
export type TemplateItemResponse = z.infer<typeof templateItemResponseSchema>;

// --- Templates -------------------------------------------------------------

export const createTemplateRequestSchema = z.object({
  name: z.string().min(1).max(200),
  items: z.array(templateItemInputSchema).min(1),
});
export type CreateTemplateRequest = z.infer<typeof createTemplateRequestSchema>;

export const updateTemplateRequestSchema = createTemplateRequestSchema.partial();
export type UpdateTemplateRequest = z.infer<typeof updateTemplateRequestSchema>;

export const templateResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  items: z.array(templateItemResponseSchema),
  companyId: z.string().uuid(),
  createdAt: z.string(),
});
export type TemplateResponse = z.infer<typeof templateResponseSchema>;

// --- Inspections -----------------------------------------------------------

export const inspectionResultSchema = z.object({
  itemId: z.string(),
  value: z.enum(["pass", "fail"]),
});
export type InspectionResult = z.infer<typeof inspectionResultSchema>;

export const submitInspectionRequestSchema = z.object({
  assetId: z.string().uuid(),
  templateId: z.string().uuid(),
  results: z.array(inspectionResultSchema),
  notes: z.string().max(2000).optional(),
});
export type SubmitInspectionRequest = z.infer<typeof submitInspectionRequestSchema>;

export const inspectionResponseSchema = z.object({
  id: z.string().uuid(),
  assetId: z.string().uuid(),
  templateId: z.string().uuid(),
  results: z.array(inspectionResultSchema),
  passed: z.boolean(),
  notes: z.string().nullable(),
  inspectedById: z.string().uuid(),
  companyId: z.string().uuid(),
  createdAt: z.string(),
});
export type InspectionResponse = z.infer<typeof inspectionResponseSchema>;

// Query params arrive as strings: "true"/"false"/absent. z.coerce.boolean()
// would treat `Boolean("false")` as true, so parse explicitly.
const booleanQuery = z
  .preprocess((v) => {
    if (v === undefined || v === null || v === "") return undefined;
    if (v === "true" || v === true) return true;
    if (v === "false" || v === false) return false;
    return undefined;
  }, z.boolean().optional());

export const inspectionFiltersSchema = listQuerySchema.extend({
  assetId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  passed: booleanQuery,
});
export type InspectionFilters = z.infer<typeof inspectionFiltersSchema>;
