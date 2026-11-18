import "server-only";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { puckConfig } from "@/lib/puck/config";
import { sanitizePuckData } from "@/lib/richtext";
import { businessSchema } from "@/lib/business";
import { isReservedForAccountSite } from "@/lib/reserved-subdomains";
import { contrastRatio, DEFAULT_COLORS, type SiteTheme } from "@/lib/theme/presets";
import { CURATED_FONTS } from "@/lib/theme/fonts";
import { requestAi } from "./client";
import { AiProviderError } from "./provider-error";
import { beginSiteGeneration, claimPageRetry, finishPageRetry, finishSiteGeneration, stageSelectedGeneration } from "./usage";
import { createGenerationInputSchema, type GenerationInput, type GenerationOutcome, type GenerationProgress, type GenerationResult } from "./site-input";
import { catalogPageSections, defaultSection, pageFillContract, PLAN_SITE_TOOL, planSchema, type SitePlan } from "./site-schemas";
import { fillPage, runSiteTool, validationMessage, type SiteToolCall } from "./site-tool";
import { SITE_SYSTEM_PROMPT } from "./site-prompt";
import { createPhotoResolver, fillSectionPhotos } from "./photos";
import { CUSTOM_LAYOUT_CONTRACT, customSystemPrompt } from "./custom-layout";
import { CustomSiteError, customSiteMaxTokens, planCustomSite, writeCustomPage } from "./custom-site";
import { brand } from "@/lib/brand";
import { defaultMenuLabel, menuLabelSchema, pageMenuLinks } from "@/lib/page-navigation";
import { reviewGeneratedPage } from "./site-quality";
import { fallbackPageSeo, normalizeSelectedPages, requestedSectionsForPage, selectedPageBriefs } from "./selected-pages";
import { isEmptyPage } from "@/lib/editor/empty-page";
import { themeSchema } from "@/lib/theme/schema";

export class SiteGenerationError extends Error {
  constructor(message: string, readonly validationIssues?: CustomSiteError["issues"]) { super(message); }
}

async function authorize(input: GenerationInput) {
  const { supabase, user } = await requireUser();
  const [{ data: admin, error: adminError }, { data: owner, error: ownerError }] = await Promise.all([
    supabase.rpc("is_super_admin"), supabase.rpc("is_account_owner", { acc: input.accountId }),
  ]);
  if (adminError || ownerError) throw new SiteGenerationError("Could not verify generation permissions.");
  if (!admin && (!owner || !input.siteId)) throw new SiteGenerationError("Only account owners or the agency can generate a site.");
  const { data: account, error: accountError } = await supabase.from("accounts")
    .select("id, is_internal").eq("id", input.accountId).maybeSingle();
  if (accountError || !account || (account.is_internal && !admin)) {
    throw new SiteGenerationError("This account is unavailable.");
  }
  if (!input.siteId && input.subdomain && isReservedForAccountSite(input.subdomain, Boolean(admin), account.is_internal === true)) {
    throw new SiteGenerationError("This subdomain is reserved.");
  }
  let existingTheme: SiteTheme | undefined;
  if (input.siteId) {
    const { data: site, error } = await supabase.from("sites").select("id, theme, draft_theme")
      .eq("id", input.siteId).eq("account_id", input.accountId).maybeSingle();
    if (error || !site) throw new SiteGenerationError("This site is unavailable to your account.");
    existingTheme = themeSchema.parse(site.draft_theme ?? site.theme ?? {});
  } else {
    const { data, error } = await supabase.from("sites").select("id").eq("subdomain", input.subdomain!).maybeSingle();
    if (error) throw new SiteGenerationError("Could not check the subdomain.");
    if (data) throw new SiteGenerationError("This subdomain is already in use.");
  }
  return { supabase, userId: user.id, isAdmin: Boolean(admin), existingTheme };
}

