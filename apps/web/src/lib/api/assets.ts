import type {
  AssetFilters,
  AssetResponse,
  CreateAssetRequest,
  PaginatedResponse,
  UpdateAssetRequest,
  UpdateAssetStatusRequest,
} from "@iam/shared";
import { apiFetch, apiJson } from "../api-client";
import { pageQuery, type PageRequest } from "./pagination";

const base = (): string => process.env.NEXT_PUBLIC_API_URL ?? "/api";

function qs(filters: Partial<AssetFilters>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const assetsApi = {
  list: (filters: Partial<AssetFilters> = {}, signal?: AbortSignal) =>
    apiJson<PaginatedResponse<AssetResponse>>(
      `${base()}/assets${qs(filters)}`,
      { signal },
    ),
  page: (
    filters: Partial<AssetFilters>,
    request: PageRequest,
    signal?: AbortSignal,
  ) => assetsApi.list(pageQuery(filters, request), signal),
  get: (id: string, signal?: AbortSignal) =>
    apiJson<AssetResponse>(`${base()}/assets/${id}`, { signal }),
  create: (input: CreateAssetRequest) =>
    apiJson<AssetResponse>(`${base()}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  update: (id: string, input: UpdateAssetRequest) =>
    apiJson<AssetResponse>(`${base()}/assets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  updateStatus: (id: string, input: UpdateAssetStatusRequest) =>
    apiJson<AssetResponse>(`${base()}/assets/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    apiJson<void>(`${base()}/assets/${id}`, { method: "DELETE" }),
  scan: (token: string, signal?: AbortSignal) =>
    apiJson<AssetResponse>(`${base()}/assets/qr/${token}`, { signal }),
  rotateQr: (id: string) =>
    apiJson<AssetResponse>(`${base()}/assets/${id}/qr/rotate`, {
      method: "POST",
    }),
  /** Fetch the QR SVG markup (authenticated). Returns SVG text. */
  getQrSvg: async (id: string, signal?: AbortSignal): Promise<string> => {
    const res = await apiFetch(`${base()}/assets/${id}/qr`, { signal });
    if (!res.ok)
      throw Object.assign(new Error(`HTTP ${res.status}`), {
        status: res.status,
      });
    return res.text();
  },
};
