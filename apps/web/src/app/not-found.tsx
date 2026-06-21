import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">404</h1>
      <p className="text-muted-foreground">The page you’re looking for doesn’t exist.</p>
      <Link href="/dashboard" className="text-sm font-medium underline">
        Back to dashboard
      </Link>
    </div>
  );
}
