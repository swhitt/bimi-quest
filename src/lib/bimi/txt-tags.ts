/** Parse a semicolon-delimited TXT record (BIMI, DMARC, etc.) into key-value tags */
export function parseTxtTagList(txt: string): {
  tags: Record<string, string>;
  presentTags: Set<string>;
} {
  const tags: Record<string, string> = {};
  const presentTags = new Set<string>();
  const parts = txt.split(";").map((s) => s.trim());

  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.substring(0, eqIdx).trim().toLowerCase();
    const value = part.substring(eqIdx + 1).trim();
    tags[key] = value;
    presentTags.add(key);
  }

  return { tags, presentTags };
}
