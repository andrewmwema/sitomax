import { z } from "zod";

/** An approved plan and how far the agent has got with it. Kept in the run state. */
export const agentPlanSchema = z.object({
  steps: z.array(z.object({
    text: z.string(), status: z.enum(["pending", "done", "skipped"]), note: z.string().optional(),
  })),
});
export type AgentPlan = z.infer<typeof agentPlanSchema>;

/** A plan step that was not carried out: still open, or skipped for the reason given. */
export const unfinishedStepSchema = z.object({ step: z.string(), reason: z.string().optional() });
export type UnfinishedStep = z.infer<typeof unfinishedStepSchema>;

export type PlanProgress = { step: number; status: "done" | "skipped"; note?: string };

const ID = String.raw`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`;
// An id under the name the tools give it: "pageId …", "section_id: …". "page id" in a sentence is ordinary words.
const NAMED_ID = new RegExp(String.raw`\s*[([]?\b(?:page|section|post|design)(?:Id|ID|_id)\b[:=\s]*["'\`]?[\w-]+["'\`]?[)\]]?`, "g");
const BARE_ID = new RegExp(String.raw`\s*[([]?["'\`]?\b(?:[A-Za-z]+-)?${ID}\b["'\`]?[)\]]?`, "gi");
/**
 * Text the agent wrote for the user, without the ids it works with. The agent
 * is told to name pages and sections in plain words; this is for when a plan
 * step or question still carries a pageId or sectionId.
 */
export function withoutIds(text: string) {
  return text.replace(NAMED_ID, "").replace(BARE_ID, "").replace(/\s+([.,;:])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
}
/** `withoutIds` over every string in a value such as a plan or a question. */
export function plainWords<T>(value: T): T {
  // A line that was nothing but an id still has to say something.
  if (typeof value === "string") return (withoutIds(value) || (value.trim() ? "Another change" : value)) as T;
  if (Array.isArray(value)) return value.map(plainWords) as T;
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, plainWords(entry)])) as T;
  return value;
}

export function newAgentPlan(steps: unknown): AgentPlan | undefined {
  const texts = Array.isArray(steps) ? steps.filter((step): step is string => typeof step === "string" && step.trim() !== "") : [];
  return texts.length ? { steps: texts.map((text) => ({ text, status: "pending" as const })) } : undefined;
}

/** Steps nobody has reported on yet, with their 1-based numbers. */
export function openPlanSteps(plan: AgentPlan | undefined) {
  return (plan?.steps ?? []).flatMap((step, index) => step.status === "pending" ? [{ step: index + 1, text: step.text }] : []);
}

export function unfinishedPlanSteps(plan: AgentPlan | undefined): UnfinishedStep[] {
  return (plan?.steps ?? []).flatMap((step) => step.status === "done" ? []
    : [{ step: step.text, ...(step.status === "skipped" && step.note ? { reason: step.note } : {}) }]);
}

/** Records what the agent reports. Returns whether any step changed. */
export function recordPlanProgress(plan: AgentPlan | undefined, updates: PlanProgress[]) {
  if (!plan) throw new Error("There is no approved plan to report on.");
  const unknown = updates.find(({ step }) => !plan.steps[step - 1]);
  if (unknown) throw new Error(`The plan has no step ${unknown.step}. Its steps are numbered 1 to ${plan.steps.length}.`);
  let changed = false;
  for (const { step, status, note } of updates) {
    const entry = plan.steps[step - 1];
    if (entry.status !== status || entry.note !== note) changed = true;
    entry.status = status;
    if (note) entry.note = note;
    else delete entry.note;
  }
  return changed;
}

/** Starts every message the app, not the user, adds to the model's conversation. */
export const APP_NOTE = "[Note from the app, not the user] ";

const listSteps = (steps: { step: number; text: string }[]) => steps.map(({ step, text }) => `${step}. ${text}`).join("\n");

/** Sent whenever work on an approved plan starts or resumes. */
export function planReminder(plan: AgentPlan | undefined) {
  const open = openPlanSteps(plan);
  return open.length ? `${APP_NOTE}Approved plan steps still open:\n${listSteps(open)}\nCarry out every open step, on every page it names, without asking whether to continue. Call report_progress when a step is finished.` : "";
}

/** Sent when the agent ends its turn while approved steps are still open. */
export function planNudge(plan: AgentPlan | undefined) {
  return `${APP_NOTE}You stopped, but these approved plan steps are still open:\n${listSteps(openPlanSteps(plan))}\nCarry them out now. If a step is already finished, report it as done with report_progress; if it cannot be done, report it as skipped with the reason. Do not ask whether to continue.`;
}
