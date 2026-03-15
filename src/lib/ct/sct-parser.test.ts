import { describe, expect, it } from "vitest";
import { bytesToHex } from "@/lib/hex";
import { parseSCTList } from "./sct-parser";

/**
 * Build a synthetic but correctly-formatted SCT extension hex value.
 * This constructs the full wire format: OCTET STRING wrapper → list length → SCT entries.
 */
function buildSctHex(scts: Array<{ logId: Uint8Array; timestampMs: number }>): string {
  const sctBuffers: Uint8Array[] = [];

  for (const { logId, timestampMs } of scts) {
    // SCT body: version(1) + logId(32) + timestamp(8) + extLen(2) + hashAlg(1) + sigAlg(1) + sigLen(2) + sig(72)
    const sctBody = new Uint8Array(1 + 32 + 8 + 2 + 1 + 1 + 2 + 72);
    const view = new DataView(sctBody.buffer);
    let offset = 0;

    // Version = 0 (v1)
    sctBody[offset++] = 0;

    // Log ID (32 bytes)
    sctBody.set(logId, offset);
    offset += 32;

    // Timestamp (8 bytes big-endian)
    view.setUint32(offset, Math.floor(timestampMs / 0x100000000));
    view.setUint32(offset + 4, timestampMs >>> 0);
    offset += 8;

    // Extensions length = 0
    view.setUint16(offset, 0);
    offset += 2;

    // Hash algorithm = 4 (SHA-256)
    sctBody[offset++] = 4;
    // Signature algorithm = 3 (ECDSA)
    sctBody[offset++] = 3;

    // Signature length = 72, followed by 72 zero bytes (placeholder)
    view.setUint16(offset, 72);
    offset += 2;
    // signature bytes are already zeroed

    sctBuffers.push(sctBody);
  }

  // Build SCT list: for each SCT, 2-byte length prefix + body
  let totalSctBytes = 0;
  for (const buf of sctBuffers) totalSctBytes += 2 + buf.length;

  // List: 2-byte total length + SCT entries
  const list = new Uint8Array(2 + totalSctBytes);
  const listView = new DataView(list.buffer);
  listView.setUint16(0, totalSctBytes);
  let listOffset = 2;
  for (const buf of sctBuffers) {
    listView.setUint16(listOffset, buf.length);
    listOffset += 2;
    list.set(buf, listOffset);
    listOffset += buf.length;
  }

  // Wrap in ASN.1 OCTET STRING (tag 0x04 + DER length)
  const innerLen = list.length;
  let lenBytes: number[];
  if (innerLen < 0x80) {
    lenBytes = [innerLen];
  } else if (innerLen < 0x100) {
    lenBytes = [0x81, innerLen];
  } else {
    lenBytes = [0x82, (innerLen >> 8) & 0xff, innerLen & 0xff];
  }
  const result = new Uint8Array(1 + lenBytes.length + innerLen);
  result[0] = 0x04;
  result.set(lenBytes, 1);
  result.set(list, 1 + lenBytes.length);

  return bytesToHex(result);
}

function makeLogId(seed: number): Uint8Array {
  const id = new Uint8Array(32);
  for (let i = 0; i < 32; i++) id[i] = (seed + i) & 0xff;
  return id;
}

describe("parseSCTList", () => {
  it("parses a single SCT", () => {
    const logId = makeLogId(0xaa);
    const timestamp = 1700000000000;
    const hex = buildSctHex([{ logId, timestampMs: timestamp }]);

    const scts = parseSCTList(hex);
    expect(scts).toHaveLength(1);
    expect(scts[0].version).toBe(0);
    expect(scts[0].timestamp).toBe(timestamp);
    expect(scts[0].hashAlgorithm).toBe(4);
    expect(scts[0].signatureAlgorithm).toBe(3);
    // Log ID should be base64-encoded
    expect(scts[0].logId).toBe(btoa(String.fromCharCode(...logId)));
  });

  it("parses multiple SCTs", () => {
    const logId1 = makeLogId(0x10);
    const logId2 = makeLogId(0x20);
    const ts1 = 1700000000000;
    const ts2 = 1700000001000;
    const hex = buildSctHex([
      { logId: logId1, timestampMs: ts1 },
      { logId: logId2, timestampMs: ts2 },
    ]);

    const scts = parseSCTList(hex);
    expect(scts).toHaveLength(2);
    expect(scts[0].timestamp).toBe(ts1);
    expect(scts[1].timestamp).toBe(ts2);
    expect(scts[0].logId).not.toBe(scts[1].logId);
  });

  it("returns empty array for empty input", () => {
    expect(parseSCTList("")).toEqual([]);
  });

  it("returns empty array for malformed input", () => {
    expect(parseSCTList("deadbeef")).toEqual([]);
  });

  it("handles hex without OCTET STRING wrapper", () => {
    // Build just the list without the 0x04 wrapper
    const logId = makeLogId(0x55);
    const timestamp = 1600000000000;

    // Build SCT body
    const sctBody = new Uint8Array(1 + 32 + 8 + 2 + 1 + 1 + 2 + 72);
    const view = new DataView(sctBody.buffer);
    sctBody[0] = 0; // version
    sctBody.set(logId, 1);
    view.setUint32(33, Math.floor(timestamp / 0x100000000));
    view.setUint32(37, timestamp >>> 0);
    view.setUint16(41, 0); // ext len
    sctBody[43] = 4; // hash alg
    sctBody[44] = 3; // sig alg
    view.setUint16(45, 72); // sig len

    // List: 2-byte total length + 2-byte SCT length + body
    const totalSctLen = 2 + sctBody.length;
    const list = new Uint8Array(2 + totalSctLen);
    const listView = new DataView(list.buffer);
    listView.setUint16(0, totalSctLen);
    listView.setUint16(2, sctBody.length);
    list.set(sctBody, 4);

    const hex = bytesToHex(list);
    const scts = parseSCTList(hex);
    expect(scts).toHaveLength(1);
    expect(scts[0].version).toBe(0);
    expect(scts[0].timestamp).toBe(timestamp);
  });
});
