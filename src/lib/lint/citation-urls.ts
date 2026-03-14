const MCR_URL = "https://bimigroup.org/resources/VMC_Guidelines_latest.pdf";
const BIMI_DRAFT_BASE = "https://datatracker.ietf.org/doc/html/draft-brand-indicators-for-message-identification-12";

export function citationUrl(citation: string): string | null {
  if (citation.startsWith("MCR")) return MCR_URL;
  // BIMI draft citations like "draft-12 section 4.2"
  const draftMatch = citation.match(/^draft-12\s+section\s+([\d.]+)/i);
  if (draftMatch) return `${BIMI_DRAFT_BASE}#section-${draftMatch[1]}`;
  // SVG Tiny PS profile draft
  if (citation.startsWith("draft-svg-tiny-ps"))
    return "https://datatracker.ietf.org/doc/html/draft-svg-tiny-ps-abrotman";
  // RFC citations like "RFC 5280 §4.2.1.9"
  const rfcMatch = citation.match(/^RFC\s*(\d+)\s*(?:§([\d.]+))?/);
  if (rfcMatch) {
    const num = rfcMatch[1];
    const section = rfcMatch[2];
    if (section) return `https://datatracker.ietf.org/doc/html/rfc${num}#section-${section}`;
    return `https://datatracker.ietf.org/doc/html/rfc${num}`;
  }
  if (citation === "CABF") return "https://cabforum.org/working-groups/server/baseline-requirements/requirements/";
  if (citation === "VMC Requirements") return MCR_URL;
  return null;
}
