import sharp from "sharp";

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

const SYSTEM_INSTRUCTION = `You rate how visually interesting logo images are. These logos appear in a gallery — you're scoring what makes someone stop and look.

Score each logo from 1-10 on visual interestingness:

- 9-10: Stunning — bold colors, high contrast, unique shapes, striking design, instantly eye-catching. Could be ultra-polished or delightfully weird.
- 7-8: Interesting — distinctive character, strong visual identity, clever use of color/shape/negative space. Stands out in a crowd.
- 5-6: Decent — competent design but forgettable. Nothing wrong, nothing exciting.
- 3-4: Dull — generic, bland, cookie-cutter corporate. Plain text on solid background. You'd scroll right past it.
- 1-2: Nothing — broken rendering, mostly blank, solid color, or completely unrecognizable.

High scores: vivid color, high contrast, unusual shapes, creative illustration, strong personality, professional polish, memorable silhouettes.
Low scores: plain text logos, generic icons, low contrast, washed-out colors, boring corporate sameness.

Use the provided function to return your scores.`;

export interface LogoQualityResult {
  svgHash: string;
  score: number;
  reason: string;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

/** Convert SVG text to a 128x128 PNG buffer for Gemini vision input. */
export async function svgToPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg))
    .resize(128, 128, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
}

/**
 * Score a batch of logos using Gemini Flash-Lite.
 * Each logo is identified by its svgHash and provided as a PNG.
 * Returns scores for each logo in the batch.
 */
export async function scoreLogoQualityBatch(
  logos: { svgHash: string; png: Buffer }[],
): Promise<Map<string, LogoQualityResult>> {
  const results = new Map<string, LogoQualityResult>();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || logos.length === 0) return results;

  // Build parts: text prompt followed by interleaved labels + images
  const parts: GeminiPart[] = [{ text: `Score these ${logos.length} logo images. Each is labeled with an ID.\n` }];
  for (let i = 0; i < logos.length; i++) {
    parts.push({ text: `Logo ID: "${logos[i].svgHash}"` });
    parts.push({
      inlineData: {
        mimeType: "image/png",
        data: logos[i].png.toString("base64"),
      },
    });
  }
  parts.push({ text: "Score all logos above using the score_logos function." });

  const tool = {
    functionDeclarations: [
      {
        name: "score_logos",
        description: "Record quality scores for a batch of logo images",
        parameters: {
          type: "OBJECT",
          properties: {
            scores: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  id: { type: "STRING", description: "The logo ID from the input" },
                  score: { type: "INTEGER", description: "Quality score from 1-10" },
                  reason: { type: "STRING", description: "Brief explanation, max 10 words" },
                },
                required: ["id", "score", "reason"],
              },
            },
          },
          required: ["scores"],
        },
      },
    ],
  };

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: "user", parts }],
    tools: [tool],
    toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["score_logos"] } },
  };

  const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ functionCall?: GeminiFunctionCall }>;
      };
    }>;
  };

  const candidate = json.candidates?.[0];
  const fcPart = candidate?.content?.parts?.find((p) => p.functionCall);
  if (!fcPart?.functionCall) return results;

  const args = fcPart.functionCall.args as { scores?: unknown[] };
  const scores = Array.isArray(args.scores) ? args.scores : [];

  for (const item of scores) {
    if (typeof item !== "object" || item === null) continue;
    const s = item as { id?: string; score?: number; reason?: string };
    if (typeof s.id !== "string" || typeof s.score !== "number") continue;
    results.set(s.id, {
      svgHash: s.id,
      score: Math.max(1, Math.min(10, Math.round(s.score))),
      reason: (s.reason || "").slice(0, 200),
    });
  }

  return results;
}
