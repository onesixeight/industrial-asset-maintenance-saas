import type {
  AuthResponse,
  ChangePasswordRequest,
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  UserResponse,
} from "@iam/shared";
import { apiRequest } from "../api-request";

/** Read at call time (not import time) so tests can swap NEXT_PUBLIC_API_URL. */
const base = (): string => process.env.NEXT_PUBLIC_API_URL ?? "/api";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export function registerApi(
  input: RegisterRequest,
  signal?: AbortSignal,
): Promise<AuthResponse> {
  return apiRequest(`${base()}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal,
    body: JSON.stringify(input),
  }).then(json<AuthResponse>);
}

export async function loginApi(
  input: LoginRequest,
  signal?: AbortSignal,
): Promise<AuthResponse> {
  const res = await apiRequest(`${base()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`) as Error & {
      status: number;
      code?: string;
    };
    err.status = res.status;
    // The force-change 403 carries { code: "MUST_CHANGE_PASSWORD" } (Nest
    // serializes ForbiddenException(obj) as { message: obj }); extract the code
    // so the login form can route to /change-password instead of a generic 403.
    if (res.status === 403) {
      try {
        const body = (await res.clone().json()) as {
          code?: string;
          message?: string | { code?: string };
        };
        const msg = body.message;
        err.code =
          body.code ?? (typeof msg === "object" ? msg.code : undefined);
      } catch {
        // body not JSON or empty — leave code undefined
      }
    }
    throw err;
  }
  return res.json() as Promise<AuthResponse>;
}

export function refreshApi(signal?: AbortSignal): Promise<TokenResponse> {
  return apiRequest(`${base()}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal,
  }).then(json<TokenResponse>);
}

export function logoutApi(signal?: AbortSignal): Promise<{ success: boolean }> {
  return apiRequest(`${base()}/auth/logout`, {
    method: "POST",
    credentials: "include",
    signal,
  }).then(json<{ success: boolean }>);
}

export function meApi(
  accessToken: string,
  signal?: AbortSignal,
): Promise<UserResponse> {
  return apiRequest(`${base()}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
    signal,
  }).then(json<UserResponse>);
}

/** No Bearer: the force-change flow runs after a blocked login issued no tokens. */
export function changePasswordApi(
  input: ChangePasswordRequest,
  signal?: AbortSignal,
): Promise<AuthResponse> {
  return apiRequest(`${base()}/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal,
    body: JSON.stringify(input),
  }).then(json<AuthResponse>);
}
