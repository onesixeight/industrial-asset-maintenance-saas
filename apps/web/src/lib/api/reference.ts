import type {
  CategoryRequest,
  CategoryResponse,
  CreateUserRequest,
  ChangeRoleRequest,
  LocationRequest,
  LocationResponse,
  UserRole,
  UserResponse,
} from "@iam/shared";
import { apiJson } from "../api-client";

const base = (): string => process.env.NEXT_PUBLIC_API_URL ?? "/api";

// --- Locations -------------------------------------------------------------

export const locationsApi = {
  list: (search?: string) =>
    apiJson<LocationResponse[]>(`${base()}/locations${search ? `?search=${encodeURIComponent(search)}` : ""}`),
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
  list: (search?: string) =>
    apiJson<CategoryResponse[]>(`${base()}/categories${search ? `?search=${encodeURIComponent(search)}` : ""}`),
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
  list: () => apiJson<UserResponse[]>(`${base()}/users`),
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
