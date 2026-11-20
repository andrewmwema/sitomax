"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Check, LayoutTemplate, ShieldCheck, Sparkles } from "lucide-react";

export type CreationStep = { title: string; description: string };
export const creationInputClass = "creation-input";

export function SiteCreationShell({ steps, step, mode, children, summary, title, description }: {
  steps: readonly CreationStep[];
  step: number;
  mode: "ai" | "template";
  children: ReactNode;
  summary?: ReactNode;
  title?: string;
  description?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = useRef(step);
  useEffect(() => {
    if (previous.current !== step) heading.current?.focus();
    previous.current = step;
  }, [step]);
  const Icon = mode === "ai" ? Sparkles : LayoutTemplate;
  return <div className="creation-workspace">
    <aside className="creation-sidebar">
      <div className="creation-mode"><Icon size={16} aria-hidden="true" />{mode === "ai" ? "AI site builder" : "Template studio"}</div>
      <ol className="creation-steps" aria-label={mode === "ai" ? "AI setup steps" : "Creation steps"}>
        {steps.map((item, index) => <li key={item.title} aria-current={index === step ? "step" : undefined}
          data-complete={index < step || undefined}>
          <span className="creation-step-number" aria-hidden="true">{index < step ? <Check size={15} /> : index + 1}</span>
          <span><span className="creation-step-title">{item.title}</span><span className="creation-step-detail">{item.description}</span></span>
        </li>)}
      </ol>
      <div className="creation-sidebar-summary">{summary}</div>
      <p className="creation-assurance"><ShieldCheck size={17} aria-hidden="true" />
        {mode === "ai" ? "Draft first. Review every page before you publish." : "Your site goes live only when you choose Create and publish."}
      </p>
    </aside>
    <div className="creation-panel">
      <header className="creation-panel-header">
        <p className="platform-eyebrow">Step {step + 1} of {steps.length}</p>
        <h2 ref={heading} tabIndex={-1}>{title ?? steps[step].title}</h2>
        <p>{description ?? steps[step].description}</p>
      </header>
      {children}
    </div>
  </div>;
}
