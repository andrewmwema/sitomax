import type Anthropic from "@anthropic-ai/sdk";

type Message = Anthropic.MessageParam;
type Block = Exclude<Message["content"], string>[number];

export const MEMORY_LIMITS = {
  /** A thread's history is summarised once it is longer than this. */
  historyChars: 24_000,
  summaryChars: 8_000,
  requestChars: 1_200,
  replyChars: 800,
  /** Tool results kept in full while a run is working. */
  recentToolResults: 6,
  toolResultChars: 600,
} as const;

const SUMMARY_MARK = "EARLIER IN THIS CONVERSATION (summary):";
const OMITTED = "[Earlier tool result removed to save context. Call the tool again if you need it.]";
const INTERRUPTED = "This step was interrupted before it finished. Nothing was changed by it.";

function blocks(message: Message): Block[] {
  return typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content;
}
function clip(text: string, limit: number) {
  const value = text.replace(/\s+/g, " ").trim();
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}
function resultText(block: Anthropic.ToolResultBlockParam) {
  if (typeof block.content === "string") return block.content;
  return (block.content ?? []).map((part) => part.type === "text" ? part.text : "").join(" ");
}

/**
 * The provider rejects a conversation in which a tool call has no result. A
 * stopped or failed run can leave one, so it is answered before continuing.
 */
export function closeOpenToolCalls(messages: Message[]): Message[] {
  const result: Message[] = [];
  messages.forEach((message, index) => {
    const content = blocks(message);
    if (!content.length) return;
    result.push(message);
    if (message.role !== "assistant") return;
    const calls = content.flatMap((block) => block.type === "tool_use" ? [block.id] : []);
    if (!calls.length) return;
    const next = messages[index + 1];
    const answered = new Set(next?.role === "user"
      ? blocks(next).flatMap((block) => block.type === "tool_result" ? [block.tool_use_id] : []) : []);
    const missing = calls.filter((id) => !answered.has(id));
    if (missing.length) result.push({ role: "user", content: missing.map((id) => ({
      type: "tool_result" as const, tool_use_id: id, is_error: true, content: INTERRUPTED,
    })) });
  });
  return result;
}

/**
 * The model's private reasoning is signed against the exact conversation it was
 * written in, including the site map in the system prompt. That map changes
 * with every staged change and old tool results are trimmed, so a returned
 * reasoning block would be rejected. Reasoning is therefore never sent back.
 */
export function dropThinking(messages: Message[]): Message[] {
  return messages.flatMap((message) => {
    if (message.role !== "assistant" || typeof message.content === "string") return [message];
    const content = message.content.filter((block) => block.type !== "thinking" && block.type !== "redacted_thinking");
    if (content.length === message.content.length) return [message];
    return content.length ? [{ ...message, content }] : [];
  });
}

/**
 * Old tool results are most of a long run's context, and the site map already
 * shows their effect. All but the most recent are replaced by a short note.
 */
export function trimToolResults(messages: Message[], keep: number = MEMORY_LIMITS.recentToolResults): Message[] {
  let seen = 0;
  const trimmed = [...messages];
  for (let index = trimmed.length - 1; index >= 0; index--) {
    const message = trimmed[index];
    if (message.role !== "user" || typeof message.content === "string") continue;
    let changed = false;
    const content = [...message.content].reverse().map((block) => {
      if (block.type !== "tool_result" || ++seen <= keep || resultText(block).length <= MEMORY_LIMITS.toolResultChars) return block;
      changed = true;
      return { ...block, content: OMITTED };
    }).reverse();
    if (changed) trimmed[index] = { ...message, content };
  }
  return trimmed;
}

/**
 * Thread memory. A short history is kept as it is. A long one is replaced by
 * what matters for the next request: what the user asked and answered, what
 * the agent replied and which steps it took. Tool payloads are dropped.
 */
export function summarizeHistory(messages: Message[], options: { staged?: string[]; note?: string; limit?: number } = {}): Message[] {
  const history = closeOpenToolCalls(messages);
  if (JSON.stringify(history).length <= (options.limit ?? MEMORY_LIMITS.historyChars)) return history;

  const lines: string[] = [];
  const toolNames = new Map<string, string>();
  let steps = new Map<string, number>();
  const flushSteps = () => {
    if (!steps.size) return;
    lines.push(`Agent steps: ${[...steps].map(([name, count]) => count > 1 ? `${name} ×${count}` : name).join(", ")}`);
    steps = new Map();
  };
  for (const message of history) {
    for (const block of blocks(message)) {
      if (block.type === "text" && block.text.trim()) {
        if (message.role === "user" && block.text.startsWith(SUMMARY_MARK)) {
          lines.push(...block.text.slice(SUMMARY_MARK.length).split("\n").map((line) => line.trim()).filter(Boolean));
          continue;
        }
        flushSteps();
        lines.push(message.role === "user" ? `User: ${clip(block.text, MEMORY_LIMITS.requestChars)}`
          : `Agent: ${clip(block.text, MEMORY_LIMITS.replyChars)}`);
      } else if (block.type === "tool_use") {
        toolNames.set(block.id, block.name);
        if (block.name === "plan" || block.name === "ask_user") {
          flushSteps();
          lines.push(`Agent ${block.name === "plan" ? "proposed a plan" : "asked"}: ${clip(JSON.stringify(block.input), MEMORY_LIMITS.replyChars)}`);
        } else steps.set(block.name, (steps.get(block.name) ?? 0) + 1);
      } else if (block.type === "tool_result" && ["plan", "ask_user"].includes(toolNames.get(block.tool_use_id) ?? "")) {
        lines.push(`User: ${clip(resultText(block), MEMORY_LIMITS.requestChars)}`);
      }
    }
  }
  flushSteps();
  // The latest exchanges matter most; the oldest lines go first.
  while (lines.length > 1 && lines.join("\n").length > MEMORY_LIMITS.summaryChars) lines.shift();
  const staged = options.staged?.length
    ? `\nChanges staged for the user's review: ${clip(options.staged.join("; "), 2_000)}` : "";
  return [{ role: "user", content: `${SUMMARY_MARK}\n${lines.join("\n")}${staged}${options.note ? `\n${options.note}` : ""}` }];
}
