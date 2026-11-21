import "server-only";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { puckConfig } from "@/lib/puck/config";
import { sanitizePuckData } from "@/lib/richtext";
import { businessSchema, emptyBusiness } from "@/lib/business";
import { isReservedForAccountSite } from "@/lib/reserved-subdomains";
import { DEFAULT_COLORS, type SiteTheme } from "@/lib/theme/presets";
import { requestAi } from "./client";
import { AiProviderError } from "./provider-error";
import { beginSiteGeneration, checkpointDraft, claimPageRetry, completeDraftCheckpoints, finishPageRetry, finishSiteGeneration, startDraftCheckpoints } from "./usage";
import { createGenerationInputSchema, type GenerationInput, type GenerationOutcome, type GenerationProgress, type GenerationResult } from "./site-input";
import { defaultSection, pageFillContract, type PlannedPage } from "./site-schemas";
import { fillPage, type SiteToolCall } from "./site-tool";
import { CuratedPlanError, planCuratedSite } from "./curated-plan";
import { finalizeCuratedLinks } from "./curated-links";
import { SITE_SYSTEM_PROMPT } from "./site-prompt";
import { createPhotoResolver, fillSectionPhotos } from "./photos";
import { CUSTOM_LAYOUT_CONTRACT, customSystemPrompt } from "./custom-layout";
import { CustomSiteError, customSiteMaxTokens, planCustomSite, writeCustomPage } from "./custom-site";
import { brand } from "@/lib/brand";
import { defaultMenuLabel, menuLabelSchema, pageMenuLinks } from "@/lib/page-navigation";
import { generatedPageIssues, reviewGeneratedPage } from "./site-quality";
import { fallbackPageSeo, selectedPageBriefs } from "./selected-pages";
import { isEmptyPage } from "@/lib/editor/empty-page";
import { themeSchema } from "@/lib/theme/schema";
import { businessDetailsChanged, generationBusiness } from "./site-business";
import { freshFooter, sharedSiteFooter } from "./site-footer";
import type { LayoutItem } from "@/lib/layout/structure";

export class SiteGenerationError extends Error {
  constructor(message: string, readonly validationIssues?: CustomSiteError["issues"] | CuratedPlanError["issues"]) { super(message); }
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
  let expectedBusiness: unknown = null;
  let savedBusiness = emptyBusiness;
  if (input.siteId) {
    const { data: site, error } = await supabase.from("sites").select("id, theme, draft_theme, business")
      .eq("id", input.siteId).eq("account_id", input.accountId).maybeSingle();
    if (error || !site) throw new SiteGenerationError("This site is unavailable to your account.");
    existingTheme = themeSchema.parse(site.draft_theme ?? site.theme ?? {});
    expectedBusiness = site.business ?? null;
    savedBusiness = businessSchema.parse({ ...emptyBusiness, ...site.business });
    if (businessDetailsChanged(input, savedBusiness)) {
      if (!input.confirmBusinessUpdate) throw new SiteGenerationError("Confirm the site-wide Business information update, including live contact details.");
      if (!input.expectedBusiness || JSON.stringify(businessSchema.parse(input.expectedBusiness)) !== JSON.stringify(savedBusiness)) {
        throw new SiteGenerationError("Business information changed. Reload and confirm the latest details before building.");
      }
    }
  } else {
    const { data, error } = await supabase.from("sites").select("id").eq("subdomain", input.subdomain!).maybeSingle();
    if (error) throw new SiteGenerationError("Could not check the subdomain.");
    if (data) throw new SiteGenerationError("This subdomain is already in use.");
  }
  return { supabase, userId: user.id, isAdmin: Boolean(admin), existingTheme, expectedBusiness, savedBusiness };
}

type CustomPlan = Awaited<ReturnType<typeof planCustomSite>>;
type BuildPage =
  | { mode: "custom"; page: CustomPlan["pages"][number]; plan: Pick<CustomPlan, "style" | "colors" | "fonts"> }
  | { mode: "catalog"; page: PlannedPage };
type RetrySpec = { input: GenerationInput; build: BuildPage; theme: SiteTheme; menu: { slug: string; nav_label: string }[]; footer?: LayoutItem };

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

