import { z } from "zod";
import { CURATED_FONTS, CURATED_FONT_NAMES } from "@/lib/theme/fonts";
import { readableText } from "./edit-design";
import { aiCatalog, designIds, type PlannedPage } from "./site-schemas";
import { strictTool } from "./strict-tool";
import { adminValidationIssues, runSiteTool, validationMessage, type SiteToolCall, type SiteToolTrace } from "./site-tool";
import { fallbackPageSeo, requestedSectionsForPage, selectedPageBriefs } from "./selected-pages";
import { blueprintSections, MAX_BODY_SECTIONS, ownedBlockTypes, PAGE_BLUEPRINTS } from "./page-blueprints";
import type { GenerationInput } from "./site-input";

export class CuratedPlanError extends Error {
  constructor(readonly issues: ReturnType<typeof adminValidationIssues>) {
    super("The site plan was invalid twice. No drafts were changed. Please contact your agency.");
  }
}

type PlanInput = Pick<GenerationInput, "style" | "fontDirection" | "desiredPages" | "desiredSections" | "pageDetails"> & { businessName?: string };
const LIMIT = { title: 80, seoTitle: 59, seoDescription: 159 } as const;
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const pageKey = (slug: string) => slug || "home";
const blockTypeOf = new Map(aiCatalog.map((design) => [design.id, design.blockType]));
const fontsIn = (category: string) => CURATED_FONTS.filter((font) => font.category === category).map((font) => font.name);
const bounded = (value: string, max: number) => value.trim().slice(0, max).trim();

/**
 * Same selected-pages contract as custom mode: page keys come from the
 * user's selection, and the application owns exact pages, order and
 * required sections. The model only chooses theme, copy direction and designs.
 */
export function curatedPlanContract(input: PlanInput) {
  const selection = { ...input, businessName: input.businessName ?? "this business" };
  const briefs = selectedPageBriefs(selection);
  const keys = briefs.map(({ slug }) => pageKey(slug)) as [string, ...string[]];
  const wire = z.strictObject({
    style: input.style === "auto" ? z.enum(["classic", "modern"]) : z.literal(input.style),
    colors: z.strictObject({ primary: color, secondary: color, background: color, text: color }),
    fonts: z.strictObject({
      heading: z.enum(input.fontDirection === "serif" ? fontsIn("Serif") : input.fontDirection === "sans" ? fontsIn("Sans-serif") : CURATED_FONT_NAMES),
      body: z.enum(input.fontDirection === "sans" ? fontsIn("Sans-serif") : CURATED_FONT_NAMES),
    }),
    pages: z.array(z.strictObject({
      page: z.enum(keys),
      title: z.string(),
      seo: z.strictObject({ title: z.string(), description: z.string() }),
      sections: z.array(z.enum(designIds)).max(MAX_BODY_SECTIONS + 1),
    })).max(keys.length * 2),
  });
  const owned = new Map(briefs.map(({ slug }) => [slug, ownedBlockTypes(slug, requestedSectionsForPage(selection, slug))]));
  // A section with its own page (FAQ, pricing, gallery, team) is not repeated elsewhere as an optional extra.
  const ownedElsewhere = (slug: string) => new Set(briefs.flatMap(({ slug: other }) =>
    other === slug ? [] : [...owned.get(other)!].filter((type) => !owned.get(slug)!.has(type))));
  const schema = wire.transform((plan) => {
    const pages: PlannedPage[] = briefs.map(({ slug, label }) => {
      const proposal = plan.pages.find((page) => page.page === pageKey(slug));
      const fallback = fallbackPageSeo(label, selection.businessName);
      return {
        slug, title: bounded(proposal?.title ?? "", LIMIT.title) || label,
        seo: {
          title: bounded(proposal?.seo.title ?? "", LIMIT.seoTitle) || fallback.title,
          description: bounded(proposal?.seo.description ?? "", LIMIT.seoDescription) || fallback.description,
        },
        sections: blueprintSections(slug, (proposal?.sections ?? []).map((designId) => ({ designId, blockType: blockTypeOf.get(designId)! })),
          requestedSectionsForPage(selection, slug), (id) => blockTypeOf.get(id), ownedElsewhere(slug)),
      };
    });
    const text = readableText(plan.colors.text, plan.colors.background);
    return { style: plan.style, fonts: plan.fonts, pages, colors: { ...plan.colors, text }, contrastAdjusted: text !== plan.colors.text };
  });
  const tool = strictTool("plan_site", `Plan the theme and every selected page (keys: ${keys.join(", ")}). For each page return a title, SEO and ${MAX_BODY_SECTIONS - 2}–${MAX_BODY_SECTIONS} catalog design IDs in reading order.`, wire);
  return { schema, tool };
}

export function curatedPlanTask(input: GenerationInput) {
  const pages = selectedPageBriefs(input).map(({ slug, label, purpose }) => ({
    key: pageKey(slug), label, purpose,
    recommendedDesigns: (PAGE_BLUEPRINTS[slug]?.slots ?? []).map(({ designs }) => designs[0]),
  }));
  return `Plan the theme and every selected page. Return exactly one entry per page key, in this order: ${pages.map(({ key }) => key).join(", ")}.
For each page, choose ${MAX_BODY_SECTIONS - 2}–${MAX_BODY_SECTIONS} catalog design IDs that form a persuasive, premium page: start with a Hero, build desire and trust in the middle (services/features, story, process, proof, FAQ), and end with a call to action or contact form. Never return an empty sections list. Vary layouts between pages; recommendedDesigns are good defaults you may refine.
Write a specific page title and SEO title (<60 chars) and description (<160 chars) using the business type and location.
Pick a refined, distinctive palette (primary, secondary accent, background, text with at least 4.5:1 contrast) and a heading/body font pair that suits the brand.
PAGES:\n${JSON.stringify(pages)}
DESIGN PREFERENCES:\n${JSON.stringify({
    styleDirection: input.styleDirection, fontDirection: input.fontDirection, designDescription: input.designDescription,
    desiredSections: input.desiredSections,
  })}`;
}

export async function planCuratedSite(call: SiteToolCall, input: GenerationInput, prompt: (task: string) => string, trace?: SiteToolTrace) {
  const { schema, tool } = curatedPlanContract(input);
  const task = curatedPlanTask(input);
  let { result, matchingCall, blocks } = await runSiteTool(call, tool, schema, [{ role: "user", content: prompt(task) }], false, trace);
  if (!result.success) {
    const errors = matchingCall ? validationMessage(result.error) : `Expected exactly one ${tool.name} call.`;
    ({ result, matchingCall, blocks } = await runSiteTool(call, tool, schema, [{
      role: "user", content: prompt(`${task}\nThe previous plan was invalid. Correct these validation errors:\n${errors}`),
    }], true, trace));
  }
  if (!result.success) {
    throw new CuratedPlanError(matchingCall ? adminValidationIssues(result.error.issues.slice(0, 5), blocks[0].input)
      : [{ path: [], code: "custom", message: `Expected exactly one ${tool.name} call.`, received: "none" }]);
  }
  return result.data;
}
