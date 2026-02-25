import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Privacy",
  description: "BIMI Intel privacy information. No tracking, no cookies, no accounts.",
};

export default function PrivacyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Privacy</h1>
        <p className="text-muted-foreground">
          How BIMI Intel handles your data.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-xl">What we collect</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>Nothing. BIMI Intel does not collect personal data from visitors.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>No user accounts or sign-ups.</li>
            <li>No cookies.</li>
            <li>No analytics or tracking scripts.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-xl">Certificate data</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed">
          <p>
            All certificate data displayed on this site is already public. It is
            sourced from Certificate Transparency logs, which are designed to be
            openly auditable by anyone.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-xl">BIMI Validator</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed">
          <p>
            When you use the BIMI Validator, live DNS lookups are performed from
            our servers to check the domain&apos;s BIMI and DMARC records. The
            domains you query are not stored or logged.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-xl">Questions</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed">
          <p>
            If you have questions about this site, open an issue on{" "}
            <a
              href="https://github.com/nicholasgriffintn/bimi-intel"
              className="underline underline-offset-4 hover:text-primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