async function buildSelectedPage(spec: RetrySpec, call: SiteToolCall, trace: { generationId: string; requestId: string; contract: string },
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], assetSiteId: string, emit: (event: GenerationProgress) => void, repair = "") {
  const { input, build, theme, menu } = spec;
  const { page } = build;
  const brief = selectedPageBriefs(input).find(({ slug }) => slug === page.slug);
  const label = brief?.label ?? defaultMenuLabel(page.slug);
  const warnings = new Set<string>();
  const business = generationBusiness(input);
  const write: SiteToolCall = (tool, messages) => call(tool, repair
    ? [...messages, { role: "user", content: `The previous page failed acceptance checks. Correct these issues:\n${repair}` }]
    : messages);
  let content: { type: string; props: Record<string, unknown> }[];
  if (build.mode === "custom") {
    content = await writeCustomPage(write, input, trace, build.plan, build.page, label, emit, warnings);
  } else {
    const { slots, schema, task, tool } = pageFillContract(build.page);
    const parsed = await fillPage(write, tool, schema, `${task}\nPAGE PURPOSE: ${JSON.stringify(brief?.purpose ?? "")}\nBUSINESS DATA:\n${JSON.stringify({
      ...business, description: input.description, styleDirection: input.styleDirection, designDescription: input.designDescription,
      sitePages: menu,
    })}`);
    if (!parsed.success) throw new SiteGenerationError(`Page ${label} failed validation after repair.`);
    content = finalizeCuratedLinks(slots.map(({ key, designId, imageField }) => {
      const item = defaultSection(designId);
      if (imageField) item.props[imageField] = "";
      item.props = { ...item.props, ...parsed.data.sections[key] };
      return item;
    }), menu, business);
  }
  if (spec.footer) content = [...content.filter(({ type }) => type !== "Footer"), freshFooter(spec.footer)];
  const nav = { type: "Navigation", props: {
    ...puckConfig.components.Navigation.defaultProps, id: `Navigation-${crypto.randomUUID()}`, businessName: input.businessName,
    links: pageMenuLinks(menu), buttonLink: menu.some(({ slug }) => slug === "contact") ? "/contact"
      : content.some(({ type }) => type === "ContactForm") ? "#contact" : "",
  } };
  const seo = page.seo ?? fallbackPageSeo(label, input.businessName);
  const draft = sanitizePuckData({
    root: { props: { title: page.title, seoTitle: seo.title.trim(), description: seo.description.trim() } },
    content: [nav, ...content],
  });
  const review = reviewGeneratedPage(draft.content, { pages: menu, slug: page.slug, business, theme });
  const issues = generatedPageIssues(review.content);
  if (issues.length || !draft.root.props.seoTitle || !draft.root.props.description) {
    throw new SiteGenerationError(`${label} did not pass the final page checks. ${issues.join(" ")}`);
  }
  const resolve = createPhotoResolver(warnings, { supabase, accountId: input.accountId, siteId: assetSiteId });
  for (const section of review.content) section.props.photoCredits = await fillSectionPhotos(section.type, section.props, resolve);
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
  const { supabase, isAdmin, existingTheme, expectedBusiness, savedBusiness } = await authorize(input);
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
  const deadline = Date.now() + 620_000;
  const call = providerCall(input, generationId, requestId, deadline);
  let checkpointsStarted = false;
  const prompt = (task: string) => `${task}\nBUSINESS DATA:\n${business}`;
  try {
    emit({ message: "Planning your site…" });
    let planPages: BuildPage[];
    let plan: Pick<CustomPlan, "style" | "colors" | "fonts" | "contrastAdjusted">;
    if (input.generationMode === "custom") {
      const customPlan = await planCustomSite(call, input, trace);
      planPages = customPlan.pages.map((page) => ({ mode: "custom", page, plan: customPlan }));
      plan = customPlan;
    } else {
      const curatedPlan = await planCuratedSite(call, input, prompt);
      planPages = curatedPlan.pages.map((page) => ({ mode: "catalog", page }));
      plan = curatedPlan;
    }
    const { style: planStyle, colors: planColors, fonts: planFonts } = plan;
    if (plan.contrastAdjusted) warnings.add("Theme text color was adjusted to meet WCAG AA contrast.");
    const briefs = selectedPageBriefs(input);
    const menuPages = [...briefs.map(({ slug, label }) => ({
      slug, nav_label: current.find((page) => page.slug === slug)?.nav_label
        ?? menuLabelSchema.safeParse(label.split(/\s+/).slice(0, 2).join(" ").slice(0, 40)).data ?? defaultMenuLabel(slug),
    })), ...current.filter(({ slug }) => !input.desiredPages.includes(slug)).map(({ slug, nav_label }) => ({ slug, nav_label }))];
    if (input.primaryColor) planColors.primary = input.primaryColor;
    if (input.secondaryColor) planColors.secondary = input.secondaryColor;
    const assetSiteId = input.siteId ?? crypto.randomUUID();
    const theme = existingTheme ?? { style: planStyle, colors: planColors, headingFont: planFonts.heading, bodyFont: planFonts.body };
    const firstFooter = planPages.flatMap((build) => build.mode === "catalog"
      ? build.page.sections.filter(({ blockType }) => blockType === "Footer") : [])[0];
    const footer = sharedSiteFooter(current, firstFooter ? defaultSection(firstFooter.designId) : undefined);
    const writes = planPages.map((build) => {
      const { slug, title } = build.page;
      const label = briefs.find((brief) => brief.slug === slug)!.label;
      const menu = menuPages.map(({ slug, nav_label }) => ({ slug, nav_label: nav_label ?? defaultMenuLabel(slug) }));
      if (build.mode === "custom" && existingTheme) {
        build.plan = { ...build.plan, colors: { ...DEFAULT_COLORS, ...existingTheme.colors } };
      }
      const spec: RetrySpec = { input, build, theme, menu, footer };
      const previous = current.find((page) => page.slug === slug);
      return { slug, title, label, nav_label: menu.find((page) => page.slug === slug)!.nav_label,
        expectedId: previous?.id, expectedDraft: previous?.draft_data, data: null, retrySpec: spec };
    });
    emit({ message: "Preparing recoverable page drafts…" });
    const rows = savedPagesSchema.parse(await startDraftCheckpoints(input.accountId, assetSiteId, generationId, {
      name: input.businessName, subdomain: input.subdomain, theme, pages: writes,
      business: generationBusiness(input, savedBusiness), expectedBusiness,
    }).catch((cause) => {
      throw new SiteGenerationError(cause instanceof Error ? cause.message : "Could not prepare recoverable page drafts.");
    }));
    checkpointsStarted = true;
    const bodyCall = providerCall({ ...input, siteId: assetSiteId }, generationId, requestId, deadline);
    for (const entry of writes) {
      const { slug, label, retrySpec: spec } = entry;
      const row = rows.find((row) => row.slug === slug);
      if (!row?.retryId || row.conflict) {
        warnings.add(`${label}: the draft changed; no content was overwritten.`);
        continue;
      }
      let data: Awaited<ReturnType<typeof buildSelectedPage>> | null = null;
      let repair = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        emit({ message: `${attempt ? "Retrying" : "Writing"} ${label}…` });
        try {
          data = await buildSelectedPage(spec, bodyCall, trace, supabase, assetSiteId, emit, repair);
          data.root.props.generationWarnings.forEach((note) => warnings.add(note));
          break;
        } catch (error) {
          if (error instanceof SiteGenerationError) repair = error.message;
          if (attempt === 1 && repair) warnings.add(repair);
          console.warn("AI selected page attempt failed", { requestId, generationId, slug, attempt: attempt + 1,
            type: error instanceof Error ? error.name : "Unknown" });
        }
      }
      if (data) {
        row.built = await checkpointDraft(input.accountId, generationId, row.retryId, data);
        row.retryId = null;
        if (!row.built) warnings.add(`${label}: the draft changed during generation; no content was overwritten.`);
      }
      emit({ message: row.built ? `Saved ${label} draft ✓` : `${label}: Not built${row.retryId ? " — retry" : " — draft changed"}` });
    }
    await completeDraftCheckpoints(input.accountId, generationId);
    emit({ message: "Unpublished drafts saved." });
    const pages: GenerationOutcome[] = rows.map((row) => ({
      slug: row.slug, label: writes.find(({ slug }) => slug === row.slug)!.label, built: row.built,
      pageId: row.pageId ?? undefined, retryId: row.retryId ?? undefined,
    }));
    const pageId = pages.find((page) => page.built)?.pageId ?? pages.find((page) => page.pageId)?.pageId;
    if (!pageId) throw new SiteGenerationError("Selected drafts changed while generating. No drafts were overwritten.");
    return { siteId: assetSiteId, pageId, warnings: [...warnings], pages };
  } catch (cause) {
    try {
      if (checkpointsStarted) await completeDraftCheckpoints(input.accountId, generationId);
      else await finishSiteGeneration(generationId, false);
    }
    catch (accountingError) {
      console.error("AI generation finalization failed", { requestId, generationId });
      throw accountingError;
    }

    if (cause instanceof SiteGenerationError) throw cause;
    if (cause instanceof CustomSiteError || cause instanceof CuratedPlanError) {
      throw new SiteGenerationError(cause.message, isAdmin ? cause.issues : undefined);
    }
    console.error("AI site generation failed", { requestId, generationId });
    const message = `Generation stopped. Check your drafts and contact your agency with reference ${generationId} before retrying.`;
    if (cause instanceof AiProviderError) throw new AiProviderError(message, cause.details);
    throw new SiteGenerationError(message);
  }
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
        data = await buildSelectedPage({ ...spec, input, build, theme, menu }, providerCall(input, job.leaseId, requestId), trace, supabase, job.siteId, emit);
      } catch (error) {
        console.warn("AI page retry failed", { requestId, pageId: job.pageId, type: error instanceof Error ? error.name : "Unknown" });
      }
      const built = await finishPageRetry(retryId, job.leaseId, data);
      return { slug: job.slug, label, pageId: job.pageId, built, retryId: built ? undefined : retryId };
    }
