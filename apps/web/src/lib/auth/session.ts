import type { QueryClient } from "@tanstack/react-query";
import type { AuthResponse, UserResponse } from "@iam/shared";
import { getActiveQueryClient } from "../query-client";
import { useAuthStore } from "./store";
import {
  beginIdentityGeneration,
  captureIdentityGeneration,
  isCurrentIdentityGeneration,
  type IdentityGeneration,
} from "./identity-generation";

async function clearClientState(
  expectedGeneration: number,
  queryClient?: QueryClient | null,
): Promise<boolean> {
  if (!isCurrentIdentityGeneration(expectedGeneration)) return false;
  const client = queryClient ?? getActiveQueryClient();
  if (!client) return isCurrentIdentityGeneration(expectedGeneration);
  await client.cancelQueries();
  if (!isCurrentIdentityGeneration(expectedGeneration)) return false;
  client.clear();
  return isCurrentIdentityGeneration(expectedGeneration);
}

export function beginIdentityTransition(): IdentityGeneration {
  return beginIdentityGeneration();
}

export async function acceptIdentity(
  identity: Pick<AuthResponse, "user" | "accessToken">,
  queryClient?: QueryClient | null,
  transition: IdentityGeneration = beginIdentityTransition(),
): Promise<boolean> {
  if (!(await clearClientState(transition.generation, queryClient)))
    return false;
  useAuthStore.getState().setAuth(identity.user, identity.accessToken);
  return true;
}

export async function acceptRefreshedIdentity(
  user: UserResponse,
  accessToken: string,
  transition: IdentityGeneration,
  queryClient?: QueryClient | null,
): Promise<boolean> {
  if (!isCurrentIdentityGeneration(transition.generation)) return false;
  const currentUser = useAuthStore.getState().user;
  let commitTransition = transition;
  if (
    !currentUser ||
    currentUser.id !== user.id ||
    currentUser.companyId !== user.companyId
  ) {
    commitTransition = beginIdentityGeneration();
    if (!(await clearClientState(commitTransition.generation, queryClient)))
      return false;
  }
  if (!isCurrentIdentityGeneration(commitTransition.generation)) return false;
  useAuthStore.getState().setAuth(user, accessToken);
  return true;
}

export async function clearIdentity(
  queryClient?: QueryClient | null,
  transition: IdentityGeneration = beginIdentityTransition(),
): Promise<boolean> {
  if (!(await clearClientState(transition.generation, queryClient)))
    return false;
  useAuthStore.getState().clear();
  return true;
}

export function currentIdentityTransition(): IdentityGeneration {
  return captureIdentityGeneration();
}
