import { refreshApi } from "../api/auth";
import { useAuthStore } from "./store";

let refreshing: Promise<boolean> | null = null;

/**
 * Attempt one silent refresh. Returns true on success (store updated), false
 * on failure (caller should log out). Concurrent callers share the single
 * in-flight refresh promise.
 */
export function silentRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const { accessToken } = await refreshApi();
      useAuthStore.getState().setToken(accessToken);
      return true;
    } catch {
      useAuthStore.getState().clear();
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export function logoutOnFailure(): void {
  useAuthStore.getState().clear();
}
