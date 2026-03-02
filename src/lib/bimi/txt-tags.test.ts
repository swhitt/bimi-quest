import { describe, expect, it } from "vitest";
import { parseTxtTagList } from "./txt-tags";

describe("parseTxtTagList", () => {
  it("parses a standard BIMI record", () => {
    const input = "v=BIMI1; l=https://example.com/logo.svg; a=https://example.com/cert.pem";
    const { tags, presentTags } = parseTxtTagList(input);

    expect(tags["v"]).toBe("BIMI1");
    expect(tags["l"]).toBe("https://example.com/logo.svg");
    expect(tags["a"]).toBe("https://example.com/cert.pem");
    expect(presentTags.has("v")).toBe(true);
    expect(presentTags.has("l")).toBe(true);
    expect(presentTags.has("a")).toBe(true);
    expect(presentTags.size).toBe(3);
  });

  it("handles trailing semicolons", () => {
    const input = "v=BIMI1; l=https://logo.svg;";
    const { tags, presentTags } = parseTxtTagList(input);

    expect(tags["v"]).toBe("BIMI1");
    expect(tags["l"]).toBe("https://logo.svg");
    expect(presentTags.size).toBe(2);
  });

  it("handles extra whitespace around keys and values", () => {
    const input = "  v = BIMI1 ;  l = https://logo.svg  ";
    const { tags, presentTags } = parseTxtTagList(input);

    expect(tags["v"]).toBe("BIMI1");
    expect(tags["l"]).toBe("https://logo.svg");
    expect(presentTags.size).toBe(2);
  });

  it("handles values containing = signs", () => {
    const input = "v=BIMI1; l=https://example.com?q=1";
    const { tags, presentTags } = parseTxtTagList(input);

    expect(tags["v"]).toBe("BIMI1");
    expect(tags["l"]).toBe("https://example.com?q=1");
    expect(presentTags.size).toBe(2);
  });

  it("handles empty values", () => {
    const input = "v=BIMI1; l=";
    const { tags, presentTags } = parseTxtTagList(input);

    expect(tags["v"]).toBe("BIMI1");
    expect(tags["l"]).toBe("");
    expect(presentTags.has("l")).toBe(true);
    expect(presentTags.size).toBe(2);
  });

  it("returns empty tags and presentTags for an empty string", () => {
    const { tags, presentTags } = parseTxtTagList("");

    expect(Object.keys(tags)).toHaveLength(0);
    expect(presentTags.size).toBe(0);
  });

  it("lowercases keys", () => {
    const input = "V=BIMI1; L=https://logo.svg";
    const { tags, presentTags } = parseTxtTagList(input);

    expect(tags["v"]).toBe("BIMI1");
    expect(tags["l"]).toBe("https://logo.svg");
    expect(presentTags.has("v")).toBe(true);
    expect(presentTags.has("l")).toBe(true);
    expect(tags["V"]).toBeUndefined();
  });

  it("skips parts without an = sign", () => {
    const input = "v=BIMI1; invalid; l=https://logo.svg";
    const { tags, presentTags } = parseTxtTagList(input);

    expect(tags["v"]).toBe("BIMI1");
    expect(tags["l"]).toBe("https://logo.svg");
    expect(tags["invalid"]).toBeUndefined();
    expect(presentTags.has("invalid")).toBe(false);
    expect(presentTags.size).toBe(2);
  });

  it("tracks all parsed keys in presentTags", () => {
    const input = "v=BIMI1; l=https://logo.svg; a=https://cert.pem";
    const { presentTags } = parseTxtTagList(input);

    expect(presentTags).toEqual(new Set(["v", "l", "a"]));
  });
});
