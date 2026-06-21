"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { silentRefresh } from "@/lib/auth/refresh";
import { useAuth, useLogout } from "@/lib/auth/hooks";
import { useAuthStore } from "@/lib/auth/store";
import { dashboardApi } from "@/lib/api/dashboard";
import { downloadWorkOrdersCsv } from "@/lib/api/reports";
import { Button } from "@/components/button";

function KpiCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-background p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, status } = useAuth();
  const logout = useLogout();

  // On first load the access token is in memory = empty. Attempt one silent
  // refresh (uses the httpOnly refresh cookie) to repopulate { user, token }
  // and flip status to "authenticated". If it fails, redirect to /login.
  useEffect(() => {
    if (status !== "idle") return;
    void silentRefresh().then((ok) => {
      if (!ok) router.replace("/login");
    });
  }, [status, router]);

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => dashboardApi.stats(),
    enabled: status === "authenticated",
  });
  const { data: trends } = useQuery({
    queryKey: ["dashboard-trends"],
    queryFn: () => dashboardApi.trends(30),
    enabled: status === "authenticated",
  });

  async function onLogout() {
    // Best-effort: revoke the refresh cookie server-side, but always clear the
    // local session and redirect — a failed logout must not strand the user.
    try {
      await logout.mutateAsync();
    } catch {
      useAuthStore.getState().clear();
    }
    router.push("/login");
  }

  async function onExport() {
    try {
      await downloadWorkOrdersCsv();
    } catch {
      // best-effort: the token may have expired; a real app would surface a toast.
    }
  }

  if (status === "idle") return <p className="text-muted-foreground">Loading…</p>;
  if (status === "unauthenticated") return null; // redirecting to /login

  const maxCreated = Math.max(1, ...(trends?.series.map((p) => p.woCreated) ?? [1]));
  const maintenancePct =
    stats && stats.assets.total > 0
      ? Math.round((stats.assets.maintenance / stats.assets.total) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onExport}>
            Export work orders (CSV)
          </Button>
          <Button variant="ghost" onClick={onLogout}>
            Log out
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Signed in as {user?.email ?? "user"}.</p>

      {stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <KpiCard label="Open work orders" value={stats.workOrders.open} />
          <KpiCard label="In progress" value={stats.workOrders.inProgress} />
          <KpiCard label="On hold" value={stats.workOrders.onHold} />
          <KpiCard label="Overdue" value={stats.workOrders.overdue} hint="non-terminal, past due" />
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
          <h2 className="text-lg font-semibold">Work orders — last {trends?.windowDays ?? 30} days</h2>
          {trends && trends.mttrHours !== null && trends.mttrHours > 0 ? (
            <span className="text-sm text-muted-foreground">
              MTTR: {trends.mttrHours.toFixed(1)}h
            </span>
          ) : null}
        </div>
        {trends && trends.series.length > 0 ? (
          <div className="flex h-40 items-end gap-1 rounded-[var(--radius)] border border-border bg-background p-3">
            {trends.series.map((p) => (
              <div
                key={p.date}
                className="flex flex-1 flex-col justify-end"
                title={`${p.date}: ${p.woCreated} created, ${p.woCompleted} completed`}
              >
                <div
                  className="w-full rounded-t bg-primary/70"
                  style={{ height: `${(p.woCreated / maxCreated) * 100}%`, minHeight: p.woCreated > 0 ? "4px" : "0" }}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No work-order activity in this window.</p>
        )}
      </div>
    </div>
  );
}
