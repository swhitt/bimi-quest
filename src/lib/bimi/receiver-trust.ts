import { promises as dns } from "dns";
import { isDnsNotFoundError, withDnsTimeout } from "./dns-utils";

export interface ReceiverTrustEntry {
  receiverDomain: string;
  dnsName: string;
  found: boolean;
  txtValue: string | null;
  error?: string; // DNS error message, if any (non-NXDOMAIN errors)
}

export interface ReceiverTrustResult {
  entries: ReceiverTrustEntry[];
}

/** Look up receiver trust TXT records at [selector]._local._bimi.[domain] for each receiver domain */
export async function lookupReceiverTrust(
  receiverDomains: string[],
  selector: string = "default",
): Promise<ReceiverTrustResult> {
  const entries = await Promise.all(receiverDomains.map((domain) => lookupReceiverTrustAt(domain, selector)));
  return { entries };
}

async function lookupReceiverTrustAt(receiverDomain: string, selector: string): Promise<ReceiverTrustEntry> {
  const dnsName = `${selector}._local._bimi.${receiverDomain}`;
  try {
    const records = await withDnsTimeout(dns.resolveTxt(dnsName));
    for (const record of records) {
      const txt = record.join("");
      if (txt.length > 0) {
        return { receiverDomain, dnsName, found: true, txtValue: txt };
      }
    }
    return { receiverDomain, dnsName, found: false, txtValue: null };
  } catch (err: unknown) {
    if (isDnsNotFoundError(err)) {
      return { receiverDomain, dnsName, found: false, txtValue: null };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { receiverDomain, dnsName, found: false, txtValue: null, error: `DNS error: ${msg}` };
  }
}
