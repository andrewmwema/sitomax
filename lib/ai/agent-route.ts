/**
 * Which model leads an agent run. The small model takes edits to what is
 * already in a section or two of one page: rewriting text, restyling, alt
 * text, a page's SEO fields. The main model takes planning, new sections and
 * pages, and anything across pages or site-wide.
 *
 * The words of a request only decide where a run starts. What keeps quality is
 * what the run turns out to be: the small model is given only the tools for
 * small edits, hands off anything else, and is taken off the run as soon as
 * its work goes beyond one page or three sections (see `scopeExceeded`). The
 * same bound is where the main model must have an approved plan.
 */
export type AgentRoute = "small" | "main";

/** How far the small model may go before the main model takes over. */
export const SMALL_SCOPE = { sections: 3, toolCalls: 8, messageChars: 600 } as const;

const WHOLE_SITE = /\b(?:every|all|each|whole|entire|across|throughout|site-?wide|everywhere)\b/i;
const BROAD = [
  WHOLE_SITE,
  // The site as a whole, or what every page shares.
  /\b(?:(?:web)?site|theme|brand(?:ing)?|palette|typography|fonts?|header|menu|nav(?:igation)?|footer|blog|posts?|articles?)\b/i,
  /\b(?:pages|sections)\b/i,
  // Something new: "add a reviews section", "create a Careers page", "write a fuller About page".
  /\b(?:add|insert|create|build|write|draft|generate)\s+(?:(?:a|an|another|some|new)\s+){1,2}(?:[\w'’-]+\s+){0,3}(?:pages?|sections?|faqs?|gallery|form|testimonials?|reviews?|list|table|banner|row|column)\b/i,
  /\b(?:redesign|rebrand|restructure|reorgani[sz]e|translate|overhaul|plan)\b/i,
];

/**
 * Where a request starts. `context` is what the editor adds about the selected
 * section. With a section selected only words about the whole site send the
 * request to the main model; without one, any sign of broad work does.
 */
export function routeAgentRequest(input: { message: string; context?: string; openPlan?: boolean }): AgentRoute {
  const { message, context } = input;
  if (input.openPlan || message.length > SMALL_SCOPE.messageChars) return "main";
  // A new section to insert, or the site header, is the main model's whatever the words.
  if (context && /\bInsert the new section\b|\bsite header\b/.test(context)) return "main";
  if (context && /\bsectionId\b/.test(context)) return WHOLE_SITE.test(message) ? "main" : "small";
  return BROAD.some((pattern) => pattern.test(message)) ? "main" : "small";
}

const MISALIGNED = /\b(?:mis-?align\w*|align(?:ed|ment|s|ing)?|(?:off|un)-?cent(?:er|re)d?|cent(?:er|re)(?:d|ing|s)?|lop-?sided|crooked|uneven|shifted|skewed)\b/i;
/**
 * Whether a request is about where something sits: a report that it is
 * misaligned or off-center, or a request to align or center it. Such a run
 * may only call the problem fixed once the layout check has passed.
 */
export function reportsMisalignment(message: string): boolean {
  return MISALIGNED.test(message);
}
/** The sections the editor names with a request: the selected one, and those its layout check measured. */
export function contextSections(context: string | undefined): { pageId: string; sectionId: string }[] {
  const found = [
    ...[...(context ?? "").matchAll(/\(pageId ([0-9a-f-]{36}), sectionId ([^\s)]+)\)/g)]
      .map((match) => ({ pageId: match[1], sectionId: match[2] })),
    ...[...(context ?? "").matchAll(/section id ([^\s)]+) on the page with pageId ([0-9a-f-]{36})/g)]
      .map((match) => ({ pageId: match[2], sectionId: match[1] })),
  ];
  return found.filter((entry, index) => found.findIndex((other) => other.pageId === entry.pageId && other.sectionId === entry.sectionId) === index);
}

export type ChangeScope = { pageId?: string; sections: string[] };
type ChangeTarget = { pageId?: string; sectionId?: string; adds?: boolean };
/**
 * Why a change goes beyond what a run may do without a plan, which is also
 * all the small model may do, or null when it is within it: one page, and at
 * most three parts of the site: its sections, and the theme, header and
 * footer, which count as one each. `adds` is a new section, which has no id yet.
 */
export function scopeExceeded(scope: ChangeScope | undefined, target: ChangeTarget): string | null {
  if (scope?.pageId && target.pageId && target.pageId !== scope.pageId) return "changes a second page";
  const sections = new Set([...(scope?.sections ?? []), ...(target.sectionId ? [target.sectionId] : [])]);
  return sections.size + (target.adds ? 1 : 0) > SMALL_SCOPE.sections ? "changes more than three parts of the site" : null;
}
export function widenScope(scope: ChangeScope | undefined, target: ChangeTarget): ChangeScope {
  const pageId = scope?.pageId ?? target.pageId;
  return { ...(pageId ? { pageId } : {}), sections: [...new Set([...(scope?.sections ?? []), ...(target.sectionId ? [target.sectionId] : [])])] };
}
