import { normalizeIssuerOrg } from "@/lib/ca-display";
import type { BIMICertData } from "@/lib/ct/parser";
import { isTestCert } from "@/lib/ct/test-detection";
import { slugify } from "@/lib/slugify";
import { computeColorRichness } from "@/lib/svg-color-richness";
import { isLightBg, stripWhiteSvgBg, tileBgForSvg } from "@/lib/svg-bg";

/**
 * Build the values object for inserting a BIMI certificate into the
 * `bimiCertificates` table. Shared between CT log ingestion and PEM-based
 * ingestion so that both paths produce identical column sets.
 */
export function buildCertInsertValues(
  bimiData: BIMICertData,
  opts: {
    rootCaOrg?: string | null;
    isPrecert?: boolean;
    ctLogTimestamp?: Date;
    ctLogIndex?: number;
    ctLogName?: string;
    discoverySource?: string;
  } = {},
) {
  const {
    rootCaOrg = normalizeIssuerOrg(bimiData.issuerOrg),
    isPrecert = false,
    ctLogTimestamp,
    ctLogIndex,
    ctLogName,
    discoverySource,
  } = opts;

  return {
    fingerprintSha256: bimiData.fingerprintSha256,
    serialNumber: bimiData.serialNumber,
    notBefore: bimiData.notBefore,
    notAfter: bimiData.notAfter,
    subjectDn: bimiData.subjectDn,
    subjectCn: bimiData.subjectCn,
    subjectOrg: bimiData.subjectOrg,
    subjectOrgSlug: bimiData.subjectOrg ? slugify(bimiData.subjectOrg) : null,
    subjectCountry: bimiData.subjectCountry,
    subjectState: bimiData.subjectState,
    subjectLocality: bimiData.subjectLocality,
    issuerDn: bimiData.issuerDn,
    issuerCn: bimiData.issuerCn,
    issuerOrg: normalizeIssuerOrg(bimiData.issuerOrg),
    rootCaOrg,
    sanList: bimiData.sanList,
    markType: bimiData.markType,
    certType: bimiData.certType,
    logotypeSvgHash: bimiData.logotypeSvgHash,
    logotypeSvg: bimiData.logotypeSvg,
    logoColorRichness: bimiData.logotypeSvg ? computeColorRichness(bimiData.logotypeSvg) : null,
    logoTileBg: bimiData.logotypeSvg
      ? isLightBg(tileBgForSvg(stripWhiteSvgBg(bimiData.logotypeSvg)))
        ? "light"
        : "dark"
      : null,
    // Visual hash is deferred to the backfillVisualHash worker to keep
    // the ingestion hot path fast (sharp render is 50-200ms per cert)
    logotypeVisualHash: null,
    rawPem: bimiData.rawPem,
    isTest: isTestCert(bimiData.sanList),
    isPrecert,
    extensionsJson: bimiData.extensionsJson,
    ...(ctLogTimestamp != null ? { ctLogTimestamp } : {}),
    ...(ctLogIndex != null ? { ctLogIndex } : {}),
    ...(ctLogName != null ? { ctLogName } : {}),
    ...(discoverySource != null ? { discoverySource } : {}),
  };
}
