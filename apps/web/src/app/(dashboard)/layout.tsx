import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";

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
      <main className="flex-1 overflow-x-auto p-8">{children}</main>
    </div>
  );
}
