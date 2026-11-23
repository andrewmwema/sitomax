/**
 * The steps the chat shows while the agent works. A model's first attempt at a
 * tool call is sometimes refused for the way its input was written, and the
 * model is asked to repair it; the user is shown the attempt and its repair as
 * one step that worked. A step shows as failed when it was refused for any
 * other reason, when the repair was refused too, or when the run ended
 * without a repair.
 *
 * The repair is the next call of the same tool. It may name another page or
 * section, since a wrong one is among the things repaired, so it cannot be
 * matched more closely than that.
 */
export type AgentStep = {
  callId: string;
  /** The tool, so a repeat of the same step can stand in for a failed attempt. */
  name: string;
  label: string;
  /** `retrying` is an attempt the agent was asked to repair. */
  status: "running" | "done" | "waiting" | "retrying" | "error";
  /** For the user, in plain words. */
  error?: string;
  /** Technical messages of failed attempts. Only agency staff are sent these. */
  details?: string[];
};
export type AgentStepUpdate = Pick<AgentStep, "callId" | "name" | "label" | "status"> & { error?: string; details?: string[] };

export const STEP_FAILED = "This step could not be completed.";

export function applyAgentStep(steps: AgentStep[], update: AgentStepUpdate): AgentStep[] {
  // A new attempt at the same tool takes the place of the attempts that were refused.
  const settles = update.status !== "running";
  const replaced = settles ? steps.filter((step) => step.status === "retrying" && step.name === update.name && step.callId !== update.callId) : [];
  const rest = steps.filter((step) => !replaced.includes(step));
  const index = rest.findIndex((step) => step.callId === update.callId);
  const details = [...replaced.flatMap((step) => step.details ?? []), ...(index >= 0 ? rest[index].details ?? [] : []), ...(update.details ?? [])];
  const { error, ...shown } = update;
  const next: AgentStep = { ...shown, ...(error ? { error } : {}), ...(details.length ? { details } : {}) };
  // The repair is shown where the first attempt was.
  if (index >= 0) return rest.map((step, position) => position === index ? next : step);
  const position = replaced.length ? steps.indexOf(replaced[0]) : rest.length;
  return [...rest.slice(0, position), next, ...rest.slice(position)];
}

/** The run has ended: an attempt nobody repaired did fail, and a step still running was stopped. */
export function settleAgentSteps(steps: AgentStep[], stopped = false): AgentStep[] {
  return steps.map((step) => step.status === "retrying" ? { ...step, status: "error", error: step.error ?? STEP_FAILED }
    : step.status === "running" && stopped ? { ...step, status: "error", error: "Stopped" } : step);
}
