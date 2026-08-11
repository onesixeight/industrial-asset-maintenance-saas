"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { validatedRelativePath } from "./auth-gate";

interface QueryStateProps {
  children: ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  error?: unknown;
  onRetry?: () => unknown;
}

function errorStatus(error: unknown): number | undefined {
  return error && typeof error === "object" && "status" in error
    ? (error as { status?: number }).status
    : undefined;
}

export function QueryState({
  children,
  isLoading = false,
  isEmpty = false,
  emptyMessage = "Nothing here yet.",
  error,
  onRetry,
}: QueryStateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const status = errorStatus(error);

  useEffect(() => {
    if (status === 401) {
      const next = validatedRelativePath(
        `${pathname}${window.location.search}${window.location.hash}`,
      );
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [pathname, router, status]);

  if (status === 401) return null;
  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Loading…
      </p>
    );
  }
  if (status === 403) {
    return (
      <p className="text-sm text-destructive">
        You do not have permission to view this.
      </p>
    );
  }
  if (status === 404) {
    return (
      <p className="text-sm text-muted-foreground">
        The requested resource was not found.
      </p>
    );
  }
  if (error) {
    return (
      <div
        className="flex items-center gap-3 text-sm text-destructive"
        role="alert"
      >
        <span>Something went wrong while loading this data.</span>
        {onRetry ? (
          <button
            type="button"
            className="font-medium underline"
            onClick={() => onRetry()}
          >
            Try again
          </button>
        ) : null}
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className="rounded-[var(--radius)] border border-border bg-background p-4">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return children;
}
