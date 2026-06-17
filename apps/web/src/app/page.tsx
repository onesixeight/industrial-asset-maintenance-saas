import type { HealthResponse } from "@iam/shared";

export default function HomePage() {
  const probe: HealthResponse = { status: "ok", timestamp: new Date().toISOString() };
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Industrial Asset &amp; Maintenance SaaS</h1>
      <p className="text-sm text-neutral-600">Phase 0 — foundation skeleton is up.</p>
      <pre className="rounded bg-neutral-100 p-3 text-xs">
        {JSON.stringify(probe, null, 2)}
      </pre>
    </main>
  );
}
