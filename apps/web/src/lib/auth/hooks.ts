"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LoginRequest, RegisterRequest } from "@iam/shared";
import { loginApi, logoutApi, registerApi } from "../api/auth";
import {
  acceptIdentity,
  beginIdentityTransition,
  clearIdentity,
} from "./session";

export { useAuth } from "./store";

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LoginRequest) => {
      const transition = beginIdentityTransition();
      const identity = await loginApi(input, transition.signal);
      return { identity, transition };
    },
    onSuccess: ({ identity, transition }) =>
      acceptIdentity(identity, queryClient, transition),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegisterRequest) => {
      const transition = beginIdentityTransition();
      const identity = await registerApi(input, transition.signal);
      return { identity, transition };
    },
    onSuccess: ({ identity, transition }) =>
      acceptIdentity(identity, queryClient, transition),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const transition = beginIdentityTransition();
      const result = await logoutApi(transition.signal);
      return { result, transition };
    },
    onSuccess: ({ transition }) => clearIdentity(queryClient, transition),
  });
}
