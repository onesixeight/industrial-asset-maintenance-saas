import { z } from "zod";

// --- Stats (aggregate KPIs) ------------------------------------------------

export const statsResponseSchema = z.object({
  workOrders: z.object({
    open: z.number().int(),
    inProgress: z.number().int(),
    onHold: z.number().int(),
    completed: z.number().int(),
    cancelled: z.number().int(),
    overdue: z.number().int(),
  }),
  assets: z.object({
    total: z.number().int(),
    maintenance: z.number().int(),
  }),
  inspections: z.object({
    last30Days: z.number().int(),
    passed: z.number().int(),
    passRate: z.number().nullable(),
  }),
  parts: z.object({
    lowStock: z.number().int(),
    outOfStock: z.number().int(),
  }),
});
export type StatsResponse = z.infer<typeof statsResponseSchema>;

// --- Trends ----------------------------------------------------------------

export const trendsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type TrendsQuery = z.infer<typeof trendsQuerySchema>;

export const trendPointSchema = z.object({
  date: z.string(),
  woCreated: z.number().int(),
  woCompleted: z.number().int(),
  inspections: z.number().int(),
});
export type TrendPoint = z.infer<typeof trendPointSchema>;

export const trendsResponseSchema = z.object({
  windowDays: z.number().int(),
  mttrHours: z.number().nullable(),
  series: z.array(trendPointSchema),
});
export type TrendsResponse = z.infer<typeof trendsResponseSchema>;
