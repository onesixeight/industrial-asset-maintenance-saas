import type { InspectionResult } from "@iam/shared";

/**
 * Validate inspection results against a template and compute `passed`.
 *
 * `passed` = true only if every template item has exactly one result with
 * value "pass" (PROJECT_PLAN §512, critical-path test exec spec §3.1). Missing,
 * duplicate, extra, or any "fail" → passed=false. Malformed results (unknown
 * ids, wrong count) → `{ ok: false }` so the caller surfaces a 400.
 */
export function validateResults(
  templateItemIds: string[],
  results: InspectionResult[],
): { ok: true; passed: boolean } | { ok: false; reason: string } {
  const seen = new Map<string, "pass" | "fail">();
  for (const r of results) {
    if (!templateItemIds.includes(r.itemId)) {
      return { ok: false, reason: `Unknown item id: ${r.itemId}` };
    }
    if (seen.has(r.itemId)) {
      return { ok: false, reason: `Duplicate result for item: ${r.itemId}` };
    }
    seen.set(r.itemId, r.value);
  }
  for (const id of templateItemIds) {
    if (!seen.has(id)) {
      return { ok: false, reason: `Missing result for item: ${id}` };
    }
  }
  return {
    ok: true,
    passed: templateItemIds.every((id) => seen.get(id) === "pass"),
  };
}
