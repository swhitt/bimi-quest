"use client";

import { useState } from "react";
import type { CertData } from "./certificate-types";
import { CertificateHeader } from "./certificate-header";
import { CertificateBimiPanel } from "./certificate-bimi-panel";
import { CertificateExtensions } from "./certificate-extensions";
import { CertificateChain } from "./certificate-chain";
import { CertificateSCTs } from "./certificate-scts";

export function CertificateDetail({ id, initialData }: { id: string; initialData: CertData }) {
  const [data] = useState<CertData>(initialData);

  return (
    <div className="space-y-4 sm:space-y-6">
      <CertificateHeader data={data} />
      <CertificateBimiPanel id={id} data={data} />
      <CertificateExtensions data={data} />
      {data.scts.length > 0 && <CertificateSCTs scts={data.scts} />}
      <CertificateChain data={data} />
    </div>
  );
}
