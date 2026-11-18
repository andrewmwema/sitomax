import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export function strictTool(name: string, description: string, schema: z.ZodType) {
  // The SDK moves unsupported grammar constraints into descriptions. The
  // original Zod schema still validates the result locally.
  return {
    name, description, strict: true,
    input_schema: { ...zodOutputFormat(schema).schema, type: "object" },
  } satisfies Tool;
}
