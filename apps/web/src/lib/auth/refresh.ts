import { meApi, refreshApi } from "../api/auth";
import { useAuthStore } from "./store";

let refreshing: Promise<boolean> | null = null;

/**
 * Attempt one silent refresh. On success, fetch /me with the new access token
 * and store { user, accessToken } (which also flips status to "authenticated").
 * On failure, clear auth (status → "unauthenticated"). Concurrent callers share
 * the single in-flight refresh promise.
 *
 * Returns true on a restored session, false otherwise (caller should redirect
 * to /login).
 */
export function silentRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const { accessToken } = await refreshApi();
      // /me is the source of truth for the current user; fetch it with the
      // fresh token and populate the store in one step so status transitions
      // idle → authenticated (not the half-state setToken would leave).
      const user = await meApi(accessToken);
      useAuthStore.getState().setAuth(user, accessToken);
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
