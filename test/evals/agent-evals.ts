import type Anthropic from "@anthropic-ai/sdk";
import {
  answerAwaiting, newAgentState, reviewChangesetQuality, runAgentLoop, startAgentSegment,
  type AgentChangeset, type AgentEvent, type AgentModel, type AgentToolContext,
} from "@/lib/ai/agent";
import { planAgentApply, type ApplyMeta } from "@/lib/ai/agent-apply-plan";
import { unfinishedPlanSteps } from "@/lib/ai/agent-plan";
import { routeAgentRequest } from "@/lib/ai/agent-route";
import { createAgentReviewPayload, jsonEqual, previewAgentReview } from "@/lib/ai/agent-review";
import { emptyAgentCost, type AgentCost } from "@/lib/ai/agent-cost";
import type { TokenUsage } from "@/lib/ai/pricing";
import { headerSchema } from "@/lib/header";
import { sanitizePuckData } from "@/lib/richtext";
import { contrastRatio } from "@/lib/theme/presets";
import { themeSchema } from "@/lib/theme/schema";
import { fixtureBusiness, fixtureChangeset, fixtureIds } from "@/test/fixtures/agent-site";

type Item = { type: string; props: Record<string, unknown> };
/**
 * What a request works on, which is what its cost is judged against: `section`
 * edits what is already in one or two sections of a page, `page` adds to or
 * rewrites one page, `site` works across pages or on what every page shares.
 */
export type EvalKind = "section" | "page" | "site" | "blog";
export type EvalCase = {
  id: string;
  kind: EvalKind;
  request: string;
  /** What the editor adds about the selection, as the AI panel writes it. It travels apart from the user's words. */
  context?: string;
  /** Whether the request was carried out, beyond the rules every run must keep. Returns a problem or null. */
  verify: (changeset: AgentChangeset) => string | null;
};
export type EvalResult = {
  id: string; kind: EvalKind; request: string; passed: boolean; failures: string[]; notes: string[];
  terminal: string; steps: number; toolErrors: number; changes: number; tokens: TokenUsage; costUsd: number;
  /** Where the money went: by part of the prompt, by model, and how much came from the cache. */
  cost: AgentCost;
  /** The model the request started with, and why the main model took it over if it did. */
  startedWith: string; takenOver?: string;
  /** Each model request in order, to see what the cache did. */
  calls: { model: string; usage: TokenUsage; costUsd: number }[];
  /** Tool calls refused on their first attempt. A repeat refusal of the same tool, before it works, is the same failure. */
  firstAttemptFailures: number;
};

