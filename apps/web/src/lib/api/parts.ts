import type {
  AdjustPartRequest,
  ConsumePartRequest,
  CreatePartRequest,
  PaginatedResponse,
  PartFilters,
  PartResponse,
  UpdatePartRequest,
  WorkOrderPartResponse,
} from "@iam/shared";
import { apiJson } from "../api-client";
import { pageQuery, type PageRequest } from "./pagination";

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
  list: (filters: Partial<PartFilters> = {}, signal?: AbortSignal) =>
    apiJson<PaginatedResponse<PartResponse>>(`${base()}/parts${qs(filters)}`, {
      signal,
    }),
  page: (
    filters: Partial<PartFilters>,
    request: PageRequest,
    signal?: AbortSignal,
  ) => partsApi.list(pageQuery(filters, request), signal),
  listArchived: (filters: Partial<PartFilters> = {}, signal?: AbortSignal) =>
    apiJson<PaginatedResponse<PartResponse>>(
      `${base()}/parts/archived${qs(filters)}`,
      { signal },
    ),
  archivedPage: (
    filters: Partial<PartFilters>,
    request: PageRequest,
    signal?: AbortSignal,
  ) => partsApi.listArchived(pageQuery(filters, request), signal),
  get: (id: string, signal?: AbortSignal) =>
    apiJson<PartResponse>(`${base()}/parts/${id}`, { signal }),
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
  adjust: (id: string, input: AdjustPartRequest) =>
    apiJson<PartResponse>(`${base()}/parts/${id}/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    apiJson<void>(`${base()}/parts/${id}`, { method: "DELETE" }),
  restore: (id: string) =>
    apiJson<PartResponse>(`${base()}/parts/${id}/restore`, { method: "POST" }),
};

export const workOrderPartsApi = {
  list: (workOrderId: string, signal?: AbortSignal) =>
    apiJson<WorkOrderPartResponse[]>(
      `${base()}/work-orders/${workOrderId}/parts`,
      { signal },
    ),
  consume: (workOrderId: string, input: ConsumePartRequest) =>
    apiJson<WorkOrderPartResponse>(
      `${base()}/work-orders/${workOrderId}/parts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    ),
  restock: (workOrderId: string, partId: string) =>
    apiJson<void>(`${base()}/work-orders/${workOrderId}/parts/${partId}`, {
      method: "DELETE",
    }),
};
