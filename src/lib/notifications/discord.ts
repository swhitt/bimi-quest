import { displayIssuerOrg, displayRootCa } from "@/lib/ca-display";
import { NOTABILITY_NOTIFICATION_THRESHOLD } from "@/lib/constants";
import { log } from "@/lib/logger";

export interface DiscordCertPayload {
  domain: string;
  org: string;
  issuer: string;
  rootCa: string;
  certType: "VMC" | "CMC";
  country: string | null;
  certId: number;
  fingerprintSha256: string;
  baseUrl: string;
  notabilityScore?: number | null;
  notabilityReason?: string | null;
  companyDescription?: string | null;
  hasLogo?: boolean;
  /** CAs whose root CA should always be shown even when it matches the issuer. Configurable via DISCORD_SHOW_ROOT_CAS env var. */
  alwaysShowRootCas?: string[];
}

// CA brand colors for Discord embeds
const CA_COLORS: Record<string, number> = {
  "SSL.com": 0x1a73e8,
  DigiCert: 0x0057b8,
  Entrust: 0xe31937,
  GlobalSign: 0x00a651,
  Sectigo: 0xff6600,
};
const DEFAULT_COLOR = 0x6b7280;

export async function sendDiscordNotification(payload: DiscordCertPayload): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("DISCORD_WEBHOOK_URL not set, skipping notification");
    return;
  }

  const issuerDisplay = displayIssuerOrg(payload.issuer);
  const rootDisplay = displayRootCa(payload.rootCa);
  const color = CA_COLORS[rootDisplay] ?? CA_COLORS[issuerDisplay] ?? DEFAULT_COLOR;
  const certUrl = `${payload.baseUrl}/certificates/${payload.fingerprintSha256.slice(0, 12)}`;

  const alwaysShowRoot = payload.alwaysShowRootCas ?? [];
  const showRootCa =
    issuerDisplay !== rootDisplay ||
    alwaysShowRoot.some((ca) => payload.rootCa.includes(ca) || payload.issuer.includes(ca));

  const embed = {
    title: `New ${payload.certType} Certificate`,
    description: `**${payload.org || payload.domain}** obtained a BIMI ${payload.certType} from **${issuerDisplay}**`,
    color,
    fields: [
      { name: "Domain", value: payload.domain, inline: true },
      { name: "Issuer", value: issuerDisplay, inline: true },
      ...(showRootCa ? [{ name: "Root CA", value: rootDisplay, inline: true }] : []),
      { name: "Type", value: payload.certType, inline: true },
      ...(payload.country ? [{ name: "Country", value: payload.country, inline: true }] : []),
      ...(payload.notabilityScore && payload.notabilityScore >= NOTABILITY_NOTIFICATION_THRESHOLD
        ? [
            {
              name: "Notable",
              value: `${"★".repeat(Math.min(5, Math.round(payload.notabilityScore / 2)))} ${payload.notabilityScore}/10${payload.companyDescription ? ` · ${payload.companyDescription}` : ""}`,
              inline: false,
            },
          ]
        : []),
    ],
    url: certUrl,
    ...(payload.hasLogo
      ? { thumbnail: { url: `${payload.baseUrl}/api/certificates/${payload.fingerprintSha256.slice(0, 12)}/logo` } }
      : {}),
    timestamp: new Date().toISOString(),
  };

  const body = JSON.stringify({ embeds: [embed] });
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) return;

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") || "2");
        const jitter = Math.random() * 1000;
        await new Promise((r) => setTimeout(r, retryAfter * 1000 + jitter));
        continue;
      }

      log("error", "discord.webhook.failed", { status: res.status, statusText: res.statusText, attempt });
      return;
    } catch (err) {
      if (attempt === maxRetries - 1) {
        log("error", "discord.webhook.error", { error: String(err), attempt });
      }
    }
  }
}
