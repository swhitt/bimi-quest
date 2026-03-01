import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { desc, count } from "drizzle-orm";
import { buildCertificateConditions } from "@/lib/db/certificate-filters";
import { log } from "@/lib/logger";
import { escapeCSV } from "@/lib/csv";

const MAX_ROWS = 50_000;
const BATCH_SIZE = 5_000;

const CSV_HEADER = [
  "Serial Number",
  "Fingerprint SHA256",
  "Organization",
  "Domain",
  "Issuer",
  "Root CA",
  "Cert Type",
  "Mark Type",
  "Not Before",
  "Not After",
  "CT Log Timestamp",
  "Notability Score",
  "Company Description",
  "SANs",
  "Country",
].join(",");

const exportSelect = {
  serialNumber: certificates.serialNumber,
  fingerprintSha256: certificates.fingerprintSha256,
  subjectCn: certificates.subjectCn,
  subjectOrg: certificates.subjectOrg,
  subjectCountry: certificates.subjectCountry,
  issuerOrg: certificates.issuerOrg,
  rootCaOrg: certificates.rootCaOrg,
  certType: certificates.certType,
  markType: certificates.markType,
  notBefore: certificates.notBefore,
  notAfter: certificates.notAfter,
  sanList: certificates.sanList,
  ctLogTimestamp: certificates.ctLogTimestamp,
  notabilityScore: certificates.notabilityScore,
  companyDescription: certificates.companyDescription,
  id: certificates.id,
};

type ExportRow = Awaited<ReturnType<typeof queryBatch>>[number];

function queryBatch(where: ReturnType<typeof buildCertificateConditions>, offset: number) {
  return db
    .select(exportSelect)
    .from(certificates)
    .where(where)
    .orderBy(desc(certificates.notBefore))
    .limit(BATCH_SIZE)
    .offset(offset);
}

function rowToCSV(row: ExportRow): string {
  return [
    escapeCSV(row.serialNumber),
    escapeCSV(row.fingerprintSha256),
    escapeCSV(row.subjectOrg || ""),
    escapeCSV(row.sanList[0] || row.subjectCn || ""),
    escapeCSV(row.issuerOrg || ""),
    escapeCSV(row.rootCaOrg || ""),
    escapeCSV(row.certType || ""),
    escapeCSV(row.markType || ""),
    row.notBefore?.toISOString() || "",
    row.notAfter?.toISOString() || "",
    row.ctLogTimestamp?.toISOString() || "",
    row.notabilityScore?.toString() || "",
    escapeCSV(row.companyDescription || ""),
    escapeCSV(row.sanList.join("; ")),
    escapeCSV(row.subjectCountry || ""),
  ].join(",");
}

function rowToJSON(row: ExportRow) {
  return {
    serialNumber: row.serialNumber,
    fingerprintSha256: row.fingerprintSha256,
    organization: row.subjectOrg,
    domain: row.sanList[0] || row.subjectCn,
    issuer: row.issuerOrg,
    rootCA: row.rootCaOrg,
    certType: row.certType,
    markType: row.markType,
    notBefore: row.notBefore?.toISOString() || null,
    notAfter: row.notAfter?.toISOString() || null,
    ctLogTimestamp: row.ctLogTimestamp?.toISOString() || null,
    notabilityScore: row.notabilityScore,
    companyDescription: row.companyDescription,
    sans: row.sanList,
    country: row.subjectCountry,
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const format = params.get("format") === "json" ? "json" : "csv";

  try {
    const where = buildCertificateConditions(params);

    const [totalRow] = await db
      .select({ count: count() })
      .from(certificates)
      .where(where);

    const total = totalRow?.count || 0;

    if (total > MAX_ROWS) {
      return new Response(
        JSON.stringify({
          error: `Export limited to ${MAX_ROWS.toLocaleString()} rows. Your query matches ${total.toLocaleString()}. Please narrow your filters.`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `bimi-certificates-${timestamp}.${format}`;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          if (format === "csv") {
            controller.enqueue(encoder.encode(CSV_HEADER + "\n"));
          } else {
            controller.enqueue(encoder.encode("[\n"));
          }

          let offset = 0;
          let isFirst = true;

          while (offset < total) {
            const rows = await queryBatch(where, offset);
            if (rows.length === 0) break;

            for (const row of rows) {
              if (format === "csv") {
                controller.enqueue(encoder.encode(rowToCSV(row) + "\n"));
              } else {
                const prefix = isFirst ? "" : ",\n";
                controller.enqueue(encoder.encode(prefix + JSON.stringify(rowToJSON(row))));
                isFirst = false;
              }
            }

            offset += rows.length;
          }

          if (format === "json") {
            controller.enqueue(encoder.encode("\n]"));
          }

          controller.close();
        } catch (err) {
          log("error", "export.stream.failed", { error: String(err) });
          controller.error(err);
        }
      },
    });

    const contentType = format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";

    return new Response(stream, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    log("error", "export.certificates.failed", { error: String(error) });
    return new Response(
      JSON.stringify({ error: "Failed to export certificates" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
