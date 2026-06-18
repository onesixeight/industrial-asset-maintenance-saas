import { useAuthStore } from "./auth/store";
import { silentRefresh } from "./auth/refresh";

export interface ApiError extends Error {
  status: number;
}

function toError(res: Response): ApiError {
  const err = new Error(`HTTP ${res.status}`) as ApiError;
  err.status = res.status;
  return err;
}

/**
 * Authenticated fetch. Attaches the in-memory access token; on a 401 it
 * attempts one silent refresh and retries the request once. A second failure
 * (or a refresh failure) throws and clears auth.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().accessToken;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(input, { ...init, headers, credentials: "include" });
  if (res.status !== 401) return res;

  // 401: try one silent refresh. silentRefresh already clears auth on failure,
  // so here we just surface the original 401 (apiFetch mirrors fetch and
  // returns the Response; apiJson throws on non-ok for callers that want that).
  const refreshed = await silentRefresh();
  if (!refreshed) return res;

  const newToken = useAuthStore.getState().accessToken;
  headers.set("Authorization", `Bearer ${newToken}`);
  const retry = await fetch(input, { ...init, headers, credentials: "include" });
  if (retry.status === 401) {
    useAuthStore.getState().clear();
  }
  return retry;
}

/** JSON helper for authenticated GET/POST/etc. Throws ApiError on non-ok. */
export async function apiJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(input, init);
  if (!res.ok) throw toError(res);
  return res.json() as Promise<T>;
}
