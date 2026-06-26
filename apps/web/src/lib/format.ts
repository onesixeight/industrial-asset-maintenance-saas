/**
 * Format an ISO date string (or null) for display. Returns "—" for null/empty
 * so callers can render `{fmt(value)}` directly without per-call null checks.
 *
 * The API serializes all temporal fields as full ISO strings
 * ("2026-06-21T01:10:00.444Z"); rendering them raw looks cramped and unreadable,
 * so we format to a locale string everywhere via this helper.
 */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

/**
 * Format a raw enum string from the API for display: title-case, underscores
 * become spaces. e.g. "in_progress" → "In progress", "corrective" → "Corrective".
 */
export function fmtEnum(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
