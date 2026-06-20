import type { ReactNode } from "react";

export interface DataTableColumn<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  empty?: string;
}

/**
 * Tiny generic table. No sorting/pagination yet — reference data lists are
 * small per company; DataTable grows those when a list actually needs them.
 */
export function DataTable<T extends { id: string }>({ columns, rows, empty }: DataTableProps<T>) {
  if (rows.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">{empty ?? "Nothing here yet."}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-border">
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
                  {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key as string] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
