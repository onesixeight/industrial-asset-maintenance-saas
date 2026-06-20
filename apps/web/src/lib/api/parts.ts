import type {
  ConsumePartRequest,
  CreatePartRequest,
  PartFilters,
  PartResponse,
  UpdatePartRequest,
  WorkOrderPartResponse,
} from "@iam/shared";
import { apiJson } from "../api-client";

const base = (): string => process.env.NEXT_PUBLIC_API_URL ?? "/api";

function qs(filters: Partial<PartFilters>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const partsApi = {
  list: (filters: Partial<PartFilters> = {}) =>
    apiJson<PartResponse[]>(`${base()}/parts${qs(filters)}`),
  get: (id: string) => apiJson<PartResponse>(`${base()}/parts/${id}`),
  create: (input: CreatePartRequest) =>
    apiJson<PartResponse>(`${base()}/parts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  update: (id: string, input: UpdatePartRequest) =>
    apiJson<PartResponse>(`${base()}/parts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  remove: (id: string) => apiJson<void>(`${base()}/parts/${id}`, { method: "DELETE" }),
};

export const workOrderPartsApi = {
  list: (workOrderId: string) =>
    apiJson<WorkOrderPartResponse[]>(`${base()}/work-orders/${workOrderId}/parts`),
  consume: (workOrderId: string, input: ConsumePartRequest) =>
    apiJson<WorkOrderPartResponse>(`${base()}/work-orders/${workOrderId}/parts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  restock: (workOrderId: string, partId: string) =>
    apiJson<void>(`${base()}/work-orders/${workOrderId}/parts/${partId}`, { method: "DELETE" }),
};
