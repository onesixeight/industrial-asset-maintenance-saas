import type {
  CreateTemplateRequest,
  InspectionFilters,
  InspectionResponse,
  ListQuery,
  PaginatedResponse,
  SubmitInspectionRequest,
  TemplateResponse,
  UpdateTemplateRequest,
} from "@iam/shared";
import { apiJson } from "../api-client";
import { pageQuery, type PageRequest } from "./pagination";

const base = (): string => process.env.NEXT_PUBLIC_API_URL ?? "/api";

function qs(filters: Partial<InspectionFilters>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const templatesApi = {
  list: (query: Partial<ListQuery> = {}, signal?: AbortSignal) =>
    apiJson<PaginatedResponse<TemplateResponse>>(
      `${base()}/inspections/templates${qs(query)}`,
      { signal },
    ),
  page: (
    search: string | undefined,
    request: PageRequest,
    signal?: AbortSignal,
  ) => templatesApi.list(pageQuery({ search }, request), signal),
  get: (id: string, signal?: AbortSignal) =>
    apiJson<TemplateResponse>(`${base()}/inspections/templates/${id}`, {
      signal,
    }),
  create: (input: CreateTemplateRequest) =>
    apiJson<TemplateResponse>(`${base()}/inspections/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  update: (id: string, input: UpdateTemplateRequest) =>
    apiJson<TemplateResponse>(`${base()}/inspections/templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    apiJson<void>(`${base()}/inspections/templates/${id}`, {
      method: "DELETE",
    }),
};

export const inspectionsApi = {
  list: (filters: Partial<InspectionFilters> = {}, signal?: AbortSignal) =>
    apiJson<PaginatedResponse<InspectionResponse>>(
      `${base()}/inspections${qs(filters)}`,
      { signal },
    ),
  page: (
    filters: Partial<InspectionFilters>,
    request: PageRequest,
    signal?: AbortSignal,
  ) => inspectionsApi.list(pageQuery(filters, request), signal),
  get: (id: string, signal?: AbortSignal) =>
    apiJson<InspectionResponse>(`${base()}/inspections/${id}`, { signal }),
  submit: (input: SubmitInspectionRequest) =>
    apiJson<InspectionResponse>(`${base()}/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
};
