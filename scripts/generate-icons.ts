import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ICON_DIR = resolve("public/icons");
const LOGO = resolve("public/logo.svg");
const THEME_BG = "#0C1222";

mkdirSync(ICON_DIR, { recursive: true });

async function generateIcon(size: number, output: string, maskable = false) {
  const instance = sharp(LOGO);
  if (maskable) {
    // Maskable icons need 20% safe-zone padding (80% of the icon is the logo)
    const logoSize = Math.round(size * 0.8);
    const padding = Math.round((size - logoSize) / 2);
    const resized = await instance.resize(logoSize, logoSize).png().toBuffer();
    await sharp({
      create: { width: size, height: size, channels: 4, background: THEME_BG },
    })
      .composite([{ input: resized, left: padding, top: padding }])
      .png()
      .toFile(output);
  } else {
    await instance.resize(size, size).png().toFile(output);
  }
}

async function main() {
  await Promise.all([
    generateIcon(192, resolve(ICON_DIR, "icon-192.png")),
    generateIcon(512, resolve(ICON_DIR, "icon-512.png")),
    generateIcon(192, resolve(ICON_DIR, "icon-maskable-192.png"), true),
    generateIcon(512, resolve(ICON_DIR, "icon-maskable-512.png"), true),
    generateIcon(180, resolve(ICON_DIR, "apple-touch-icon.png")),
    sharp(LOGO).resize(32, 32).toFile(resolve("public/favicon.ico")),
  ]);

  console.log("Generated all PWA icons:");
  console.log("  public/icons/icon-192.png");
  console.log("  public/icons/icon-512.png");
  console.log("  public/icons/icon-maskable-192.png");
  console.log("  public/icons/icon-maskable-512.png");
  console.log("  public/icons/apple-touch-icon.png");
  console.log("  public/favicon.ico");
}

main().catch(console.error);
