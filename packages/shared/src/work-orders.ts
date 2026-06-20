import { z } from "zod";
import { listQuerySchema } from "./reference";

export const workOrderTypeSchema = z.enum(["preventive", "corrective", "inspection"]);
export type WorkOrderType = z.infer<typeof workOrderTypeSchema>;

export const workOrderStatusSchema = z.enum([
  "open",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
]);
export type WorkOrderStatus = z.infer<typeof workOrderStatusSchema>;

export const prioritySchema = z.enum(["low", "medium", "high", "critical"]);
export type Priority = z.infer<typeof prioritySchema>;

export const workOrderFiltersSchema = listQuerySchema.extend({
  status: workOrderStatusSchema.optional(),
  priority: prioritySchema.optional(),
  assetId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
});
export type WorkOrderFilters = z.infer<typeof workOrderFiltersSchema>;

const isoOrNull = z.union([z.string().datetime(), z.null()]);
const uuidOrNull = z.union([z.string().uuid(), z.null()]);

export const createWorkOrderRequestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: workOrderTypeSchema,
  priority: prioritySchema.default("medium"),
  assetId: z.string().uuid(),
  assignedToId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});
export type CreateWorkOrderRequest = z.infer<typeof createWorkOrderRequestSchema>;

export const updateWorkOrderRequestSchema = createWorkOrderRequestSchema.partial();
export type UpdateWorkOrderRequest = z.infer<typeof updateWorkOrderRequestSchema>;

export const transitionWorkOrderRequestSchema = z.object({ status: workOrderStatusSchema });
export type TransitionWorkOrderRequest = z.infer<typeof transitionWorkOrderRequestSchema>;

export const workOrderResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  type: workOrderTypeSchema,
  status: workOrderStatusSchema,
  priority: prioritySchema,
  assetId: z.string().uuid(),
  assignedToId: uuidOrNull,
  dueDate: isoOrNull,
  completedAt: isoOrNull,
  deletedAt: isoOrNull,
  companyId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkOrderResponse = z.infer<typeof workOrderResponseSchema>;