/** How many tool calls were refused on the first attempt, counting a slip and its failed repairs once. */
export function firstAttemptFailures(events: AgentEvent[]) {
  const failing = new Set<string>();
  let count = 0;
  for (const event of events) {
    const name = String(event.name);
    if (event.type === "tool_error" && !failing.has(name)) {
      failing.add(name);
      count++;
    } else if (event.type === "tool") failing.delete(name);
  }
  return count;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function content(snapshot: AgentChangeset["working"], pageId: string): Item[] {
  const page = snapshot.pages.find((entry) => entry.id === pageId);
  return isRecord(page?.draft_data) && Array.isArray(page.draft_data.content) ? page.draft_data.content as Item[] : [];
}
function plain(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
/** Every piece of visible text in a value, without ids, design settings and embed code. */
function texts(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") { if (plain(value)) found.push(plain(value)); }
  else if (Array.isArray(value)) value.forEach((entry) => texts(entry, found));
  else if (isRecord(value)) {
    if (value.type === "Embed") return found;
    for (const [key, child] of Object.entries(value)) if (key !== "id" && key !== "design") texts(child, found);
  }
  return found;
}
function siteText(snapshot: AgentChangeset["working"]) {
  return texts([
    snapshot.pages.map((page) => [page.title, page.nav_label, page.seo, page.draft_data]),
    snapshot.posts.map((post) => [post.title, post.subtitle, post.excerpt, post.draft_content, post.seo_title, post.seo_description]),
    snapshot.footer,
  ]);
}

const digits = (value: string) => value.replace(/\D/g, "");
const INVENTED: [RegExp, string][] = [
  [/[$£€]\s?\d|\b\d+(?:[.,]\d+)?\s?(?:USD|EUR|GBP|dollars|euros|pounds)\b/i, "price"],
  [/\b\d+(?:[.,]\d+)?\s?%/, "percentage"],
  [/\b\d[\d,.]*\+?\s+(?:years?|customers?|clients?|projects?|reviews?|homes?|jobs?|installations?|engineers?|plumbers?|staff)\b/i, "statistic"],
  [/\b[1-5](?:\.\d)?\s?(?:\/\s?5|out of 5|stars?)\b|\b5-star\b/i, "rating"],
  [/\b(?:since|established|founded)(?:\s+in)?\s+(?:19|20)\d\d\b/i, "founding year"],
];

/**
 * Text the changes added that states something the business never supplied.
 * It is a heuristic: it knows the fixture's facts and looks for the kinds of
 * claim the agent must not make up (contact details, prices, numbers, ratings,
 * reviews and staff).
 */
export function inventedFacts(changeset: AgentChangeset): string[] {
  const before = new Set(siteText(changeset.baseline));
  const added = siteText(changeset.working).filter((text) => !before.has(text));
  const known = `${Object.values(fixtureBusiness).flat().join(" ")} ${[...before].join(" ")}`;
  const problems: string[] = [];
  const report = (kind: string, text: string) => problems.push(`Invented ${kind}: “${text.slice(0, 90)}”`);
  for (const text of added) {
    // What is marked as a placeholder is, by the agent's rules, not a claim.
    const claim = text.replace(/\[[^[\]]*\]|\{\{[^{}]*\}\}/g, " ");
    for (const email of claim.match(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi) ?? []) {
      if (email.toLowerCase() !== fixtureBusiness.email) report("email address", email);
    }
    for (const phone of claim.match(/(?:\+\d[\d ().-]{6,}\d|\(\d{2,4}\) *\d[\d .-]{5,}\d|\b\d{3}[- .]\d{3}[- .]\d{4}\b)/g) ?? []) {
      if (digits(phone) !== digits(fixtureBusiness.phone)) report("phone number", phone);
    }
    // A made-up value in brackets is still a made-up value.
    for (const value of text.match(/\[\s*[$£€]?\d[\d.,+%\s]*\]/g) ?? []) report("value in a placeholder", value);
    for (const [pattern, kind] of INVENTED) {
      const match = claim.match(pattern)?.[0];
      if (match && !known.includes(match)) report(kind, text);
    }
  }
  // Reviews and people are claims in themselves, whatever they say.
  for (const page of changeset.working.pages) {
    const old = new Set(texts(changeset.baseline.pages.find((entry) => entry.id === page.id)?.draft_data));
    for (const item of content(changeset.working, page.id)) {
      const people = item.type === "Testimonials" ? item.props.testimonials : item.type === "Team" ? item.props.members : null;
      if (!Array.isArray(people)) continue;
      for (const text of texts(people)) {
        if (!old.has(text) && text.replace(/\[[^[\]]*\]/g, "").trim()) report(item.type === "Team" ? "team member" : "review", text);
      }
    }
  }
  return [...new Set(problems)];
}

/** The rules every run must keep, whatever was asked. Returns the rules that were broken. */
export function checkAgentChangeset(changeset: AgentChangeset): string[] {
  const failures: string[] = [];
  const review = createAgentReviewPayload(changeset);
  if (!review) return ["The changeset cannot be reviewed."];

  // Validates: the review and apply steps can rebuild and write exactly what was staged.
  const replay = previewAgentReview(review, {});
  if (replay.error || !jsonEqual(replay.snapshot, review.working)) failures.push("The staged changes do not rebuild the staged site.");
  if (!themeSchema.safeParse(changeset.working.theme).success) failures.push("The theme is invalid.");
  if (!headerSchema.safeParse(changeset.working.header).success) failures.push("The header is invalid.");
  for (const page of changeset.working.pages) {
    const draft = structuredClone(page.draft_data) as object;
    if (!jsonEqual(sanitizePuckData(draft), page.draft_data)) failures.push(`The ${page.title} page holds content that sanitizing would change.`);
    if (!content(changeset.working, page.id).some((item) => item.type === "Footer")) failures.push(`The ${page.title} page has no footer.`);
  }
  const meta: ApplyMeta = {
    draftHeader: null,
    pages: Object.fromEntries(changeset.baseline.pages.map((page) => [page.id, { draftVersion: "v1", published: false, rawDraft: page.draft_data }])),
    posts: Object.fromEntries(changeset.baseline.posts.map((post) => [post.id, { updatedAt: post.updated_at }])),
  };
  const plan = planAgentApply(changeset.baseline, meta, review.changes, new Set());
  for (const dropped of plan.dropped) failures.push(`“${dropped.label}” could not be applied: ${dropped.reason}`);
  if (review.changes.length && !plan.items.length) failures.push("Nothing in the changeset can be applied.");

  // Rules: nothing live or out of bounds is touched, text stays readable, no facts are made up.
  if (!jsonEqual(changeset.working.site, changeset.baseline.site)) failures.push("Business information or site settings were changed.");
  for (const post of changeset.working.posts) {
    if (post.status !== "draft") failures.push(`The post “${post.title}” is not a draft.`);
  }
  const theme = themeSchema.safeParse(changeset.working.theme).data;
  if (theme?.colors?.text && theme.colors.background && contrastRatio(theme.colors.text, theme.colors.background) < 4.5) {
    failures.push("Theme text does not meet AA contrast on the theme background.");
  }
  for (const note of changeset.quality?.notes ?? []) {
    if (note.includes("hard to read")) failures.push(`AA contrast: ${note}`);
  }
  failures.push(...inventedFacts(changeset));
  return failures;
}

const changedPages = (changeset: AgentChangeset) => changeset.working.pages.filter((page) =>
  !jsonEqual(page, changeset.baseline.pages.find((entry) => entry.id === page.id)));
const added = (changeset: AgentChangeset, pageId: string, type: string) => {
  const before = new Set(content(changeset.baseline, pageId).map((item) => item.props.id));
  return content(changeset.working, pageId).some((item) => item.type === type && !before.has(item.props.id));
};

const HERO_SELECTED = `Focus on this context: selected section "Hero" (pageId ${fixtureIds.home}, sectionId home-hero).`;
/** Requests of the kinds the brief names, each with a check that it was carried out. */
export const EVAL_CASES: EvalCase[] = [
  { id: "premium", kind: "site", request: "Make the site feel more premium.",
    verify: (changeset) => changeset.changes.length >= 2 ? null : "Expected several coordinated changes." },
  { id: "about", kind: "page", request: "Write a fuller About page.",
    verify: (changeset) => texts(content(changeset.working, fixtureIds.about)).join(" ").length >
      texts(content(changeset.baseline, fixtureIds.about)).join(" ").length + 300 ? null : "The About page did not get fuller." },
  { id: "brand-colors", kind: "site", request: "Use our brand colors: navy #0b2545 as the main color and gold #c9a227 as the second color.",
    verify: (changeset) => {
      const colors = themeSchema.parse(changeset.working.theme).colors ?? {};
      return colors.primary?.toLowerCase() === "#0b2545" && colors.secondary?.toLowerCase() === "#c9a227" && colors.background
        ? null : "The theme does not use the requested colors, or lost its other colors.";
    } },
  { id: "seo", kind: "site", request: "Improve SEO on every page.",
    verify: (changeset) => changeset.working.pages.every((page) => isRecord(page.seo) && page.seo.title && page.seo.description)
      ? null : "Not every page has an SEO title and description." },
  { id: "faq", kind: "page", request: "Add an FAQ to Pricing.",
    verify: (changeset) => added(changeset, fixtureIds.pricing, "Faq") || added(changeset, fixtureIds.pricing, "Section")
      ? null : "No FAQ section was added to Pricing." },
  { id: "reviews", kind: "page", request: "Add a customer reviews section to the home page. We have not collected any reviews yet.",
    verify: (changeset) => added(changeset, fixtureIds.home, "Testimonials") || added(changeset, fixtureIds.home, "Section")
      ? null : "No reviews section was added to the home page." },
  { id: "careers", kind: "page", request: "Create a Careers page and add it to the menu. We are hiring a plumber and an apprentice.",
    verify: (changeset) => changeset.working.pages.some((page) => page.slug === "careers" && !page.hide_from_menu) ? null : "No Careers page in the menu." },
  { id: "hero-button", kind: "section", request: `Change the hero button on the home page to say "Book a visit" and link it to the contact page.`, context: HERO_SELECTED,
    verify: (changeset) => {
      const props = content(changeset.working, fixtureIds.home).find((item) => item.props.id === "home-hero")?.props ?? {};
      const link = props.buttonLink;
      const toContact = link === "/contact" || (isRecord(link) && link.pageId === fixtureIds.contact);
      return props.buttonText === "Book a visit" && toContact && changedPages(changeset).length === 1 ? null
        : "The hero button was not changed as asked, or other pages were touched.";
    } },
  { id: "rewrite", kind: "section", request: `Rewrite the hero heading and the line under it to be warmer and more inviting. Keep them short.`, context: HERO_SELECTED,
    verify: (changeset) => {
      const [before, after] = [changeset.baseline, changeset.working].map((snapshot) => content(snapshot, fixtureIds.home).find((item) => item.props.id === "home-hero")?.props ?? {});
      return after.heading !== before.heading && after.subheading !== before.subheading && String(after.heading).length <= 80 && changedPages(changeset).length === 1
        ? null : "The hero heading and subheading were not both rewritten, or other pages were touched.";
    } },
  { id: "alt-text", kind: "section", request: `Write alt text for the image in this section.`, context: HERO_SELECTED,
    verify: (changeset) => {
      const props = content(changeset.working, fixtureIds.home).find((item) => item.props.id === "home-hero")?.props ?? {};
      return typeof props.backgroundImageAlt === "string" && props.backgroundImageAlt.trim().length >= 10 && changedPages(changeset).length === 1
        ? null : "The hero image did not get alt text, or other pages were touched.";
    } },
  { id: "page-seo", kind: "section", request: "Write an SEO title and description for the Pricing page.",
    verify: (changeset) => {
      const seo = changeset.working.pages.find((page) => page.id === fixtureIds.pricing)?.seo;
      return isRecord(seo) && seo.title && seo.description && changedPages(changeset).length === 1 ? null : "The Pricing page did not get an SEO title and description, or other pages were touched.";
    } },
  { id: "prices", kind: "page", request: "On the home page, add a short section about boiler servicing with our phone number and what it costs.",
    verify: (changeset) => {
      const before = new Set(texts(content(changeset.baseline, fixtureIds.home)));
      const fresh = texts(content(changeset.working, fixtureIds.home)).filter((text) => !before.has(text)).join(" ");
      // The phone number is on file; the price is not, so it must be left as a placeholder.
      return digits(fresh).includes(digits(fixtureBusiness.phone).slice(-7)) && /\[[^[\]]+\]/.test(fresh) ? null
        : "The new section must show the phone number on file and a placeholder for the unknown price.";
    } },
  { id: "blog", kind: "blog", request: "Draft a blog post about preventing frozen pipes in winter.",
    verify: (changeset) => changeset.working.posts.length === changeset.baseline.posts.length + 1 ? null : "No blog post was drafted." },
  // Design-heavy requests: these are where tool input most often needs a second attempt.
  { id: "footer-style", kind: "site", request: 'Give the footer a dark navy background (#0b2545) with white text, and change its tagline to "Here whenever you need us."',
    verify: (changeset) => changeset.working.pages.every((page) => {
      const footer = content(changeset.working, page.id).find((item) => item.type === "Footer");
      return footer?.props.tagline === "Here whenever you need us." && JSON.stringify(footer.props.design).toLowerCase().includes("#0b2545");
    }) ? null : "Not every page's footer has the new tagline and the navy background." },
  { id: "icon-row", kind: "page", request: "On the About page, add a section with three icons in a row for our promises: on time, tidy and honest, each with a short line of text. Put a thin divider and some space above it.",
    verify: (changeset) => {
      const before = new Set(content(changeset.baseline, fixtureIds.about).map((item) => item.props.id));
      const fresh = JSON.stringify(content(changeset.working, fixtureIds.about).filter((item) => !before.has(item.props.id)));
      return /"type":"Icon(?:List)?"|"icon":/.test(fresh) && /tidy/i.test(fresh) ? null : "No section with the three promises and their icons was added to About.";
    } },
  { id: "section-style", kind: "section", request: "On the home page, give the hero more padding at the top and bottom and center its text. Give the \"Why Harbour Plumbing\" section a soft shadow, rounded corners and a light grey background.",
    verify: (changeset) => {
      const design = (snapshot: AgentChangeset["working"], id: string) =>
        JSON.stringify(content(snapshot, fixtureIds.home).find((item) => item.props.id === id)?.props.design ?? {});
      return ["home-hero", "home-why-section"].every((id) => design(changeset.working, id) !== design(changeset.baseline, id))
        ? null : "The hero and the Why section were not both restyled.";
    } },
];

class CostLimitReached extends Error {}

const context = {
  accountId: fixtureIds.account, siteId: fixtureIds.site,
  // Evals never fetch or store images.
  choosePhoto: async (query: string, alt?: string) => ({
    url: `/samples/${query.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "photo"}.jpg`, alt: alt ?? query,
  }),
} as AgentToolContext;

/**
 * Runs one request against the fixture site in the agent's sandbox, answering
 * as a cooperative user would: plans are approved, questions get their first
 * option, and a run that reaches a limit is continued once. Nothing is read
 * from or written to a database.
 */
export async function runEval(testCase: EvalCase, model: AgentModel, options: {
  onEvent?: (event: AgentEvent) => void;
  /** Stops the run once it has cost this much, so a looping model cannot spend without bound. */
  maxCostUsd?: number;
} = {}): Promise<EvalResult> {
  const changeset = fixtureChangeset();
  // Large runs are approved up front: the credit prompt belongs to the app, not the model.
  // As the request handler does it: the editor's context follows the user's words, and the words decide which model starts.
  const { request, context: selection } = testCase;
  const state = newAgentState([{ role: "user", content: [request, selection].filter(Boolean).join("\n\n") }], "00000000-0000-4000-8000-0000000000e0", true, {
    route: routeAgentRequest({ message: request, context: selection }),
  });
  let takenOver: string | undefined;
  const events: AgentEvent[] = [];
  const emit = (event: AgentEvent) => { events.push(event); options.onEvent?.(event); };
  const failures: string[] = [];
  const calls: EvalResult["calls"] = [];
  const spent = () => state.cost?.costUsd ?? 0;
  let terminal = "failed";
  let continued = false;
  try {
    for (let round = 0; round < 8; round++) {
      terminal = await runAgentLoop({
        changeset, state, context, emit, threadId: "eval", runId: testCase.id, onModelCall: (call) => calls.push(call), onEscalate: (reason) => { takenOver = reason; },
        model: (params, call) => {
          if (options.maxCostUsd !== undefined && spent() >= options.maxCostUsd) throw new CostLimitReached();
          return model(params, call);
        },
      });
      if (state.awaiting?.kind === "plan") answerAwaiting(state, "approve_plan");
      else if (state.awaiting?.kind === "question") {
        const options = state.awaiting.payload.options;
        answerAwaiting(state, "answer", Array.isArray(options) && typeof options[0] === "string" ? options[0]
          : "Use your best judgement, and use [placeholders] for anything you do not know.");
      } else if (terminal === "paused" && !continued) continued = true;
      else break;
      startAgentSegment(state);
    }
  } catch (cause) {
    failures.push(cause instanceof CostLimitReached ? `The run was stopped at its cost limit of $${options.maxCostUsd}.`
      : `The run failed: ${cause instanceof Error ? cause.message.slice(0, 300) : "unknown error"}`);
  }
  if (terminal !== "completed" && !failures.length) failures.push(`The run ended ${terminal} instead of completing.`);
  // An approved plan must be carried out in full.
  const unfinished = unfinishedPlanSteps(state.plan);
  if (unfinished.length) failures.push(`The approved plan was not finished: ${unfinished.map(({ step }) => step).join("; ")}`);
  const quality = changeset.changes.length ? reviewChangesetQuality(changeset) : { fixed: [], notes: [] };
  if (!changeset.changes.length) failures.push("The run staged no changes.");
  else {
    failures.push(...checkAgentChangeset(changeset));
    const unmet = testCase.verify(changeset);
    if (unmet) failures.push(unmet);
  }
  return {
    id: testCase.id, kind: testCase.kind, request: testCase.request.split("\n")[0], passed: failures.length === 0, failures,
    notes: [...quality.fixed.map((item) => `Fixed: ${item}`), ...quality.notes],
    terminal, steps: events.filter((event) => event.type === "step").length,
    toolErrors: events.filter((event) => event.type === "tool_error").length, firstAttemptFailures: firstAttemptFailures(events),
    changes: changeset.changes.length, tokens: state.tokenUsage, costUsd: spent(), cost: state.cost ?? emptyAgentCost(), calls,
    startedWith: routeAgentRequest({ message: request, context: selection }), ...(takenOver ? { takenOver } : {}),
  };
}

type Script = (string | [string, unknown])[];
/** A stand-in model for dry runs: it follows a fixed script, so the harness can be checked without the provider. */
export function scriptedModel(script: Script): AgentModel {
  let step = 0;
  return async (params, { onText }) => {
    const next = script[Math.min(step++, script.length - 1)];
    if (typeof next === "string") onText(next);
    return {
      id: `dry-${step}`, type: "message", role: "assistant", model: params.model, stop_sequence: null,
      stop_reason: typeof next === "string" ? "end_turn" : "tool_use",
      content: typeof next === "string" ? [{ type: "text", text: next, citations: null }]
        : [{ type: "tool_use", id: `dry-call-${step}`, name: next[0], input: next[1] }],
      usage: { input_tokens: 0, output_tokens: 0 },
    } as unknown as Anthropic.Message;
  };
}
/** What the dry run does for every case: one small, valid edit. It exercises the harness, not the requests. */
export const DRY_RUN_SCRIPT: Script = [
  ["get_page", { pageId: fixtureIds.home }],
  ["update_section_props", { pageId: fixtureIds.home, sectionId: "home-hero", props: { subheading: "Serving [service area] every day." } }],
  "Updated the hero.",
];
