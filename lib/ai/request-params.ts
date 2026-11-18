import type Anthropic from "@anthropic-ai/sdk";
import { SITE_GENERATION_MODEL } from "./models";

type RequestOptions = {
  maxTokens: number;
  messages: Anthropic.MessageParam[];
  system?: string;
  cacheTtl?: "5m" | "1h";
  tools?: Anthropic.Tool[];
  toolName?: string;
};

export function anthropicRequestParams(model: string, input: RequestOptions): Anthropic.MessageCreateParamsNonStreaming {
  const toolName = input.toolName;
  const autoTool = model === SITE_GENERATION_MODEL && input.tools && toolName;
  return {
    model,
    max_tokens: input.maxTokens,
    messages: autoTool ? input.messages.map((message) =>
      message.role === "user" && typeof message.content === "string"
        ? { ...message, content: `Call the ${toolName} tool exactly once to return your result. Do not reply with text alone.\n\n${message.content}` }
        : message) : input.messages,
    system: input.cacheTtl && input.system
      ? [{ type: "text", text: input.system, cache_control: { type: "ephemeral", ttl: input.cacheTtl } }]
      : input.system,
    ...(input.tools ? {
      tools: input.tools,
      tool_choice: !toolName ? { type: "auto" } : autoTool ? { type: "auto", disable_parallel_tool_use: true }
        : { type: "tool", name: toolName, disable_parallel_tool_use: true },
      ...(autoTool ? { thinking: { type: "between_tools" } } : {}),
    } : {}),
  };
}
