import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

/** Strip PEM headers and base64-decode to raw DER bytes.
 *  When the input contains multiple PEM blocks (e.g. a certificate chain),
 *  only the first block is decoded. */
export function pemToDer(pem: string): Uint8Array {
  // Extract just the first PEM block to avoid concatenating multiple
  // base64 payloads (which corrupts padding mid-string).
  const match = pem.match(/-----BEGIN [^-]+-----([^-]*)-----END [^-]+-----/);
  if (!match) {
    throw new Error("No PEM block found");
  }
  const b64 = match[1].replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
    throw new Error("Invalid base64 in PEM data");
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Convert a Uint8Array to an ArrayBuffer (needed for @peculiar/x509 with strict TS) */
export function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

/** Compute a hex-encoded SHA-256 hash of a string */
export function sha256Hex(str: string): string {
  return createHash("sha256").update(str).digest("hex");
}

/** Decompress gzip data or decode as UTF-8 if not gzipped.
 *  Returns null if decompression/decoding fails. */
export function decompressIfGzipped(data: Uint8Array): string | null {
  try {
    if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
      const result = gunzipSync(Buffer.from(data));
      return new TextDecoder().decode(result);
    }
    return new TextDecoder().decode(data);
  } catch {
    return null;
  }
}
