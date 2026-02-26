import Anthropic from "@anthropic-ai/sdk";

export interface NotabilityResult {
  score: number;
  reason: string;
  description: string;
}

export interface BrandInput {
  id: string;
  org: string;
  domain: string;
  country: string;
}

const SYSTEM = `You score brand notability for companies getting BIMI email certificates.

Score guide:
- 9-10: Household name, Fortune 500, major government (Apple, NHS, US Treasury)
- 7-8: Well-known within their industry or region (Cloudflare, Grab, BBVA)
- 4-6: Established mid-market company, recognized locally
- 1-3: Small/unknown business, individual, or unrecognizable name

Always use the provided tool to respond.`;

const SINGLE_TOOL: Anthropic.Messages.Tool = {
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

const BATCH_TOOL: Anthropic.Messages.Tool = {
  name: "score_notability_batch",
  description: "Record notability scores for a batch of brands",
  input_schema: {
    type: "object" as const,
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "The brand ID from the input" },
            score: { type: "number", description: "Notability score from 1-10" },
            reason: { type: "string", description: "Why this score, max 15 words" },
            description: { type: "string", description: "What the company does, max 15 words" },
          },
          required: ["id", "score", "reason", "description"],
        },
        description: "One result per brand in the input, matched by id",
      },
    },
    required: ["results"],
  },
};

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

/** Score a single brand. Use scoreNotabilityBatch for multiple. */
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
      tools: [SINGLE_TOOL],
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
    return normalizeResult(input);
  } catch (err) {
    console.warn("scoreNotability failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Score up to 10 brands in a single Haiku call. Returns a map of id -> result. */
export async function scoreNotabilityBatch(
  brands: BrandInput[]
): Promise<Map<string, NotabilityResult>> {
  const results = new Map<string, NotabilityResult>();
  const anthropic = getClient();
  if (!anthropic || brands.length === 0) return results;

  // Fall back to single calls if only one brand
  if (brands.length === 1) {
    const b = brands[0];
    const r = await scoreNotability(b.org, [b.domain], b.country);
    if (r) results.set(b.id, r);
    return results;
  }

  const brandList = brands
    .map((b) => `- id="${b.id}" org="${b.org}" domain="${b.domain}" country="${b.country}"`)
    .join("\n");

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: SYSTEM,
      tools: [BATCH_TOOL],
      tool_choice: { type: "tool", name: "score_notability_batch" },
      messages: [
        {
          role: "user",
          content: `Score these ${brands.length} brands:\n${brandList}`,
        },
      ],
    });

    const toolBlock = msg.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
    );
    if (!toolBlock) return results;

    const input = toolBlock.input as {
      results: Array<{ id: string; score: number; reason: string; description: string }>;
    };

    for (const r of input.results) {
      const normalized = normalizeResult(r);
      if (normalized) results.set(r.id, normalized);
    }
  } catch (err) {
    console.warn("scoreNotabilityBatch failed:", err instanceof Error ? err.message : String(err));
  }

  return results;
}

function normalizeResult(input: { score: number; reason: string; description: string }): NotabilityResult {
  return {
    score: Math.max(1, Math.min(10, Math.round(input.score))),
    reason: (input.reason || "").slice(0, 200),
    description: (input.description || "").slice(0, 200),
  };
}
