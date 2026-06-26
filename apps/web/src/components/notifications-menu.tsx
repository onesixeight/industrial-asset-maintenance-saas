"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "@/lib/api/notifications";
import { useAuth } from "@/lib/auth/hooks";

/**
 * Header bell with an unread badge and a dropdown of recent notifications.
 * The unread-count query polls every 60s (exec spec §3.6); the list query is
 * fetched on dropdown open only (no interval). "Mark all read" invalidates
 * both so the badge updates immediately. The dropdown closes on outside click
 * or Escape.
 */
export function NotificationsMenu() {
  const { status } = useAuth();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape — standard dropdown behavior.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const countQuery = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: () => notificationsApi.unreadCount(),
    enabled: status === "authenticated",
    refetchInterval: 60_000,
  });

  const listQuery = useQuery({
    queryKey: ["notifications", "recent"],
    queryFn: () => notificationsApi.list({ page: 1, limit: 10 }),
    enabled: status === "authenticated" && open,
  });

  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markOne = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const unread = countQuery.data?.count ?? 0;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="relative rounded-[var(--radius)] border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
      >
        🔔
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-[var(--radius)] border border-border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 ? (
              <button
                type="button"
                className="text-xs underline disabled:opacity-50"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {listQuery.isLoading ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
            ) : listQuery.data && listQuery.data.length > 0 ? (
              <ul className="flex flex-col">
                {listQuery.data.map((n) => (
                  <li
                    key={n.id}
                    className={`border-b border-border px-3 py-2 text-sm last:border-b-0 ${
                      n.read ? "bg-background" : "bg-primary/5"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="font-medium">{n.title}</div>
                        <div className="text-muted-foreground">{n.message}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {new Date(n.createdAt).toLocaleString()}
                        </div>
                      </div>
                      {!n.read ? (
                        <button
                          type="button"
                          className="text-xs underline"
                          onClick={() => markOne.mutate(n.id)}
                        >
                          Read
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-4 text-sm text-muted-foreground">No notifications.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