function planValidator(input: GenerationInput) {
  const selected = new Set(input.desiredPages);
  return z.preprocess((value) => {
    if (!value || typeof value !== "object" || !("pages" in value) || !Array.isArray(value.pages)) return value;
    return { ...value, pages: value.pages.filter((page) => page && typeof page.slug === "string" && selected.has(page.slug)) };
  }, planSchema.superRefine((plan, ctx) => {
    if (input.style !== "auto" && plan.style !== input.style) ctx.addIssue({ code: "custom", path: ["style"], message: "Respect the requested style." });
    if (input.fontDirection !== "auto") {
      const headingCategory = CURATED_FONTS.find(({ name }) => name === plan.fonts.heading)?.category;
      if (input.fontDirection === "serif" && headingCategory !== "Serif") {
        ctx.addIssue({ code: "custom", path: ["fonts", "heading"], message: "Use a curated serif heading font." });
      }
      if (input.fontDirection === "sans" && (headingCategory !== "Sans-serif"
        || CURATED_FONTS.find(({ name }) => name === plan.fonts.body)?.category !== "Sans-serif")) {
        ctx.addIssue({ code: "custom", path: ["fonts"], message: "Use curated sans-serif fonts." });
      }
    }
    const bg = plan.colors.background, fg = plan.colors.text;
    if (contrastRatio(bg, fg) < 4.5) ctx.addIssue({ code: "custom", path: ["colors"], message: "Body text/background contrast must be at least 4.5:1." });
  }));
}

type CustomPlan = Awaited<ReturnType<typeof planCustomSite>>;
type BuildPage =
  | { mode: "custom"; page: CustomPlan["pages"][number]; plan: Pick<CustomPlan, "style" | "colors" | "fonts"> }
  | { mode: "catalog"; page: SitePlan["pages"][number] };
type RetrySpec = { input: GenerationInput; build: BuildPage; theme: SiteTheme; menu: { slug: string; nav_label: string }[] };

function providerCall(input: GenerationInput, generationId: string, requestId: string, deadline = Date.now() + 620_000): SiteToolCall {
  return async (tool, messages) => {
    if (Date.now() >= deadline) throw new SiteGenerationError("This run reached its time limit. Retry the remaining pages for free.");
    return requestAi({
    accountId: input.accountId, siteId: input.siteId, action: "generate_site", generationId, correlationId: requestId,
    system: input.generationMode === "custom" ? customSystemPrompt() : SITE_SYSTEM_PROMPT, cacheTtl: "5m",
    tools: [tool], toolName: tool.name,
    maxTokens: input.generationMode === "custom" ? customSiteMaxTokens(tool.name) : tool.name === "plan_site" ? 7000 : 16000,
    ...(input.generationMode === "custom" ? { customGeneration: true } : {}),
    messages,
    });
  };
}

function businessProfile(input: GenerationInput) {
  const { businessName, businessType, city, services, difference, tone, phone, email, address, openingHours } = input;
  return businessSchema.parse({ businessName, businessType, city, services, difference, tone, phone, email, address, openingHours });
}

async function buildSelectedPage(spec: RetrySpec, call: SiteToolCall, trace: { generationId: string; requestId: string; contract: string },
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], assetSiteId: string, emit: (event: GenerationProgress) => void) {
  const { input, build, theme, menu } = spec;
  const { page } = build;
  const brief = selectedPageBriefs(input).find(({ slug }) => slug === page.slug);
  const label = brief?.label ?? defaultMenuLabel(page.slug);
  const warnings = new Set<string>();
  const business = businessProfile(input);
  let content: { type: string; props: Record<string, unknown> }[];
  if (build.mode === "custom") {
    content = await writeCustomPage(call, input, trace, build.plan, build.page, label, emit, warnings);
  } else {
    const { slots, schema, task, tool } = pageFillContract(build.page);
    const parsed = await fillPage(call, tool, schema, `${task}\nPAGE PURPOSE: ${JSON.stringify(brief?.purpose ?? "")}\nBUSINESS DATA:\n${JSON.stringify({
      ...business, description: input.description, styleDirection: input.styleDirection, designDescription: input.designDescription,
      sitePages: menu,
    })}`);
    if (!parsed.success) throw new SiteGenerationError(`Page ${label} failed validation after repair.`);
    content = slots.map(({ key, designId, imageField }) => {
      const item = defaultSection(designId);
      if (imageField) item.props[imageField] = "";
      item.props = { ...item.props, ...parsed.data.sections[key] };
      return item;
    });
  }
  const nav = { type: "Navigation", props: {
    ...puckConfig.components.Navigation.defaultProps, id: `Navigation-${crypto.randomUUID()}`, businessName: input.businessName,
    links: pageMenuLinks(menu), buttonLink: menu.some(({ slug }) => slug === "contact") ? "/contact"
      : content.some(({ type }) => type === "ContactForm") ? "#contact" : "",
  } };
  const resolve = createPhotoResolver(warnings, { supabase, accountId: input.accountId, siteId: assetSiteId });
  for (const section of content) section.props.photoCredits = await fillSectionPhotos(section.type, section.props, resolve);
  const seo = page.seo ?? fallbackPageSeo(label, input.businessName);
  const draft = sanitizePuckData({
    root: { props: { title: page.title, seoTitle: seo.title.trim(), description: seo.description.trim() } },
    content: [nav, ...content],
  });
  const review = reviewGeneratedPage(draft.content, { pages: menu, slug: page.slug, business, theme });
  if (review.content.filter(({ type }) => type !== "Navigation").length < 2 || !draft.root.props.seoTitle || !draft.root.props.description) {
    throw new SiteGenerationError(`${label} did not pass the final page checks.`);
  }
  return { ...draft, content: review.content, root: { props: { ...draft.root.props, generationWarnings: [...review.notes, ...warnings] } } };
}

