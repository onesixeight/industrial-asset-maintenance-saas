import type { WorkOrderStatus } from "@iam/shared";

/**
 * Client-side mirror of the api's allowed-transition map (apps/api/src/work-orders/transitions.ts).
 * Used to render the available transition buttons on the work-order detail page.
 * Kept in sync manually; the api is the source of truth and rejects invalid
 * transitions server-side regardless.
 */
export const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  open: ["in_progress", "cancelled"],
  in_progress: ["on_hold", "completed", "cancelled"],
  on_hold: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};
