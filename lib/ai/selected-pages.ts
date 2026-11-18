import { defaultMenuLabel } from "@/lib/page-navigation";
import { selectedPageName, type GenerationInput } from "./site-input";

type Selection = Pick<GenerationInput, "desiredPages" | "pageDetails" | "desiredSections" | "businessName">;

export function selectedPageBriefs(input: Selection) {
  return input.desiredPages.map((slug) => {
    const detail = input.pageDetails?.find((page) => page.slug === slug);
    return { slug, label: selectedPageName(slug, input.pageDetails) ?? defaultMenuLabel(slug), purpose: detail?.purpose ?? "" };
  });
}

export function normalizeSelectedPages<T extends { slug: string }>(
  input: Selection, proposals: T[], fallback: (page: ReturnType<typeof selectedPageBriefs>[number]) => T,
) {
  return selectedPageBriefs(input).map((page) => proposals.find(({ slug }) => slug === page.slug) ?? fallback(page));
}

const sectionPage: Record<Selection["desiredSections"][number], string[]> = {
  pricing: ["pricing", "services", "features"], faq: ["faq", "services", "contact"],
  gallery: ["portfolio", "services", "features"], testimonials: ["testimonials", "portfolio", "about"],
  team: ["team", "about"], process: ["services", "features", "about"], logos: ["about", "portfolio", "features"],
};

export function requestedSectionsForPage(input: Selection, slug: string) {
  const sections = new Set(input.desiredSections);
  for (const [kind, pages] of Object.entries(sectionPage)) {
    if (pages.length && input.desiredPages.includes(pages[0]) && !["process", "logos"].includes(kind)) {
      sections.add(kind as Selection["desiredSections"][number]);
    }
  }
  return [...sections].filter((kind) =>
    (sectionPage[kind].find((candidate) => input.desiredPages.includes(candidate))
      ?? (input.desiredPages.includes("") ? "" : input.desiredPages[0])) === slug);
}

export function fallbackPageSeo(label: string, businessName: string) {
  return {
    title: `${label} | ${businessName}`.slice(0, 59).trim(),
    description: `Learn more about ${businessName} and ${label.toLowerCase()}.`.slice(0, 159).trim(),
  };
}
