import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t bg-muted/30 mt-auto">
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-4 text-sm text-muted-foreground">
        <p>
          Data sourced from public{" "}
          <a href="https://certificate.transparency.dev/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
            Certificate Transparency
          </a>{" "}
          logs.
        </p>
        <nav className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          <Link href="/api/feed" className="hover:text-foreground transition-colors">RSS</Link>
        </nav>
      </div>
    </footer>
  );
}
