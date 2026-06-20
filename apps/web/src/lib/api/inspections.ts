import type {
  CreateTemplateRequest,
  InspectionFilters,
  InspectionResponse,
  SubmitInspectionRequest,
  TemplateResponse,
  UpdateTemplateRequest,
} from "@iam/shared";
import { apiJson } from "../api-client";

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
  list: (search?: string) =>
    apiJson<TemplateResponse[]>(`${base()}/inspections/templates${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  get: (id: string) => apiJson<TemplateResponse>(`${base()}/inspections/templates/${id}`),
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
    apiJson<void>(`${base()}/inspections/templates/${id}`, { method: "DELETE" }),
};

export const inspectionsApi = {
  list: (filters: Partial<InspectionFilters> = {}) =>
    apiJson<InspectionResponse[]>(`${base()}/inspections${qs(filters)}`),
  get: (id: string) => apiJson<InspectionResponse>(`${base()}/inspections/${id}`),
  submit: (input: SubmitInspectionRequest) =>
    apiJson<InspectionResponse>(`${base()}/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
};
