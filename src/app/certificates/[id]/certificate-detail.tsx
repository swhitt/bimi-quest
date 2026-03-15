"use client";

import { useEffect, useState } from "react";
import type { CertData } from "./certificate-types";
import { CertificateHeader } from "./certificate-header";
import { LintSection } from "./lint-section";
import { CertificateBimiPanel } from "./certificate-bimi-panel";
import { CertificateExtensions } from "./certificate-extensions";
import { CertificateChain } from "./certificate-chain";
import { CertificateSCTs } from "./certificate-scts";

export function CertificateDetail({ id, initialData }: { id: string; initialData: CertData }) {
  const [data] = useState<CertData>(initialData);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    // Small delay to ensure elements are rendered
    const timer = setTimeout(() => {
      const el = document.getElementById(hash);
      if (el) {
        if (el instanceof HTMLDetailsElement && !el.open) el.open = true;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-4 sm:space-y-6">
      <CertificateHeader data={data} />
      {data.certificate.rawPem && <LintSection rawPem={data.certificate.rawPem} />}
      <div id="domains">
        <CertificateBimiPanel id={id} data={data} />
      </div>
      <CertificateExtensions data={data} />
      {data.scts.length > 0 && (
        <div id="scts">
          <CertificateSCTs scts={data.scts} />
        </div>
      )}
      <div id="chain">
        <CertificateChain data={data} />
      </div>
    </div>
  );
}
