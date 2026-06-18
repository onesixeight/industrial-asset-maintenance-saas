export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="w-full max-w-md rounded-[var(--radius)] border border-border bg-background p-8 shadow-sm">
        {children}
      </div>
    </main>
  );
}
