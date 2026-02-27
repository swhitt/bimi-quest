/** Shared color palette for OG cards */
export const colors = {
  bg: "#0C1222",
  textPrimary: "#E8EAED",
  textSecondary: "#5EEAD4",
  badgeBg: "#0D9488",
  badgeText: "#F0FDFA",
  mono: "#8B95A5",
  watermark: "#1A3A4A",
  validGreen: "#22C55E",
  validAmber: "#F59E0B",
  validRed: "#EF4444",
  cardBg: "#151D2E",
  border: "#1E2D3D",
} as const;

/** Card dimensions */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** Returns traffic-light color for certificate validity */
export function validityColor(notAfter: Date | null): string {
  if (!notAfter) return colors.mono;
  const daysRemaining = Math.floor((notAfter.getTime() - Date.now()) / 86_400_000);
  if (daysRemaining < 0) return colors.validRed;
  if (daysRemaining < 30) return colors.validRed;
  if (daysRemaining < 90) return colors.validAmber;
  return colors.validGreen;
}

/** Returns human-readable days remaining */
export function daysRemainingText(notAfter: Date | null): string {
  if (!notAfter) return "";
  const days = Math.floor((notAfter.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `expired ${Math.abs(days)}d ago`;
  return `${days}d remaining`;
}

/** Format a date as YYYY-MM-DD */
export function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

/** Truncate a fingerprint for display */
export function shortFingerprint(fp: string, len = 16): string {
  return fp.slice(0, len) + "…";
}

/** Format SANs list with truncation */
export function formatSans(sans: string[], max = 3): string {
  if (!sans.length) return "";
  const shown = sans.slice(0, max).join(", ");
  const remaining = sans.length - max;
  return remaining > 0 ? `${shown} +${remaining} more` : shown;
}
