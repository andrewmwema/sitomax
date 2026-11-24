import type Anthropic from "@anthropic-ai/sdk";
import { APP_NOTE } from "./agent-plan";

type Message = Anthropic.MessageParam;
type Block = Exclude<Message["content"], string>[number];

export const MEMORY_LIMITS = {
  /** A thread's history is summarised once it holds more requests than this… */
  historyTurns: 6,
  /** …or is longer than this, which a request that read whole pages soon is. */
  historyChars: 12_000,
  /** The memory note is short: it is sent with every step of every later request. */
  summaryChars: 2_400,
  requestChars: 400,
  replyChars: 400,
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
      if (block.type === "tool_use" && (block.name === "get_page" || block.name === "get_section")) pageRead = block.id;
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
 * What one model request is sent, in the order the provider caches it. The
 * tools and the rules come first and never change. The site overview opens
 * the conversation and stays as it was first sent for the whole run. Both are
 * kept for an hour, so a run that waits for an approval, and the next request
 * in the same session, still read them from the cache. The conversation
 * follows and only grows; it is marked up to its end, so each request reads
 * the previous one's and adds its own.
 * The overview is not saved into the conversation. Without `cache` nothing is
 * marked: the small model's requests are short and its cache is not priced.
 */
export function withSiteOverview(messages: Message[], overview: string, cache = true): Message[] {
  const mark = (ttl: "5m" | "1h") => cache ? { cache_control: { type: "ephemeral" as const, ttl } } : {};
  const note = { type: "text" as const, text: overview, ...mark("1h") };
  // Every message is sent in the same form on every request, so the cached copy keeps matching.
  const sent = messages.map((message): Message => typeof message.content === "string" && message.role !== "system"
    ? { role: message.role, content: blocks(message) } : message);
  const last = sent.at(-1);
  if (last && last.role !== "system") {
    const content = blocks(last);
    sent[sent.length - 1] = { role: last.role, content: content.map((block, index) =>
      index === content.length - 1 && block.type !== "thinking" && block.type !== "redacted_thinking" ? { ...block, ...mark("5m") } : block) };
  }
  const first = sent[0];
  // A user turn may not open with anything before its tool results, and the first turn never holds any.
  if (first?.role === "user" && !blocks(first).some((block) => block.type === "tool_result")) {
    return [{ role: "user", content: [note, ...blocks(first)] }, ...sent.slice(1)];
  }
  return [{ role: "user", content: [note] }, ...sent];
}

/** Adds to the user's side of the conversation without leaving two user turns in a row. */
export function appendUserContent(messages: Message[], content: Block[]): Message[] {
  const last = messages.at(-1);
  if (last?.role !== "user") return [...messages, { role: "user", content }];
  return [...messages.slice(0, -1), { role: "user", content: [...blocks(last), ...content] }];
}

/** What the user asked or answered in a conversation: not tool results, and not what the app told the model. */
export function countUserTurns(messages: Message[]): number {
  return messages.filter((message) => message.role === "user" && blocks(message).some((block) =>
    block.type === "text" && block.text.trim() !== "" && block.text !== "Continue." && !block.text.startsWith(APP_NOTE) && !block.text.startsWith(SUMMARY_MARK))).length;
}

/**
 * Thread memory. A short history is kept as it is. One that is long, or holds
 * more than `historyTurns` requests (`turns` counts those already summarised),
 * is replaced by a short note of what matters for the next request: what the
 * user asked and answered, what the agent replied and which steps it took.
 * Tool payloads are dropped; the agent reads again what it needs.
 */
export function summarizeHistory(messages: Message[], options: { staged?: string[]; note?: string; limit?: number; turns?: number } = {}): Message[] {
  const history = closeOpenToolCalls(messages);
  const turns = options.turns ?? countUserTurns(history);
  if (turns <= MEMORY_LIMITS.historyTurns && JSON.stringify(history).length <= (options.limit ?? MEMORY_LIMITS.historyChars)) return history;

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
    ? `\nChanges staged for the user's review: ${clip(options.staged.join("; "), 1_200)}` : "";
  return [{ role: "user", content: `${SUMMARY_MARK}\n${lines.join("\n")}${staged}${options.note ? `\n${options.note}` : ""}` }];
}
