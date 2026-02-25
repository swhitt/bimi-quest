import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn about BIMI Intel, how it works, and where the data comes from.",
};

export default function AboutPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">About</h1>
        <p className="text-muted-foreground">
          How BIMI Intel works and where the data comes from.
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-xl">What is BIMI?</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed">
            <p>
              BIMI (Brand Indicators for Message Identification) is an email
              standard that lets organizations display their verified brand logo
              next to emails in supported inboxes like Gmail, Apple Mail, and
              Yahoo Mail.
            </p>
            <p>
              It builds on email authentication protocols (DMARC, SPF, DKIM) to
              prove that emails genuinely come from the claimed sender. When a
              mailbox provider receives an authenticated email, it looks up the
              sender&apos;s BIMI DNS record to find the brand logo and, where
              required, a certificate proving ownership.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-xl">What is BIMI Intel?</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed">
            <p>
              BIMI Intel tracks global adoption of BIMI certificates by scanning
              public Certificate Transparency (CT) logs. It provides real-time
              market intelligence on which organizations have adopted BIMI, which
              Certificate Authorities (CAs) issue certificates, and how the
              ecosystem is evolving over time.
            </p>
            <p>
              The dashboard surfaces trends in certificate issuance, market share
              across CAs, geographic distribution, and individual certificate
              details including embedded brand logos.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-xl">Where does the data come from?</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed">
            <p>
              All data comes from DigiCert&apos;s{" "}
              <a
                href="https://gorgon.ct.digicert.com/"
                className="underline underline-offset-4 hover:text-primary"
                target="_blank"
                rel="noopener noreferrer"
              >
                Gorgon CT log
              </a>
              , a publicly auditable Certificate Transparency log dedicated to
              BIMI certificates. An ingestion pipeline periodically fetches new
              entries, parses the X.509 certificates, and stores enriched data
              in the database.
            </p>
            <p className="text-muted-foreground">Important caveats:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                Data is sourced from a single CT log. Certificates logged
                elsewhere may not appear.
              </li>
              <li>
                No revocation checking is performed. Revoked certificates still
                appear in the dataset.
              </li>
              <li>
                Data freshness depends on the ingestion pipeline. There may be a
                short delay between a certificate appearing in the CT log and
                showing up here.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-xl">Certificate Types</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed">
            <p>
              BIMI certificates come in two main categories, each with specific
              mark types:
            </p>
            <div className="space-y-2">
              <p className="font-medium">
                VMC (Verified Mark Certificate)
              </p>
              <p>
                Requires a registered trademark. Needed for logo display in
                Gmail.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Registered Mark</li>
                <li>Government Mark</li>
              </ul>
            </div>
            <div className="space-y-2">
              <p className="font-medium">
                CMC (Common Mark Certificate)
              </p>
              <p>
                Does not require a registered trademark. Accepted by some
                mailbox providers but not Gmail.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Prior Use Mark</li>
                <li>Modified Registered Mark</li>
                <li>Pending Registration Mark</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-xl">How to cite</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed">
            <p>
              &ldquo;Source: BIMI Intel, based on Certificate Transparency log
              analysis.&rdquo;
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