const savedPagesSchema = z.array(z.object({
  slug: z.string(), pageId: z.uuid().nullable(), built: z.boolean(), conflict: z.boolean().optional(),
  retryId: z.uuid().nullish(),
}));

export async function buildGeneratedSite(
  raw: unknown, emit: (event: GenerationProgress) => void = () => {}, requestId: string = crypto.randomUUID(),
): Promise<GenerationResult> {
  const input = createGenerationInputSchema(brand.marketingSiteSubdomain, true).parse(raw);
  const { supabase, userId, isAdmin, existingTheme } = await authorize(input);
  const existing = input.siteId ? await supabase.from("pages").select("id, slug, title, nav_label, draft_data, published_data")
    .eq("site_id", input.siteId).order("sort_order") : null;
  if (existing?.error) throw new SiteGenerationError("Could not check the existing pages.");
  const current = existing?.data ?? [];
  if (!input.confirmReplace && current.some((page) => input.desiredPages.includes(page.slug) &&
    (!isEmptyPage(page.draft_data) || (page.published_data && !isEmptyPage(page.published_data))))) {
    throw new SiteGenerationError("Confirm that the selected drafts with content can be replaced.");
  }
  if (current.some((page) => input.pageDetails?.some(({ slug }) => slug === page.slug))) {
    throw new SiteGenerationError("A custom page address is already in use.");
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new SiteGenerationError("AI is not configured. Ask your agency to enable it.");
  let generationId: string;
  try { generationId = await beginSiteGeneration(input.accountId, input.siteId, input.desiredPages.length); }
  catch (cause) {
    throw new SiteGenerationError(cause instanceof Error ? cause.message : "Could not reserve a site generation.");
  }
  const trace = { requestId, generationId, contract: CUSTOM_LAYOUT_CONTRACT };
  const warnings = new Set<string>();
  const business = JSON.stringify({
    businessName: input.businessName, businessType: input.businessType, city: input.city, services: input.services,
    difference: input.difference, style: input.style, primaryColor: input.primaryColor, secondaryColor: input.secondaryColor,
    phone: input.phone, email: input.email, address: input.address, tone: input.tone,
    openingHours: input.openingHours, description: input.description,
    generationMode: input.generationMode, styleDirection: input.styleDirection, fontDirection: input.fontDirection,
    designDescription: input.designDescription, desiredPages: input.desiredPages, desiredSections: input.desiredSections,
  });
  const call = providerCall(input, generationId, requestId);
  const prompt = (task: string) => `${task}\nBUSINESS DATA:\n${business}`;
  try {
    emit({ message: "Planning your site…" });
    let planPages: BuildPage[];
    let planStyle: "classic" | "modern";
    let planColors: SitePlan["colors"];
    let planFonts: SitePlan["fonts"];
    const customPlan = input.generationMode === "custom" ? await planCustomSite(call, input, trace) : undefined;
    if (customPlan) {
      planPages = customPlan.pages.map((page) => ({ mode: "custom", page, plan: customPlan }));
      planStyle = customPlan.style;
      planColors = customPlan.colors;
      planFonts = customPlan.fonts;
      if (customPlan.contrastAdjusted) warnings.add("Theme text color was adjusted to meet WCAG AA contrast.");
    } else {
      const validator = planValidator(input);
      const task = `Plan the selected pages for this site, each with its own seo title and description. Use the user's desired section types on the most appropriate page.\nDESIGN PREFERENCES:\n${JSON.stringify({
        styleDirection: input.styleDirection, fontDirection: input.fontDirection, designDescription: input.designDescription,
        desiredPages: selectedPageBriefs(input), desiredSections: input.desiredSections,
      })}`;
      let { result } = await runSiteTool(call, PLAN_SITE_TOOL, validator, [{ role: "user", content: prompt(task) }]);
      if (!result.success) {
        ({ result } = await runSiteTool(call, PLAN_SITE_TOOL, validator, [{
          role: "user", content: prompt(`Repair the site plan. Correct these validation errors:\n${validationMessage(result.error)}`),
        }], true));
      }
      if (!result.success) throw new SiteGenerationError("The site plan was invalid twice. No drafts were changed. Please contact your agency.");
      const proposed = result.data;
      planPages = normalizeSelectedPages(input, proposed.pages, ({ slug, label }) => ({ slug, title: label, sections: [] }))
        .map((page) => ({ mode: "catalog", page: { ...page,
          seo: page.seo ?? (slugSeoKey(page.slug) ? proposed.seo?.[slugSeoKey(page.slug)!] : undefined)
            ?? fallbackPageSeo(page.title, input.businessName),
          sections: catalogPageSections(proposed.style, page.sections, requestedSectionsForPage(input, page.slug),
            input.desiredPages.filter((slug) => slug !== page.slug).flatMap((slug) => requestedSectionsForPage(input, slug))),
        } }));
      planStyle = result.data.style;
      planColors = result.data.colors;
      planFonts = result.data.fonts;
    }
    const briefs = selectedPageBriefs(input);
    const menuPages = [...briefs.map(({ slug, label }) => ({
      slug, nav_label: current.find((page) => page.slug === slug)?.nav_label
        ?? menuLabelSchema.safeParse(label.split(/\s+/).slice(0, 2).join(" ").slice(0, 40)).data ?? defaultMenuLabel(slug),
    })), ...current.filter(({ slug }) => !input.desiredPages.includes(slug)).map(({ slug, nav_label }) => ({ slug, nav_label }))];
    if (input.primaryColor) planColors.primary = input.primaryColor;
    if (input.secondaryColor) planColors.secondary = input.secondaryColor;
    const assetSiteId = input.siteId ?? crypto.randomUUID();
    const theme = existingTheme ?? { style: planStyle, colors: planColors, headingFont: planFonts.heading, bodyFont: planFonts.body };
    const writes: {
      slug: string; title: string; label: string; nav_label: string; expectedId?: string; expectedDraft: unknown;
      data: Awaited<ReturnType<typeof buildSelectedPage>> | null; spec: RetrySpec;
    }[] = [];
    for (const build of planPages) {
      const { slug, title } = build.page;
      const label = briefs.find((brief) => brief.slug === slug)!.label;
      const menu = menuPages.map(({ slug, nav_label }) => ({ slug, nav_label: nav_label ?? defaultMenuLabel(slug) }));
      if (build.mode === "custom" && existingTheme) {
        build.plan = { ...build.plan, colors: { ...DEFAULT_COLORS, ...existingTheme.colors } };
      }
      const spec = { input, build, theme, menu };
      let data: Awaited<ReturnType<typeof buildSelectedPage>> | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        emit({ message: `${attempt ? "Retrying" : "Writing"} ${label}…` });
        try {
          data = await buildSelectedPage(spec, call, trace, supabase, assetSiteId, emit);
          data.root.props.generationWarnings.forEach((note) => warnings.add(note));
          break;
        } catch (error) {
          console.warn("AI selected page attempt failed", { requestId, generationId, slug, attempt: attempt + 1,
            type: error instanceof Error ? error.name : "Unknown" });
        }
      }
      emit({ message: data ? `Writing ${label}… ✓` : `${label}: Not built — retry` });
      const previous = current.find((page) => page.slug === slug);
      writes.push({ slug, title, label, nav_label: menu.find((page) => page.slug === slug)!.nav_label,
        expectedId: previous?.id, expectedDraft: previous?.draft_data, data, spec });
    }
    const payload = writes.map(({ slug, title, nav_label, expectedId, expectedDraft, data, spec }) =>
      ({ slug, title, nav_label, expectedId, expectedDraft, data, ...(data ? {} : { retrySpec: spec }) }));
    emit({ message: "Saving unpublished drafts…" });
    if (!input.siteId && !isAdmin) throw new SiteGenerationError("Only the agency can create a site.");
    if (input.siteId) await stageSelectedGeneration(input.accountId, assetSiteId, generationId, payload);
    const saved = input.siteId
      ? await supabase.rpc("save_selected_ai_drafts", { p_generation_id: generationId })
      : await createAdminClient().rpc("create_selected_ai_site", {
        p_account_id: input.accountId, p_name: input.businessName, p_subdomain: input.subdomain!,
        p_theme: theme, p_pages: payload, p_business: businessProfile(input), p_site_id: assetSiteId,
        p_generation_id: generationId, p_user_id: userId,
      });
    if (saved.error) throw new SiteGenerationError("Could not save the selected drafts. Check your drafts before retrying.");
    const rows = savedPagesSchema.parse(saved.data);
    const pages: GenerationOutcome[] = rows.map((row) => ({
      slug: row.slug, label: writes.find(({ slug }) => slug === row.slug)!.label, built: row.built,
      pageId: row.pageId ?? undefined, retryId: row.retryId ?? undefined,
    }));
    const pageId = pages.find((page) => page.built)?.pageId ?? pages.find((page) => page.pageId)?.pageId;
    if (!pageId) throw new SiteGenerationError("Selected drafts changed while generating. No drafts were overwritten.");
    return { siteId: assetSiteId, pageId, warnings: [...warnings], pages };
  } catch (cause) {
    try { await finishSiteGeneration(generationId, false); }
    catch (accountingError) {
      console.error("AI generation finalization failed", { requestId, generationId });
      throw accountingError;
    }

    if (cause instanceof SiteGenerationError) throw cause;
    if (cause instanceof CustomSiteError) throw new SiteGenerationError(cause.message, isAdmin ? cause.issues : undefined);
    console.error("AI site generation failed", { requestId, generationId });
    const message = `Generation stopped. Check your drafts and contact your agency with reference ${generationId} before retrying.`;
    if (cause instanceof AiProviderError) throw new AiProviderError(message, cause.details);
    throw new SiteGenerationError(message);
  }
}

