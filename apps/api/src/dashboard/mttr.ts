/**
 * Mean Time To Resolve — mean of (completedAt − createdAt) in hours across the
 * completed work orders in a window. Returns `null` when nothing has been
 * completed (the rate is undefined, not zero). Pure function, unit-tested
 * directly so the dashboard service can lean on it.
 */
export function computeMttr(
  items: { createdAt: Date; completedAt: Date | null }[],
): number | null {
  const completed = items.filter(
    (i): i is { createdAt: Date; completedAt: Date } => i.completedAt !== null,
  );
  if (completed.length === 0) return null;
  const ms = completed.reduce(
    (sum, i) => sum + (i.completedAt.getTime() - i.createdAt.getTime()),
    0,
  );
  return ms / completed.length / 3_600_000;
}
