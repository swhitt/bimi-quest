import { sendDiscordNotification } from "./discord";

export interface NewCertEvent {
  certId: number;
  fingerprintSha256: string;
  domain: string;
  org: string;
  ca: string;
  certType: "VMC" | "CMC";
  country: string | null;
}

/** Send notifications to all configured channels for a new certificate */
export async function dispatchNewCertNotification(
  event: NewCertEvent
): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  await sendDiscordNotification({
    ...event,
    baseUrl,
  });
}
