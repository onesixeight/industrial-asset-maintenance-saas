import { AppSidebar } from "@/components/app-sidebar";
import { AuthGate } from "@/components/auth-gate";
import { NotificationsMenu } from "@/components/notifications-menu";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <div className="flex min-h-screen">
        <AppSidebar />
        <div data-app-content className="flex flex-1 flex-col">
          <header
            aria-label="Application header"
            className="flex min-h-14 items-center justify-end gap-3 border-b border-border pl-16 pr-4 py-2 sm:px-8"
          >
            <NotificationsMenu />
          </header>
          <main className="flex-1 overflow-x-auto p-4 sm:p-8">{children}</main>
        </div>
      </div>
    </AuthGate>
  );
}
