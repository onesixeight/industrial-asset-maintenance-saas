import { z } from "zod";

/** Shared health-check response shape, used by both apps to prove wiring. */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