function slugSeoKey(slug: string): "home" | "about" | "services" | "contact" | undefined {
      return slug === "" ? "home" : slug === "about" || slug === "services" || slug === "contact" ? slug : undefined;
    }

    export async function retryGeneratedPage(rawId: unknown, emit: (event: GenerationProgress) => void, requestId: string): Promise<GenerationOutcome> {
      const retryId = z.uuid().parse(rawId);
      const { supabase } = await requireUser();
      const job = await claimPageRetry(retryId).catch((cause) => {
        throw new SiteGenerationError(cause instanceof Error ? cause.message : "This retry is not available.");
      });
      const spec = job.spec as RetrySpec;
      const { build, theme, menu } = spec;
      const input = { ...spec.input, accountId: job.accountId, siteId: job.siteId };
      const label = selectedPageBriefs(input).find(({ slug }) => slug === job.slug)?.label ?? defaultMenuLabel(job.slug);
      const trace = { requestId, generationId: job.leaseId, contract: CUSTOM_LAYOUT_CONTRACT };
      let data: Awaited<ReturnType<typeof buildSelectedPage>> | undefined;
      try {
        if (build.page.slug !== job.slug) throw new Error("Page address changed.");
        emit({ message: `Writing ${label}…` });
        data = await buildSelectedPage({ input, build, theme, menu }, providerCall(input, job.leaseId, requestId), trace, supabase, job.siteId, emit);
      } catch (error) {
        console.warn("AI page retry failed", { requestId, pageId: job.pageId, type: error instanceof Error ? error.name : "Unknown" });
      }
      const built = await finishPageRetry(retryId, job.leaseId, data);
      return { slug: job.slug, label, pageId: job.pageId, built, retryId: built ? undefined : retryId };
    }
