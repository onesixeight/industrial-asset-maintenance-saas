"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { silentRefresh } from "../lib/auth/refresh";
import { useAuth } from "../lib/auth/store";

export function validatedRelativePath(
  value: string | null | undefined,
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/dashboard";
  }

  try {
    const parsed = new URL(value, "https://iam.local");
    if (parsed.origin !== "https://iam.local") return "/dashboard";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/dashboard";
  }
}

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "idle") {
      void silentRefresh();
      return;
    }
    if (status === "unauthenticated") {
      const next = validatedRelativePath(
        `${pathname}${window.location.search}${window.location.hash}`,
      );
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [pathname, router, status]);

  if (status !== "authenticated") {
    return status === "unauthenticated" ? null : (
      <p className="p-8 text-sm text-muted-foreground" role="status">
        Restoring your session…
      </p>
    );
  }

  return children;
}
