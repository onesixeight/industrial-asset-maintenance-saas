import type {
  CreateWorkOrderRequest,
  PaginatedResponse,
  TransitionWorkOrderRequest,
  UpdateWorkOrderRequest,
  WorkOrderFilters,
  WorkOrderResponse,
  WorkOrderStatus,
} from "@iam/shared";
import { apiJson } from "../api-client";
import { pageQuery, type PageRequest } from "./pagination";

const base = (): string => process.env.NEXT_PUBLIC_API_URL ?? "/api";

function qs(filters: Partial<WorkOrderFilters>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const workOrdersApi = {
  list: (filters: Partial<WorkOrderFilters> = {}, signal?: AbortSignal) =>
    apiJson<PaginatedResponse<WorkOrderResponse>>(
      `${base()}/work-orders${qs(filters)}`,
      { signal },
    ),
  page: (
    filters: Partial<WorkOrderFilters>,
    request: PageRequest,
    signal?: AbortSignal,
  ) => workOrdersApi.list(pageQuery(filters, request), signal),
  get: (id: string, signal?: AbortSignal) =>
    apiJson<WorkOrderResponse>(`${base()}/work-orders/${id}`, { signal }),
  create: (input: CreateWorkOrderRequest) =>
    apiJson<WorkOrderResponse>(`${base()}/work-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  update: (id: string, input: UpdateWorkOrderRequest) =>
    apiJson<WorkOrderResponse>(`${base()}/work-orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  transition: (id: string, input: TransitionWorkOrderRequest) =>
    apiJson<WorkOrderResponse>(`${base()}/work-orders/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    apiJson<void>(`${base()}/work-orders/${id}`, { method: "DELETE" }),
};

export type { WorkOrderStatus };
