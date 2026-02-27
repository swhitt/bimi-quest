import type { Metadata } from "next";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Privacy",
  description: "BIMI Quest privacy information. No tracking, no cookies, no accounts.",
};

export default function PrivacyPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Privacy</h1>

      <div className="space-y-8">
        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-lg font-semibold">What we collect</h2>
          <p>Nothing. BIMI Quest does not collect personal data from visitors.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>No user accounts or sign-ups.</li>
            <li>No cookies.</li>
            <li>No analytics or tracking scripts.</li>
          </ul>
        </section>

        <Separator />

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-lg font-semibold">Certificate data</h2>
          <p>
            All certificate data displayed on this site is already public. It is
            sourced from Certificate Transparency logs, which are designed to be
            openly auditable by anyone.
          </p>
        </section>

        <Separator />

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-lg font-semibold">BIMI Validator</h2>
          <p>
            When you use the BIMI Validator, live DNS lookups are performed from
            our servers to check the domain&apos;s BIMI and DMARC records. The
            domains you query are not stored or logged.
          </p>
        </section>

        <Separator />

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-lg font-semibold">Questions</h2>
          <p>
            If you have questions about this site, open an issue on{" "}
            <a
              href="https://github.com/swhitt/bimi-quest"
              className="underline underline-offset-4 hover:text-primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
