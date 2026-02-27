import { readFile } from "node:fs/promises";
import { join } from "node:path";

let regularFont: ArrayBuffer | null = null;
let boldFont: ArrayBuffer | null = null;

const fontsDir = join(process.cwd(), "src/lib/og/fonts");

export async function getRegularFont(): Promise<ArrayBuffer> {
  if (!regularFont) {
    regularFont = (await readFile(join(fontsDir, "Geist-Regular.ttf"))).buffer as ArrayBuffer;
  }
  return regularFont;
}

export async function getBoldFont(): Promise<ArrayBuffer> {
  if (!boldFont) {
    boldFont = (await readFile(join(fontsDir, "Geist-Bold.ttf"))).buffer as ArrayBuffer;
  }
  return boldFont;
}

export async function getOgFonts() {
  const [regular, bold] = await Promise.all([getRegularFont(), getBoldFont()]);
  return [
    { name: "Geist", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Geist", data: bold, weight: 700 as const, style: "normal" as const },
  ];
}
