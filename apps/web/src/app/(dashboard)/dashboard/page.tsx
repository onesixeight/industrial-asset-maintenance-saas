"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth, useLogout } from "@/lib/auth/hooks";
import { clearIdentity } from "@/lib/auth/session";
import { dashboardApi } from "@/lib/api/dashboard";
import { downloadWorkOrdersCsv } from "@/lib/api/reports";
import { Button } from "@/components/button";

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-background p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint ? (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, status } = useAuth();
  const logout = useLogout();
  const [exportStatus, setExportStatus] = useState<{
    tone: "info" | "error";
    message: string;
  } | null>(null);

  const { data: stats, isError: statsError } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: ({ signal }) => dashboardApi.stats(signal),
    enabled: status === "authenticated",
  });
  const { data: trends, isError: trendsError } = useQuery({
    queryKey: ["dashboard-trends"],
    queryFn: ({ signal }) => dashboardApi.trends(30, signal),
    enabled: status === "authenticated",
  });

  async function onLogout() {
    // Best-effort: revoke the refresh cookie server-side, but always clear the
    // local session and redirect — a failed logout must not strand the user.
    try {
      await logout.mutateAsync();
    } catch {
      await clearIdentity();
    }
    router.push("/login");
  }

  async function onExport() {
    setExportStatus({ tone: "info", message: "Preparing CSV..." });
    try {
      await downloadWorkOrdersCsv();
      setExportStatus({ tone: "info", message: "CSV downloaded." });
    } catch {
      setExportStatus({ tone: "error", message: "Export failed. Try again." });
    }
  }

  if (status === "idle")
    return <p className="text-muted-foreground">Loading…</p>;
  if (status === "unauthenticated") return null; // redirecting to /login

  const maxWorkOrderActivity = Math.max(
    1,
    ...(trends?.series.flatMap((point) => [
      point.woCreated,
      point.woCompleted,
    ]) ?? [1]),
  );
  const maintenancePct =
    stats && stats.assets.total > 0
      ? Math.round((stats.assets.maintenance / stats.assets.total) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div
          className="grid gap-2 sm:flex"
          role="group"
          aria-label="Dashboard actions"
        >
          <Button variant="ghost" onClick={onExport}>
            Export work orders (CSV)
          </Button>
          <Button variant="ghost" onClick={onLogout}>
            Log out
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Signed in as {user?.email ?? "user"}.
      </p>
      {exportStatus ? (
        <p
          className={`text-sm ${exportStatus.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {exportStatus.message}
        </p>
      ) : null}

      {statsError ? (
        <p className="text-sm text-destructive">
          Dashboard stats failed to load.
        </p>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <KpiCard label="Open work orders" value={stats.workOrders.open} />
          <KpiCard label="In progress" value={stats.workOrders.inProgress} />
          <KpiCard label="On hold" value={stats.workOrders.onHold} />
          <KpiCard
            label="Overdue"
            value={stats.workOrders.overdue}
            hint="non-terminal, past due"
          />
          <KpiCard
            label="Inspections (30d)"
            value={stats.inspections.last30Days}
            hint={
              stats.inspections.passRate === null
                ? "no inspections"
                : `${Math.round(stats.inspections.passRate * 100)}% passed`
            }
          />
          <KpiCard
            label="Assets in maintenance"
            value={stats.assets.maintenance}
            hint={`${maintenancePct}% of ${stats.assets.total}`}
          />
          <KpiCard label="Low-stock parts" value={stats.parts.lowStock} />
          <KpiCard label="Out-of-stock parts" value={stats.parts.outOfStock} />
        </div>
      ) : (
        <p className="text-muted-foreground">Loading stats…</p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">
            Work orders — last {trends?.windowDays ?? 30} days
          </h2>
          {trends && trends.mttrHours !== null && trends.mttrHours > 0 ? (
            <span className="text-sm text-muted-foreground">
              MTTR: {trends.mttrHours.toFixed(1)}h
            </span>
          ) : null}
        </div>
        {trendsError ? (
          <p className="text-sm text-destructive">
            Work-order trend failed to load.
          </p>
        ) : trends && trends.series.length > 0 ? (
          <figure
            aria-label={`Work orders created and completed over the last ${trends.windowDays} days`}
          >
            <figcaption className="mb-2 flex flex-wrap justify-end gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-sm bg-primary/70"
                />
                Created
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-sm bg-foreground/35"
                />
                Completed
              </span>
            </figcaption>
            <div className="flex h-40 items-end gap-1 rounded-[var(--radius)] border border-border bg-background p-3">
              {trends.series.map((point) => (
                <div
                  key={point.date}
                  role="group"
                  aria-label={`${point.date}: ${point.woCreated} created, ${point.woCompleted} completed`}
                  className="flex h-full flex-1 items-end justify-center gap-px"
                >
                  <div
                    aria-hidden="true"
                    className="w-1/2 rounded-t bg-primary/70"
                    style={{
                      height: `${(point.woCreated / maxWorkOrderActivity) * 100}%`,
                      minHeight: point.woCreated > 0 ? "4px" : "0",
                    }}
                  />
                  <div
                    aria-hidden="true"
                    className="w-1/2 rounded-t bg-foreground/35"
                    style={{
                      height: `${(point.woCompleted / maxWorkOrderActivity) * 100}%`,
                      minHeight: point.woCompleted > 0 ? "4px" : "0",
                    }}
                  />
                </div>
              ))}
            </div>
          </figure>
        ) : (
          <p className="text-sm text-muted-foreground">
            No work-order activity in this window.
          </p>
        )}
      </div>
    </div>
  );
}
