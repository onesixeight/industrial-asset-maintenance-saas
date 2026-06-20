import { apiFetch } from "../api-client";

const base = (): string => process.env.NEXT_PUBLIC_API_URL ?? "/api";

/**
 * Download the work-orders CSV. Browsers won't attach the Authorization
 * header to a plain `<a href>`, so we fetch the blob with apiFetch (which
 * handles the token + silent refresh) and trigger a download via an
 * object URL.
 */
export async function downloadWorkOrdersCsv(): Promise<void> {
  const res = await apiFetch(`${base()}/reports/work-orders.csv`, {
    headers: { Accept: "text/csv" },
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "work-orders.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
