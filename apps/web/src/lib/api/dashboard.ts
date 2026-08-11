import type { StatsResponse, TrendsResponse } from "@iam/shared";
import { apiJson } from "../api-client";

const base = (): string => process.env.NEXT_PUBLIC_API_URL ?? "/api";

export const dashboardApi = {
  stats: (signal?: AbortSignal) =>
    apiJson<StatsResponse>(`${base()}/dashboard/stats`, { signal }),
  trends: (days = 30, signal?: AbortSignal) =>
    apiJson<TrendsResponse>(`${base()}/dashboard/trends?days=${days}`, {
      signal,
    }),
};
