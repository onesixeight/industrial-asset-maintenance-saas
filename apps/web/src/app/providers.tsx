"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { makeQueryClient, setActiveQueryClient } from "@/lib/query-client";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => setActiveQueryClient(makeQueryClient()));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
