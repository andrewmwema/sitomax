import { Check, LoaderCircle, X } from "lucide-react";
import type { AgentStep } from "@/lib/ai/agent-steps";

/**
 * The agent's steps in plain words. A refused attempt the agent is repairing
 * looks like work in progress; red is kept for a step that finally failed.
 * Technical messages are only present for agency staff, behind "Details".
 */
export function AgentStepList({ steps, streaming }: { steps: AgentStep[]; streaming: boolean }) {
  return <ol className="space-y-2 border-t border-zinc-100 px-3 py-2">
    {steps.map((step) => <li key={step.callId} className="flex items-start gap-2 text-xs">
      {step.status === "running" || (step.status === "retrying" && streaming) ? <LoaderCircle size={13} className="mt-0.5 shrink-0 animate-spin text-violet-600" />
        : step.status === "done" ? <Check size={13} className="mt-0.5 shrink-0 text-green-700" />
          : step.status === "error" ? <X size={13} className="mt-0.5 shrink-0 text-red-600" />
            : <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full border border-amber-500" />}
      <span className="min-w-0 text-zinc-700">{step.label}
        {step.status === "error" && step.error ? <span className="block text-red-600">{step.error}</span> : null}
        {step.details?.length ? <details className="mt-0.5 text-[10px] text-zinc-500">
          <summary className="cursor-pointer">Details</summary>
          {step.details.map((detail, index) => <p key={index} className="mt-0.5 break-words">{detail}</p>)}
        </details> : null}
      </span>
    </li>)}
  </ol>;
}
