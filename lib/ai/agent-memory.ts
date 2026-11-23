import type Anthropic from "@anthropic-ai/sdk";
import { APP_NOTE } from "./agent-plan";

type Message = Anthropic.MessageParam;
type Block = Exclude<Message["content"], string>[number];

export const MEMORY_LIMITS = {
  /** A thread's history is summarised once it is longer than this. */
  historyChars: 24_000,
  summaryChars: 8_000,
  requestChars: 1_200,
  replyChars: 800,
  /** A run's conversation is left as it is, and so stays cached, until it is longer than this. */
  contextChars: 60_000,
  /** Tool results up to this length are never removed. */
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
 * written in. The site overview at the end of that conversation changes with
 * every staged change and old tool results are trimmed, so a returned
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
 * A run's conversation only grows, so the provider can reuse its cached copy
 * of everything already sent. Rewriting old messages discards that copy, so
 * the conversation is shortened in one go, and only once it is long. Tool
 * results are replaced by a short note, oldest first, until it is half the
 * limit; the latest page read stays because the agent is working on it, and
 * so does the result the model has not answered yet.
 * What must stay can itself be long, so the next shortening also waits until
 * the conversation has grown by half the limit again; `compactedChars` is its
 * length after the last one.
 */
export function compactToolResults(messages: Message[], compactedChars = 0, limit: number = MEMORY_LIMITS.contextChars) {
  let size = JSON.stringify(messages).length;
  if (size <= Math.max(limit, compactedChars + limit / 2)) return { messages, compactedChars };
  let pageRead: string | undefined;
  let latest: string | undefined;
  for (const message of messages) {
    for (const block of blocks(message)) {
      if (block.type === "tool_use" && block.name === "get_page") pageRead = block.id;
      if (block.type === "tool_result") latest = block.tool_use_id;
    }
  }
  const compacted = messages.map((message) => {
    if (message.role !== "user" || typeof message.content === "string") return message;
    let changed = false;
    const content = message.content.map((block) => {
      if (block.type !== "tool_result" || block.tool_use_id === pageRead || block.tool_use_id === latest) return block;
      const length = resultText(block).length;
      if (size <= limit / 2 || length <= MEMORY_LIMITS.toolResultChars) return block;
      size -= length - OMITTED.length;
      changed = true;
      return { ...block, content: OMITTED };
    });
    return changed ? { ...message, content } : message;
  });
  return { messages: compacted, compactedChars: JSON.stringify(compacted).length };
}

/**
 * What one model call is sent: the saved conversation, marked as cacheable up
 * to its end, followed by context that is only true for this call. The context
 * is never saved, so the next call's conversation still starts with the cached one.
 */
export function withTurnContext(messages: Message[], context: string): Message[] {
  const note = { type: "text" as const, text: context };
  // Every message is sent in the same form on every call, so the cached copy keeps matching.
  const sent = messages.map((message): Message => typeof message.content === "string" && message.role !== "system"
    ? { role: message.role, content: blocks(message) } : message);
  const last = sent.at(-1);
  if (!last || last.role === "system") return [...sent, { role: "user", content: [note] }];
  const content = blocks(last);
  const marked = content.map((block, index) => index === content.length - 1 && block.type !== "thinking" && block.type !== "redacted_thinking"
    ? { ...block, cache_control: { type: "ephemeral" as const, ttl: "5m" as const } } : block);
  if (last.role === "user") return [...sent.slice(0, -1), { role: "user", content: [...marked, note] }];
  return [...sent.slice(0, -1), { role: "assistant", content: marked }, { role: "user", content: [note] }];
}

/** Adds to the user's side of the conversation without leaving two user turns in a row. */
export function appendUserContent(messages: Message[], content: Block[]): Message[] {
  const last = messages.at(-1);
  if (last?.role !== "user") return [...messages, { role: "user", content }];
  return [...messages.slice(0, -1), { role: "user", content: [...blocks(last), ...content] }];
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
        // What the app told the model while it worked is not something the user said.
        if (message.role === "user" && block.text.startsWith(APP_NOTE)) continue;
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
