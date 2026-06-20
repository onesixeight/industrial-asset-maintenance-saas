import type { StatsResponse, TrendsResponse } from "@iam/shared";
import { apiJson } from "../api-client";

const base = (): string => process.env.NEXT_PUBLIC_API_URL ?? "/api";

export const dashboardApi = {
  stats: () => apiJson<StatsResponse>(`${base()}/dashboard/stats`),
  trends: (days = 30) => apiJson<TrendsResponse>(`${base()}/dashboard/trends?days=${days}`),
};
