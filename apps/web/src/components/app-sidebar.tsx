"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/hooks";

/**
 * Dashboard navigation. The Users link is hidden for non-admins (cosmetic — the
 * backend RolesGuard is the real gate). Active route is highlighted.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const links: { href: string; label: string; adminOnly?: boolean }[] = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/assets", label: "Assets" },
    { href: "/assets/scan", label: "Scan QR" },
    { href: "/work-orders", label: "Work orders" },
    { href: "/inspections", label: "Inspections" },
    { href: "/inspections/templates", label: "Templates", adminOnly: true },
    { href: "/locations", label: "Locations" },
    { href: "/categories", label: "Categories" },
    { href: "/users", label: "Users", adminOnly: true },
  ];

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-border bg-muted p-4">
      <Link href="/dashboard" className="mb-4 text-lg font-bold">
        IAM
      </Link>
      {links.map((l) => {
        if (l.adminOnly && user?.role !== "admin" && user?.role !== "manager") return null;
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-[var(--radius)] px-3 py-2 text-sm transition ${
              active ? "bg-background font-medium" : "hover:bg-background/50"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </aside>
  );
}
