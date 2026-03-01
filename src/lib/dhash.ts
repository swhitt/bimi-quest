import sharp from "sharp";

/**
 * Compute a perceptual difference hash (dHash) for an SVG string.
 * Renders to a bitmap, auto-crops background, then computes an 8×8 difference
 * hash that's invariant to XML formatting, zoom, padding, and translation.
 * Returns a 16-char hex string, or null on failure.
 */
export async function computeVisualHash(
  svg: string
): Promise<string | null> {
  try {
    const trimmed = await sharp(Buffer.from(svg))
      .resize(256, 256, { fit: "contain", background: "#ffffff" })
      .flatten({ background: "#ffffff" })
      .grayscale()
      .toBuffer();

    const cropped = await sharp(trimmed)
      .trim()
      .resize(9, 8, { fit: "fill" })
      .raw()
      .toBuffer();

    // 9 wide × 8 tall = 72 pixels; compare adjacent pairs per row → 8 bytes (64 bits)
    const bytes = new Uint8Array(8);
    for (let y = 0; y < 8; y++) {
      let byte = 0;
      for (let x = 0; x < 8; x++) {
        if (cropped[y * 9 + x] > cropped[y * 9 + x + 1]) {
          byte |= 1 << x;
        }
      }
      bytes[y] = byte;
    }

    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}
