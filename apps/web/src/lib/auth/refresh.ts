import { meApi, refreshApi } from "../api/auth";
import {
  acceptRefreshedIdentity,
  clearIdentity,
  currentIdentityTransition,
} from "./session";

let refreshing: { generation: number; promise: Promise<boolean> } | null = null;

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
  const transition = currentIdentityTransition();
  if (refreshing?.generation === transition.generation)
    return refreshing.promise;
  const record = {
    generation: transition.generation,
    promise: (async () => {
      try {
        const { accessToken } = await refreshApi(transition.signal);
        // /me is the source of truth for the current user; fetch it with the
        // fresh token and populate the store in one step so status transitions
        // idle → authenticated (not the half-state setToken would leave).
        const user = await meApi(accessToken, transition.signal);
        return acceptRefreshedIdentity(user, accessToken, transition);
      } catch {
        if (currentIdentityTransition().generation !== transition.generation)
          return false;
        await clearIdentity();
        return false;
      } finally {
        if (refreshing?.generation === transition.generation) refreshing = null;
      }
    })(),
  };
  refreshing = record;
  return record.promise;
}
