import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

/** Strip PEM headers and base64-decode to raw DER bytes.
 *  Handles any PEM type (CERTIFICATE, PRIVATE KEY, etc.) */
export function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
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
