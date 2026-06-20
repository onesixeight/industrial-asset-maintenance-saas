import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationsMenu } from "@/components/notifications-menu";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server Component guard: presence of the refresh cookie means the browser
  // *might* have a session (the in-memory access token is gone on reload, but
  // the httpOnly refresh cookie survives). No cookie → no possible session →
  // redirect to /login. Validity is then re-established client-side via a
  // silent refresh on the dashboard page.
  const store = await cookies();
  if (!store.has("refresh_token")) redirect("/login");
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-border px-8 py-2">
          <NotificationsMenu />
        </header>
        <main className="flex-1 overflow-x-auto p-8">{children}</main>
      </div>
    </div>
  );
}
