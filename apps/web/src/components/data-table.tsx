import { useEffect, type ReactNode } from "react";

export interface DataTableColumn<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  empty?: string;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
}

/**
 * Generic table with optional controlled, server-backed pagination metadata.
 */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty,
  page,
  pageSize,
  total,
  onPageChange,
}: DataTableProps<T>) {
  const paged =
    page !== undefined && pageSize !== undefined && total !== undefined;
  const totalPages = paged ? Math.max(1, Math.ceil(total / pageSize)) : 1;

  useEffect(() => {
    if (paged && page > totalPages) onPageChange?.(totalPages);
  }, [onPageChange, page, paged, totalPages]);

  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border border-border bg-background p-4">
        <p className="text-sm text-muted-foreground">
          {empty ?? "Nothing here yet."}
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-[var(--radius)] border border-border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              {columns.map((c) => (
                <th key={String(c.key)} className="px-4 py-2 font-medium">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                {columns.map((c) => (
                  <td key={String(c.key)} className="px-4 py-2">
                    {c.render
                      ? c.render(row)
                      : String(
                          (row as Record<string, unknown>)[c.key as string] ??
                            "",
                        )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paged ? (
        <nav
          aria-label="Table pagination"
          className="flex items-center justify-between border-t border-border px-4 py-2 text-sm"
        >
          <button
            type="button"
            aria-label="Previous page"
            className="rounded-[var(--radius)] border border-border px-3 py-1 disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => onPageChange?.(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            aria-label="Next page"
            className="rounded-[var(--radius)] border border-border px-3 py-1 disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => onPageChange?.(page + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}
