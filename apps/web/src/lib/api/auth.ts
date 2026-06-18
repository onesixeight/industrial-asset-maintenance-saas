import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  UserResponse,
} from "@iam/shared";

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

export function registerApi(input: RegisterRequest): Promise<AuthResponse> {
  return fetch(`${base()}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  }).then(json<AuthResponse>);
}

export function loginApi(input: LoginRequest): Promise<AuthResponse> {
  return fetch(`${base()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  }).then(json<AuthResponse>);
}

export function refreshApi(): Promise<TokenResponse> {
  return fetch(`${base()}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  }).then(json<TokenResponse>);
}

export function logoutApi(): Promise<{ success: boolean }> {
  return fetch(`${base()}/auth/logout`, {
    method: "POST",
    credentials: "include",
  }).then(json<{ success: boolean }>);
}

export function meApi(accessToken: string): Promise<UserResponse> {
  return fetch(`${base()}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  }).then(json<UserResponse>);
}
