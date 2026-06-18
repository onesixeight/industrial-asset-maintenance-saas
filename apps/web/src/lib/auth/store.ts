import { create } from "zustand";
import type { UserResponse } from "@iam/shared";

interface AuthState {
  user: UserResponse | null;
  accessToken: string | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
  setAuth: (user: UserResponse, accessToken: string) => void;
  setToken: (accessToken: string) => void;
  clear: () => void;
  setStatus: (s: AuthState["status"]) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  status: "idle",
  setAuth: (user, accessToken) => set({ user, accessToken, status: "authenticated" }),
  setToken: (accessToken) => set({ accessToken }),
  clear: () => set({ user: null, accessToken: null, status: "unauthenticated" }),
  setStatus: (status) => set({ status }),
}));

/** Read-only selector hook for components. */
export const useAuth = () =>
  useAuthStore((s) => ({
    user: s.user,
    accessToken: s.accessToken,
    status: s.status,
  }));
