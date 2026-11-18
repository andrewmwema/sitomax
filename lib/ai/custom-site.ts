import type { z } from "zod";
import {
  buildCustomSections, customPlanContract, customPlanTask, customSectionTask, customSiteSectionContract,
} from "./custom-layout";
import { fillSiteTool, safeValidationIssues, type SiteToolCall, type SiteToolTrace } from "./site-tool";
import type { GenerationInput, GenerationProgress } from "./site-input";
import { puckConfig } from "@/lib/puck/config";
import type { LayoutItem } from "@/lib/layout/structure";

export const customSiteMaxTokens = (toolName: string) => toolName === "plan_custom_site" ? 7000 : 5000;

export class CustomSiteError extends Error {
  constructor(outcome: string, stage: string, readonly issues: ReturnType<typeof safeValidationIssues>) {
    const message = outcome === "incomplete" ? `The AI response for the ${stage} was incomplete. Try simpler design guidance.`
      : outcome === "refused" ? `The AI could not complete the ${stage} with these instructions. Try rephrasing them.`
        : outcome === "missing_tool" ? `The AI did not return the ${stage} in the expected format. Please try again.`
          : `The AI-generated ${stage} failed validation. Try more focused design guidance.`;
    super(`${message} No drafts were changed.`);
  }
}

export async function planCustomSite(call: SiteToolCall, input: GenerationInput, trace: SiteToolTrace) {
  const { schema, tool } = customPlanContract(input);
  const { result, outcome } = await fillSiteTool(call, tool, schema, customPlanTask(generationBrief(input)), trace);
  if (!result.success) throw customError(outcome, "website plan", result.error);
  return result.data;
}

function customError(outcome: string, stage: string, error: z.ZodError) {
  return new CustomSiteError(outcome, stage, outcome === "validation_failed" ? safeValidationIssues(error.issues.slice(0, 5)) : []);
}

type Plan = Awaited<ReturnType<typeof planCustomSite>>;
function generationBrief(input: GenerationInput) {
  return {
    businessName: input.businessName, businessType: input.businessType, city: input.city, services: input.services,
    difference: input.difference, style: input.style, styleDirection: input.styleDirection, fontDirection: input.fontDirection,
    designDescription: input.designDescription, desiredPages: input.desiredPages, desiredSections: input.desiredSections,
    primaryColor: input.primaryColor, secondaryColor: input.secondaryColor, phone: input.phone, email: input.email,
    address: input.address, tone: input.tone, openingHours: input.openingHours, description: input.description,
  };
}

export async function writeCustomPage(
  call: SiteToolCall, input: GenerationInput, trace: SiteToolTrace, plan: Plan,
  page: Plan["pages"][number], label: string, emit: (event: GenerationProgress) => void, warnings = new Set<string>(),
) {
  const brief = generationBrief(input);
  const { tool, schema } = customSiteSectionContract(input);
  const sections: LayoutItem[] = [];
  for (let start = 0; start < page.sections.length; start += 3) {
    const indexes = page.sections.slice(start, start + 3).map((_, index) => start + index);
    emit({ message: `Designing ${label} (${start + 1}–${indexes.at(-1)! + 1} of ${page.sections.length})…` });
    const batch = await Promise.allSettled(indexes.map(async (index) => {
      const { kind } = page.sections[index];
      if (kind === "footer") return null;
      if (kind === "contact") return {
        type: "ContactForm",
        props: { ...puckConfig.components.ContactForm.defaultProps, id: `ContactForm-${crypto.randomUUID()}`, variant: "split", image: "" },
      };
      const { result, outcome } = await fillSiteTool(call, tool, schema, customSectionTask(page, index, brief, {
        style: plan.style, colors: plan.colors, fonts: plan.fonts,
      }), { ...trace, page: page.slug || "home", section: index + 1 });
      if (!result.success) throw customError(outcome, `${label} section ${index + 1}`, result.error);
      return buildCustomSections([result.data.section], plan.colors, warnings)[0];
    }));
    for (const section of batch) {
      if (section.status === "rejected") throw section.reason;
      if (section.value && (section.value.type !== "ContactForm" || !sections.some(({ type }) => type === "ContactForm"))) sections.push(section.value);
    }
  }
  return [...sections, {
    type: "Footer",
    props: { ...puckConfig.components.Footer.defaultProps, id: `Footer-${crypto.randomUUID()}` },
  }];
}
