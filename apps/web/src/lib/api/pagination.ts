import type { PaginatedResponse } from "@iam/shared";

export interface PageRequest {
  page: number;
  pageSize: number;
}

export type PageResult<T> = PaginatedResponse<T>;

export function pageQuery<T extends object>(
  filters: T,
  request: PageRequest,
): T & { page: number; limit: number } {
  return { ...filters, page: request.page, limit: request.pageSize };
}
