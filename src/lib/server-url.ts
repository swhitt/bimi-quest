import { headers } from "next/headers";

/** Get the base URL from request headers (for server component internal API calls) */
export async function getBaseUrl(): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get("host") || "localhost:3000";
  const protocol = hdrs.get("x-forwarded-proto") || "http";
  return `${protocol}://${host}`;
}
