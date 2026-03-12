import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
      <p className="text-lg text-muted-foreground">This page could not be found.</p>
      <Link href="/" className="text-sm text-primary hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}
