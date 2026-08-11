import { QueryClient } from "@tanstack/react-query";

let activeQueryClient: QueryClient | null = null;

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function setActiveQueryClient(queryClient: QueryClient): QueryClient {
  activeQueryClient = queryClient;
  return queryClient;
}

export function getActiveQueryClient(): QueryClient | null {
  return activeQueryClient;
}
