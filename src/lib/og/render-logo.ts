import sharp from "sharp";

/**
 * Render an SVG string to a PNG buffer at the given dimensions.
 * Returns a data URI suitable for embedding in Satori JSX as <img src={}>.
 */
export async function renderLogoToPngDataUri(svg: string, width = 256, height = 256): Promise<string> {
  const png = await sharp(Buffer.from(svg))
    .resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/**
 * Render an SVG string to a PNG buffer (raw bytes).
 */
export async function renderLogoToPng(svg: string, width = 256, height = 256): Promise<Buffer> {
  return sharp(Buffer.from(svg))
    .resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}
