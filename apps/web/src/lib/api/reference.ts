import type {
  CategoryRequest,
  CategoryResponse,
  CreateUserRequest,
  ChangeRoleRequest,
  ListQuery,
  LocationRequest,
  LocationResponse,
  PaginatedResponse,
  UserRole,
  UserResponse,
} from "@iam/shared";
import { apiJson } from "../api-client";
import { pageQuery, type PageRequest } from "./pagination";

const base = (): string => process.env.NEXT_PUBLIC_API_URL ?? "/api";

function qs(query: Partial<ListQuery>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "")
      params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

// --- Locations -------------------------------------------------------------

export const locationsApi = {
  list: (query: Partial<ListQuery> = {}, signal?: AbortSignal) =>
    apiJson<PaginatedResponse<LocationResponse>>(
      `${base()}/locations${qs(query)}`,
      { signal },
    ),
  page: (
    search: string | undefined,
    request: PageRequest,
    signal?: AbortSignal,
  ) => locationsApi.list(pageQuery({ search }, request), signal),
  create: (input: LocationRequest) =>
    apiJson<LocationResponse>(`${base()}/locations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  update: (id: string, input: LocationRequest) =>
    apiJson<LocationResponse>(`${base()}/locations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    apiJson<void>(`${base()}/locations/${id}`, { method: "DELETE" }),
};

// --- Categories (mirror) ---------------------------------------------------

export const categoriesApi = {
  list: (query: Partial<ListQuery> = {}, signal?: AbortSignal) =>
    apiJson<PaginatedResponse<CategoryResponse>>(
      `${base()}/categories${qs(query)}`,
      { signal },
    ),
  page: (
    search: string | undefined,
    request: PageRequest,
    signal?: AbortSignal,
  ) => categoriesApi.list(pageQuery({ search }, request), signal),
  create: (input: CategoryRequest) =>
    apiJson<CategoryResponse>(`${base()}/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  update: (id: string, input: CategoryRequest) =>
    apiJson<CategoryResponse>(`${base()}/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    apiJson<void>(`${base()}/categories/${id}`, { method: "DELETE" }),
};

// --- Users -----------------------------------------------------------------

export const usersApi = {
  list: (query: Partial<ListQuery> = {}, signal?: AbortSignal) =>
    apiJson<PaginatedResponse<UserResponse>>(`${base()}/users${qs(query)}`, {
      signal,
    }),
  page: (request: PageRequest, signal?: AbortSignal, search?: string) =>
    usersApi.list(pageQuery({ search }, request), signal),
  get: (id: string, signal?: AbortSignal) =>
    apiJson<UserResponse>(`${base()}/users/${id}`, { signal }),
  create: (input: CreateUserRequest) =>
    apiJson<UserResponse>(`${base()}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  changeRole: (id: string, input: ChangeRoleRequest) =>
    apiJson<UserResponse>(`${base()}/users/${id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
};

export type { UserRole };
