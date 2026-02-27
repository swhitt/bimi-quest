import { readFile } from "node:fs/promises";
import { join } from "node:path";

let regularFont: ArrayBuffer | null = null;
let boldFont: ArrayBuffer | null = null;

const fontsDir = join(process.cwd(), "src/lib/og/fonts");

export async function getRegularFont(): Promise<ArrayBuffer> {
  if (!regularFont) {
    regularFont = (await readFile(join(fontsDir, "IBMPlexSans-Regular.ttf"))).buffer as ArrayBuffer;
  }
  return regularFont;
}

export async function getBoldFont(): Promise<ArrayBuffer> {
  if (!boldFont) {
    boldFont = (await readFile(join(fontsDir, "IBMPlexSans-Bold.ttf"))).buffer as ArrayBuffer;
  }
  return boldFont;
}

export async function getOgFonts() {
  const [regular, bold] = await Promise.all([getRegularFont(), getBoldFont()]);
  return [
    { name: "IBM Plex Sans", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "IBM Plex Sans", data: bold, weight: 700 as const, style: "normal" as const },
  ];
}
