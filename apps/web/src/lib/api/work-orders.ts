import type {
  CreateWorkOrderRequest,
  TransitionWorkOrderRequest,
  UpdateWorkOrderRequest,
  WorkOrderFilters,
  WorkOrderResponse,
  WorkOrderStatus,
} from "@iam/shared";
import { apiJson } from "../api-client";

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
  list: (filters: Partial<WorkOrderFilters> = {}) =>
    apiJson<WorkOrderResponse[]>(`${base()}/work-orders${qs(filters)}`),
  get: (id: string) => apiJson<WorkOrderResponse>(`${base()}/work-orders/${id}`),
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
