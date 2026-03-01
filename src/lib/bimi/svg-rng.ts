import { readFileSync } from "fs";
import { join } from "path";
import type { BimiCheckItem } from "./types";
import { errorMessage } from "@/lib/utils";

const schemaPath = join(process.cwd(), "src/lib/bimi/svg-tiny-ps.rng");
const schema = readFileSync(schemaPath, "utf-8");

export interface RngValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validate an SVG string against the SVG Tiny PS RELAX NG schema */
export async function validateSvgRng(svgContent: string): Promise<RngValidationResult> {
  try {
    const { validateXML } = await import("xmllint-wasm");

    const result = await validateXML({
      xml: [{ fileName: "input.svg", contents: svgContent }],
      schema: [{ fileName: "svg_tiny_ps.rng", contents: schema }],
      extension: "relaxng",
    });

    return {
      valid: result.valid,
      errors: result.errors.map((e) => e.message),
    };
  } catch (err) {
    const message = errorMessage(err);
    return {
      valid: false,
      errors: [`RNG validation failed: ${message}`],
    };
  }
}

/** Convert RNG validation results to structured check items */
export function rngToCheckItems(result: RngValidationResult): BimiCheckItem[] {
  if (result.valid) {
    return [
      {
        id: "rng-schema",
        category: "spec",
        label: "RELAX NG schema",
        status: "pass",
        summary: "SVG conforms to the SVG Tiny PS RELAX NG schema",
      },
    ];
  }

  return result.errors.map((error, i) => ({
    id: `rng-error-${i}`,
    category: "spec" as const,
    label: "RELAX NG schema",
    status: "fail" as const,
    summary: error,
    specRef: "draft-svg-tiny-ps-abrotman",
  }));
}
