import Link from "next/link";

const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA;

export function Footer() {
  return (
    <footer className="border-t bg-muted/30 mt-auto">
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 px-3 sm:px-4 py-3 text-sm text-muted-foreground">
        <p>
          Data sourced from public{" "}
          <a
            href="https://certificate.transparency.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Certificate Transparency
          </a>{" "}
          logs.
          {commitSha && (
            <span className="ml-2 text-[10px] opacity-40 font-mono" title={commitSha}>
              {commitSha.slice(0, 7)}
            </span>
          )}
        </p>
        <nav className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </Link>
          <Link href="/api/feed" className="hover:text-foreground transition-colors">
            RSS
          </Link>
        </nav>
      </div>
    </footer>
  );
}
