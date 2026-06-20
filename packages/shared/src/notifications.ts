import { z } from "zod";
import { listQuerySchema } from "./reference";

// --- Notifications ---------------------------------------------------------

export const notificationResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string(),
  message: z.string(),
  read: z.boolean(),
  createdAt: z.string(),
});
export type NotificationResponse = z.infer<typeof notificationResponseSchema>;

export const notificationListQuerySchema = listQuerySchema;
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const unreadCountResponseSchema = z.object({
  count: z.number().int(),
});
export type UnreadCountResponse = z.infer<typeof unreadCountResponseSchema>;

export const markAllReadResponseSchema = z.object({
  updated: z.number().int(),
});
export type MarkAllReadResponse = z.infer<typeof markAllReadResponseSchema>;
