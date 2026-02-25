export interface DiscordCertPayload {
  domain: string;
  org: string;
  ca: string;
  certType: "VMC" | "CMC";
  country: string | null;
  certId: number;
  fingerprintSha256: string;
  baseUrl: string;
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

  const color = CA_COLORS[payload.ca] ?? DEFAULT_COLOR;
  const certUrl = `${payload.baseUrl}/certificates/${payload.fingerprintSha256.slice(0, 12)}`;

  const embed = {
    title: `New ${payload.certType} Certificate`,
    description: `**${payload.org || payload.domain}** obtained a BIMI ${payload.certType} from **${payload.ca}**`,
    color,
    fields: [
      { name: "Domain", value: payload.domain, inline: true },
      { name: "CA", value: payload.ca, inline: true },
      { name: "Type", value: payload.certType, inline: true },
      ...(payload.country
        ? [{ name: "Country", value: payload.country, inline: true }]
        : []),
    ],
    url: certUrl,
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (!res.ok) {
      console.error(`Discord webhook failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error("Discord webhook error:", err);
  }
}
