import sharp from "sharp";

/**
 * Generates the static default OG image for pages without specific OG cards.
 * Run with: bun run scripts/generate-og-default.ts
 */

const WIDTH = 1200;
const HEIGHT = 630;

const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0C1222"/>
      <stop offset="100%" stop-color="#0F1A2E"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>

  <!-- Shield icon -->
  <g transform="translate(${WIDTH / 2 - 40}, 140)">
    <path d="M40 0 L75 15 L75 45 C75 72 40 90 40 90 C40 90 5 72 5 45 L5 15 Z"
          fill="none" stroke="#5EEAD4" stroke-width="3"/>
    <path d="M28 45 L37 54 L55 36" fill="none" stroke="#5EEAD4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <!-- Title -->
  <text x="${WIDTH / 2}" y="290" text-anchor="middle"
        font-family="sans-serif" font-weight="bold" font-size="56" fill="#E8EAED">
    BIMI Quest
  </text>

  <!-- Tagline -->
  <text x="${WIDTH / 2}" y="340" text-anchor="middle"
        font-family="sans-serif" font-size="24" fill="#5EEAD4">
    Certificate Market Intelligence
  </text>

  <!-- Description -->
  <text x="${WIDTH / 2}" y="400" text-anchor="middle"
        font-family="sans-serif" font-size="18" fill="#8B95A5">
    Track VMC and CMC certificate issuances across all Certificate Authorities
  </text>

  <!-- Bottom bar -->
  <rect x="0" y="${HEIGHT - 50}" width="${WIDTH}" height="50" fill="#080E1A"/>
  <text x="40" y="${HEIGHT - 20}" font-family="sans-serif" font-size="16" fill="#1A3A4A">
    bimi.quest
  </text>
</svg>`;

async function main() {
  await sharp(Buffer.from(svg)).resize(WIDTH, HEIGHT).png().toFile("public/og-default.png");
  console.log("Generated public/og-default.png");
}

main().catch(console.error);
