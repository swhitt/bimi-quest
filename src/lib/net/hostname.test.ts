import { describe, it, expect } from "vitest";
import { isPrivateIP, isPrivateHostname } from "./hostname";

describe("isPrivateIP", () => {
  it("detects IPv4 loopback", () => {
    expect(isPrivateIP("127.0.0.1")).toBe(true);
    expect(isPrivateIP("127.255.255.255")).toBe(true);
  });

  it("detects RFC 1918 ranges", () => {
    expect(isPrivateIP("10.0.0.1")).toBe(true);
    expect(isPrivateIP("10.255.255.255")).toBe(true);
    expect(isPrivateIP("172.16.0.1")).toBe(true);
    expect(isPrivateIP("172.31.255.255")).toBe(true);
    expect(isPrivateIP("192.168.0.1")).toBe(true);
    expect(isPrivateIP("192.168.255.255")).toBe(true);
  });

  it("detects link-local", () => {
    expect(isPrivateIP("169.254.0.1")).toBe(true);
    expect(isPrivateIP("169.254.169.254")).toBe(true);
  });

  it("detects CGNAT range", () => {
    expect(isPrivateIP("100.64.0.1")).toBe(true);
    expect(isPrivateIP("100.127.255.255")).toBe(true);
  });

  it("detects benchmark range", () => {
    expect(isPrivateIP("198.18.0.1")).toBe(true);
    expect(isPrivateIP("198.19.255.255")).toBe(true);
  });

  it("detects 0.0.0.0/8", () => {
    expect(isPrivateIP("0.0.0.0")).toBe(true);
    expect(isPrivateIP("0.1.2.3")).toBe(true);
  });

  it("allows public IPs", () => {
    expect(isPrivateIP("8.8.8.8")).toBe(false);
    expect(isPrivateIP("1.1.1.1")).toBe(false);
    expect(isPrivateIP("203.0.113.1")).toBe(false);
    expect(isPrivateIP("172.15.0.1")).toBe(false);
    expect(isPrivateIP("172.32.0.1")).toBe(false);
    expect(isPrivateIP("100.63.255.255")).toBe(false);
    expect(isPrivateIP("198.17.255.255")).toBe(false);
  });

  it("detects IPv6 loopback and private ranges", () => {
    expect(isPrivateIP("::1")).toBe(true);
    expect(isPrivateIP("::0")).toBe(true);
    expect(isPrivateIP("::")).toBe(true);
    expect(isPrivateIP("fe80::1")).toBe(true);
    expect(isPrivateIP("fc00::1")).toBe(true);
    expect(isPrivateIP("fd12:3456::1")).toBe(true);
  });

  it("detects IPv4-mapped IPv6 addresses", () => {
    expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIP("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIP("::ffff:192.168.1.1")).toBe(true);
    expect(isPrivateIP("::ffff:8.8.8.8")).toBe(false);
    expect(isPrivateIP("::ffff:1.1.1.1")).toBe(false);
  });

  it("detects documentation and discard IPv6 ranges", () => {
    expect(isPrivateIP("2001:db8::1")).toBe(true);
    expect(isPrivateIP("2001:db8:abcd::1")).toBe(true);
    expect(isPrivateIP("100::1")).toBe(true);
  });

  it("allows public IPv6", () => {
    expect(isPrivateIP("2607:f8b0:4004:800::200e")).toBe(false);
    expect(isPrivateIP("2001:4860:4860::8888")).toBe(false);
  });
});

describe("isPrivateHostname", () => {
  it("detects localhost variants", () => {
    expect(isPrivateHostname("localhost")).toBe(true);
    expect(isPrivateHostname("LOCALHOST")).toBe(true);
    expect(isPrivateHostname("something.localhost")).toBe(true);
  });

  it("detects .local and .internal TLDs", () => {
    expect(isPrivateHostname("myhost.local")).toBe(true);
    expect(isPrivateHostname("server.internal")).toBe(true);
  });

  it("detects cloud metadata endpoints", () => {
    expect(isPrivateHostname("metadata.google.internal")).toBe(true);
    expect(isPrivateHostname("metadata.google.com")).toBe(true);
  });

  it("detects bracketed IPv6", () => {
    expect(isPrivateHostname("[::1]")).toBe(true);
    expect(isPrivateHostname("[::0]")).toBe(true);
  });

  it("detects IPv4 literals", () => {
    expect(isPrivateHostname("127.0.0.1")).toBe(true);
    expect(isPrivateHostname("10.0.0.1")).toBe(true);
    expect(isPrivateHostname("0.0.0.0")).toBe(true);
  });

  it("allows public hostnames", () => {
    expect(isPrivateHostname("example.com")).toBe(false);
    expect(isPrivateHostname("google.com")).toBe(false);
    expect(isPrivateHostname("internal.example.com")).toBe(false);
  });
});
