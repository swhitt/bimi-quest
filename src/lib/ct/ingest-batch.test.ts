import { describe, expect, it } from "vitest";
import { isTransientError } from "./ingest-batch";

describe("isTransientError", () => {
  it("detects fetch failures", () => {
    expect(isTransientError("fetch failed")).toBe(true);
  });

  it("detects connection timeouts", () => {
    expect(isTransientError("CONNECT_TIMEOUT")).toBe(true);
  });

  it("detects connection refused", () => {
    expect(isTransientError("connection refused")).toBe(true);
    expect(isTransientError("ECONNREFUSED")).toBe(true);
  });

  it("detects connection reset", () => {
    expect(isTransientError("connection reset")).toBe(true);
    expect(isTransientError("ECONNRESET")).toBe(true);
  });

  it("detects connection closed", () => {
    expect(isTransientError("connection closed")).toBe(true);
  });

  it("detects too many clients", () => {
    expect(isTransientError("too many clients")).toBe(true);
  });

  it("detects ETIMEDOUT", () => {
    expect(isTransientError("ETIMEDOUT")).toBe(true);
  });

  it("detects socket hang up", () => {
    expect(isTransientError("socket hang up")).toBe(true);
  });

  it("returns false for parse errors", () => {
    expect(isTransientError("Cannot read properties of undefined")).toBe(false);
  });

  it("returns false for type errors", () => {
    expect(isTransientError("TypeError: x is not a function")).toBe(false);
  });

  it("returns false for generic errors", () => {
    expect(isTransientError("some unknown error")).toBe(false);
  });

  it("matches when the keyword is embedded in a longer message", () => {
    expect(isTransientError("Error: fetch failed after 3 retries")).toBe(true);
    expect(isTransientError("NeonDbError: too many clients already")).toBe(true);
  });
});
