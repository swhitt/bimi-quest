import Anthropic from "@anthropic-ai/sdk";

export interface NotabilityResult {
  score: number;
  reason: string;
  description: string;
}

const SYSTEM = `You score brand notability for companies getting BIMI email certificates. Respond ONLY with JSON, no markdown fences.

Schema: {"score":1-10,"reason":"why notable (max 15 words)","description":"what they do (max 15 words)"}

Score guide:
- 9-10: Household name, Fortune 500, major government (Apple, NHS, US Treasury)
- 7-8: Well-known within their industry or region (Cloudflare, Grab, BBVA)
- 4-6: Established mid-market company, recognized locally
- 1-3: Small/unknown business, individual, or unrecognizable name`;

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

export async function scoreNotability(
  org: string | null,
  domains: string[],
  country: string | null
): Promise<NotabilityResult | null> {
  const anthropic = getClient();
  if (!anthropic || !org) return null;

  const domain = domains[0] || "unknown";

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Organization: ${org}\nDomain: ${domain}\nCountry: ${country || "unknown"}`,
        },
      ],
    });

    const text =
      msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    const parsed = JSON.parse(text) as NotabilityResult;

    // Validate
    const score = Math.max(1, Math.min(10, Math.round(parsed.score)));
    return {
      score,
      reason: (parsed.reason || "").slice(0, 200),
      description: (parsed.description || "").slice(0, 200),
    };
  } catch {
    return null;
  }
}
