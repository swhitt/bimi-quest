import { sendDiscordNotification } from "./discord";

export interface NewCertEvent {
  certId: number;
  fingerprintSha256: string;
  domain: string;
  org: string;
  issuer: string;
  rootCa: string;
  certType: "VMC" | "CMC";
  country: string | null;
  notabilityScore?: number | null;
  notabilityReason?: string | null;
  companyDescription?: string | null;
  hasLogo?: boolean;
}

/** Send notifications to all configured channels for a new certificate */
export async function dispatchNewCertNotification(
  event: NewCertEvent
): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  // CAs whose root should always be shown (comma-separated). Defaults to SSL.com.
  const alwaysShowRootCas = (process.env.DISCORD_SHOW_ROOT_CAS || "SSL.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await sendDiscordNotification({
    ...event,
    baseUrl,
    alwaysShowRootCas,
  });
}
