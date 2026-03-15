import type { Metadata } from "next";
import { Asn1Playground } from "./asn1-playground";

export const metadata: Metadata = {
  alternates: { canonical: "/tools/asn1" },
  title: "ASN.1 Explorer",
  description: "Interactive DER/ASN.1 structure viewer for X.509 certificates and other DER-encoded data",
};

export default function Asn1Page() {
  return <Asn1Playground />;
}
