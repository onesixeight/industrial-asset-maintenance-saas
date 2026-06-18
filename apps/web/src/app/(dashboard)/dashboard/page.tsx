"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { meApi } from "@/lib/api/auth";
import { silentRefresh } from "@/lib/auth/refresh";
import { useAuth, useLogout } from "@/lib/auth/hooks";
import { useAuthStore } from "@/lib/auth/store";
import { Button } from "@/components/button";

export default function DashboardPage() {
  const router = useRouter();
  const { user, status, accessToken } = useAuth();
  const logout = useLogout();

  // On first load the access token is in memory = empty. Attempt one silent
  // refresh (uses the httpOnly refresh cookie) to repopulate it.
  useEffect(() => {
    if (status === "idle") void silentRefresh();
  }, [status]);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => meApi(useAuthStore.getState().accessToken ?? ""),
    enabled: !!accessToken,
  });

  const email = user?.email ?? me.data?.email;
  const loading = status === "idle" || (!!accessToken && !email);

  async function onLogout() {
    await logout.mutateAsync();
    router.push("/login");
  }

  if (loading) return <p className="p-8 text-muted-foreground">Loading…</p>;

  return (
    <main className="flex min-h-screen flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button variant="ghost" onClick={onLogout}>
          Log out
        </Button>
      </div>
      <p className="text-muted-foreground">
        Welcome, {email ?? "user"}. (Full UI lands in Phase 7.)
      </p>
    </main>
  );
}
