import type { WorkOrderStatus } from "@iam/shared";

/**
 * Allowed status transitions (spec §3.1). `completed` and `cancelled` are
 * terminal — empty arrays. Data, not scattered if/else, so the graph is
 * unit-testable in isolation and the critical-path test (#3) reads almost
 * identically to the unit test.
 *
 *   open ──→ in_progress ──→ completed
 *               ↑↓
 *            on_hold
 *   {open, in_progress, on_hold} ──→ cancelled
 */
export const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  open: ["in_progress", "cancelled"],
  in_progress: ["on_hold", "completed", "cancelled"],
  on_hold: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
