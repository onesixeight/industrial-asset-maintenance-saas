"use client";

import { useMutation } from "@tanstack/react-query";
import type { LoginRequest, RegisterRequest } from "@iam/shared";
import { loginApi, logoutApi, registerApi } from "../api/auth";
import { useAuthStore } from "./store";

export { useAuth } from "./store";

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: (input: LoginRequest) => loginApi(input),
    onSuccess: ({ user, accessToken }) => setAuth(user, accessToken),
  });
}

export function useRegister() {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: (input: RegisterRequest) => registerApi(input),
    onSuccess: ({ user, accessToken }) => setAuth(user, accessToken),
  });
}

export function useLogout() {
  const clear = useAuthStore((s) => s.clear);
  return useMutation({
    mutationFn: () => logoutApi(),
    onSuccess: () => clear(),
  });
}
