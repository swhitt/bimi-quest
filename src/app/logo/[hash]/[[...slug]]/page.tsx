import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { sql, and, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { LogoSvg } from "@/components/logo-svg";

interface Props {
  params: Promise<{ hash: string; slug?: string[] }>;
}

/** Strip a domain to just the name before the first dot: "mail.paypal.com" → "paypal" for 2+ parts, "localhost" → "localhost" */
function domainSlug(domain: string): string {
  const parts = domain.toLowerCase().replace(/[^a-z0-9.\-]/g, "").split(".");
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] || "logo";
}

async function getLogo(hash: string) {
  const [row] = await db
    .select({
      svgHash: certificates.logotypeSvgHash,
      svg: certificates.logotypeSvg,
      org: certificates.subjectOrg,
      domain: certificates.sanList,
      certType: certificates.certType,
      issuer: certificates.issuerOrg,
      rootCa: certificates.rootCaOrg,
      score: certificates.notabilityScore,
      notBefore: certificates.notBefore,
      notAfter: certificates.notAfter,
      fingerprintSha256: certificates.fingerprintSha256,
    })
    .from(certificates)
    .where(
      and(
        sql`${certificates.fingerprintSha256} LIKE ${hash + "%"}`,
        isNotNull(certificates.logotypeSvg),
      )
    )
    .limit(1);
  return row ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hash } = await params;
  const logo = await getLogo(hash);
  if (!logo) return { title: "Logo Not Found" };

  const primaryDomain = logo.domain?.[0] ?? "";
  const org = logo.org ?? primaryDomain;

  return {
    title: `${org} BIMI Logo`,
    description: `BIMI ${logo.certType ?? "certificate"} logo for ${org}${primaryDomain ? ` (${primaryDomain})` : ""}.`,
    openGraph: {
      title: `${org} BIMI Logo`,
      description: `${logo.certType ?? "Certificate"} logo issued by ${logo.issuer ?? "unknown CA"}.`,
      images: logo.svgHash ? [`/api/logo/${logo.svgHash}`] : [],
    },
  };
}

export default async function LogoPage({ params }: Props) {
  const { hash, slug } = await params;
  const logo = await getLogo(hash);
  if (!logo) notFound();

  const primaryDomain = logo.domain?.[0] ?? "";
  const expectedSlug = primaryDomain ? domainSlug(primaryDomain) : "logo";

  // Redirect to canonical URL if slug is missing or wrong
  if (!slug?.[0] || slug[0] !== expectedSlug) {
    redirect(`/logo/${hash}/${expectedSlug}`);
  }

  const org = logo.org ?? "Unknown";
  const now = new Date();
  const isExpired = logo.notAfter ? logo.notAfter < now : false;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/gallery" className="hover:text-foreground">Gallery</Link>
        <span>/</span>
        <span className="text-foreground truncate">{org}</span>
      </nav>

      {/* Logo display */}
      <div className="flex flex-col items-center gap-4">
        <div
          className="relative w-64 h-64 rounded-xl bg-neutral-800 p-4 ring-1 ring-white/10 [&>div>svg]:h-full [&>div>svg]:w-full"
        >
          {logo.svg ? (
            <LogoSvg svg={logo.svg} className="h-full w-full [&>svg]:h-full [&>svg]:w-full" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              No image
            </div>
          )}
        </div>

        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{org}</h1>
          {primaryDomain && (
            <p className="text-muted-foreground">{primaryDomain}</p>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="rounded-lg border bg-card p-4 space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <span className="text-muted-foreground">Certificate</span>
          <Link
            href={`/certificates/${logo.fingerprintSha256.slice(0, 12)}`}
            className="text-primary hover:underline font-mono text-xs"
          >
            {logo.fingerprintSha256.slice(0, 12)}&hellip;
          </Link>
          {logo.certType && (
            <>
              <span className="text-muted-foreground">Type</span>
              <span>{logo.certType}</span>
            </>
          )}
          {logo.issuer && (
            <>
              <span className="text-muted-foreground">Issuer</span>
              <span>{logo.issuer}</span>
            </>
          )}
          {logo.rootCa && logo.rootCa !== logo.issuer && (
            <>
              <span className="text-muted-foreground">Root CA</span>
              <span>{logo.rootCa}</span>
            </>
          )}
          {logo.score != null && (
            <>
              <span className="text-muted-foreground">Score</span>
              <span>{logo.score}/10</span>
            </>
          )}
          {logo.notBefore && (
            <>
              <span className="text-muted-foreground">Issued</span>
              <span>{logo.notBefore.toISOString().slice(0, 10)}</span>
            </>
          )}
          {logo.notAfter && (
            <>
              <span className="text-muted-foreground">Expires</span>
              <span className={isExpired ? "text-destructive" : ""}>
                {logo.notAfter.toISOString().slice(0, 10)}
                {isExpired && " (expired)"}
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t">
          {logo.org && (
            <Link
              href={`/orgs/${encodeURIComponent(logo.org)}`}
              className="text-xs text-primary hover:underline"
            >
              All certs for {logo.org}
            </Link>
          )}
          {primaryDomain && (
            <Link
              href={`/hosts/${encodeURIComponent(primaryDomain)}`}
              className="text-xs text-primary hover:underline"
            >
              All certs for {primaryDomain}
            </Link>
          )}
        </div>
      </div>

      {/* Hash for nerds */}
      <p className="text-center text-xs text-muted-foreground/50 font-mono truncate">
        {hash}
      </p>
    </div>
  );
}
