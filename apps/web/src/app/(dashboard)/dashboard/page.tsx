"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { silentRefresh } from "@/lib/auth/refresh";
import { useAuth, useLogout } from "@/lib/auth/hooks";
import { useAuthStore } from "@/lib/auth/store";
import { Button } from "@/components/button";

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

  if (status === "idle") return <p className="p-8 text-muted-foreground">Loading…</p>;
  if (status === "unauthenticated") return null; // redirecting to /login

  return (
    <main className="flex min-h-screen flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button variant="ghost" onClick={onLogout}>
          Log out
        </Button>
      </div>
      <p className="text-muted-foreground">
        Welcome, {user?.email ?? "user"}. (Full UI lands in Phase 7.)
      </p>
    </main>
  );
}
