import type {
  MarkAllReadResponse,
  NotificationListQuery,
  NotificationResponse,
  PaginatedResponse,
  UnreadCountResponse,
} from "@iam/shared";
import { apiJson } from "../api-client";
import { pageQuery, type PageRequest } from "./pagination";

const base = (): string => process.env.NEXT_PUBLIC_API_URL ?? "/api";

function qs(query: Partial<NotificationListQuery>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const notificationsApi = {
  list: (query: Partial<NotificationListQuery> = {}, signal?: AbortSignal) =>
    apiJson<PaginatedResponse<NotificationResponse>>(
      `${base()}/notifications${qs(query)}`,
      { signal },
    ),
  page: (
    query: Partial<NotificationListQuery>,
    request: PageRequest,
    signal?: AbortSignal,
  ) => notificationsApi.list(pageQuery(query, request), signal),
  unreadCount: (signal?: AbortSignal) =>
    apiJson<UnreadCountResponse>(`${base()}/notifications/unread-count`, {
      signal,
    }),
  markRead: (id: string) =>
    apiJson<NotificationResponse>(`${base()}/notifications/${id}/read`, {
      method: "PATCH",
    }),
  markAllRead: () =>
    apiJson<MarkAllReadResponse>(`${base()}/notifications/read-all`, {
      method: "PATCH",
    }),
};
