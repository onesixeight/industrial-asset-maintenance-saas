"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/hooks";

/**
 * Dashboard navigation. The Users link is hidden for non-admins (cosmetic — the
 * backend RolesGuard is the real gate). Active route is highlighted.
 *
 * Responsive: on md+ the sidebar is a static left column (`md:flex`); on mobile
 * it collapses into a slide-over drawer toggled by a hamburger button. The
 * drawer closes on navigation (pathname change) so a tap on a link doesn't
 * leave an open overlay behind.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const links: { href: string; label: string; adminOnly?: boolean }[] = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/assets", label: "Assets" },
    { href: "/assets/scan", label: "Scan QR" },
    { href: "/work-orders", label: "Work orders" },
    { href: "/parts", label: "Parts" },
    { href: "/inspections", label: "Inspections" },
    { href: "/inspections/templates", label: "Templates", adminOnly: true },
    { href: "/locations", label: "Locations" },
    { href: "/categories", label: "Categories" },
    { href: "/users", label: "Users", adminOnly: true },
  ];

  const nav = (
    <>
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
            onClick={() => setOpen(false)}
            className={`rounded-[var(--radius)] px-3 py-2 text-sm transition ${
              active ? "bg-background font-medium" : "hover:bg-background/50"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <>
      {/* Mobile hamburger — visible only below md. */}
      <button
        type="button"
        aria-label="Open navigation"
        className="fixed left-4 top-3 z-30 rounded-[var(--radius)] border border-border bg-background p-2 md:hidden"
        onClick={() => setOpen(true)}
      >
        ☰
      </button>

      {/* Desktop static sidebar (md+). */}
      <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border bg-muted p-4 md:flex">
        {nav}
      </aside>

      {/* Mobile drawer overlay. */}
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      {/* Mobile drawer panel. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col gap-1 border-r border-border bg-muted p-4 pt-16 transition-transform md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {nav}
      </aside>
    </>
  );
}
