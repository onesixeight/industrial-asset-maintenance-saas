import type {
  MarkAllReadResponse,
  NotificationListQuery,
  NotificationResponse,
  UnreadCountResponse,
} from "@iam/shared";
import { apiJson } from "../api-client";

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
  list: (query: Partial<NotificationListQuery> = {}) =>
    apiJson<NotificationResponse[]>(`${base()}/notifications${qs(query)}`),
  unreadCount: () => apiJson<UnreadCountResponse>(`${base()}/notifications/unread-count`),
  markRead: (id: string) =>
    apiJson<NotificationResponse>(`${base()}/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: () =>
    apiJson<MarkAllReadResponse>(`${base()}/notifications/read-all`, { method: "PATCH" }),
};
