import Anthropic from "@anthropic-ai/sdk";

export interface NotabilityResult {
  score: number;
  reason: string;
  description: string;
}

const SYSTEM = `You score brand notability for companies getting BIMI email certificates.

Score guide:
- 9-10: Household name, Fortune 500, major government (Apple, NHS, US Treasury)
- 7-8: Well-known within their industry or region (Cloudflare, Grab, BBVA)
- 4-6: Established mid-market company, recognized locally
- 1-3: Small/unknown business, individual, or unrecognizable name

Always use the score_notability tool to respond.`;

const TOOL: Anthropic.Messages.Tool = {
  name: "score_notability",
  description: "Record the notability score for a brand",
  input_schema: {
    type: "object" as const,
    properties: {
      score: {
        type: "number",
        description: "Notability score from 1-10",
      },
      reason: {
        type: "string",
        description: "Why this score, max 15 words",
      },
      description: {
        type: "string",
        description: "What the company does, max 15 words",
      },
    },
    required: ["score", "reason", "description"],
  },
};

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
      max_tokens: 200,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "score_notability" },
      messages: [
        {
          role: "user",
          content: `Organization: ${org}\nDomain: ${domain}\nCountry: ${country || "unknown"}`,
        },
      ],
    });

    const toolBlock = msg.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
    );
    if (!toolBlock) return null;

    const input = toolBlock.input as NotabilityResult;
    const score = Math.max(1, Math.min(10, Math.round(input.score)));
    return {
      score,
      reason: (input.reason || "").slice(0, 200),
      description: (input.description || "").slice(0, 200),
    };
  } catch (err) {
    console.warn("scoreNotability failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
