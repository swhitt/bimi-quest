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
  "GlobalSign": 0x00a651,
  "Sectigo": 0xff6600,
};
const DEFAULT_COLOR = 0x6b7280;

export async function sendDiscordNotification(
  payload: DiscordCertPayload
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("DISCORD_WEBHOOK_URL not set, skipping notification");
    return;
  }

  const color = CA_COLORS[payload.rootCa] ?? CA_COLORS[payload.issuer] ?? DEFAULT_COLOR;
  const certUrl = `${payload.baseUrl}/certificates/${payload.fingerprintSha256.slice(0, 12)}`;

  const alwaysShowRoot = payload.alwaysShowRootCas ?? [];
  const showRootCa =
    payload.rootCa !== payload.issuer ||
    alwaysShowRoot.some((ca) => payload.rootCa.includes(ca) || payload.issuer.includes(ca));

  const embed = {
    title: `New ${payload.certType} Certificate`,
    description: `**${payload.org || payload.domain}** obtained a BIMI ${payload.certType} from **${payload.issuer}**`,
    color,
    fields: [
      { name: "Domain", value: payload.domain, inline: true },
      { name: "Issuer", value: payload.issuer, inline: true },
      ...(showRootCa
        ? [{ name: "Root CA", value: payload.rootCa, inline: true }]
        : []),
      { name: "Type", value: payload.certType, inline: true },
      ...(payload.country
        ? [{ name: "Country", value: payload.country, inline: true }]
        : []),
      ...(payload.notabilityScore && payload.notabilityScore >= 5
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

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (!res.ok) {
      log('error', 'discord.webhook.failed', { status: res.status, statusText: res.statusText });
    }
  } catch (err) {
    log('error', 'discord.webhook.error', { error: String(err) });
  }
}
