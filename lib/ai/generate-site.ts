import "server-only";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { puckConfig } from "@/lib/puck/config";
import { sanitizePuckData } from "@/lib/richtext";
import { businessSchema } from "@/lib/business";
import { isReservedForAccountSite } from "@/lib/reserved-subdomains";
import { contrastRatio } from "@/lib/theme/presets";
import { CURATED_FONTS } from "@/lib/theme/fonts";
import { requestAi } from "./client";
import { AiProviderError } from "./provider-error";
import { beginSiteGeneration, finishSiteGeneration } from "./usage";
import { createGenerationInputSchema, type GenerationInput, type GenerationProgress, type GenerationResult } from "./site-input";
import { defaultSection, PAGE_SLUGS, pageFillContract, PLAN_SITE_TOOL, planSchema, type SitePlan } from "./site-schemas";
import { fillPage, fillSiteTool, runSiteTool, validationMessage, type SiteToolCall } from "./site-tool";
import { SITE_SYSTEM_PROMPT } from "./site-prompt";
import { createPhotoResolver, fillSectionPhotos } from "./photos";
import {
  buildCustomSections,
  CUSTOM_LAYOUT_CONTRACT,
  customPageContract,
  customPageTask,
  customPlanContract,
  customPlanTask,
  customSystemPrompt,
} from "./custom-layout";
import { brand } from "@/lib/brand";

export class SiteGenerationError extends Error {}

const desiredSectionTerms: Record<GenerationInput["desiredSections"][number], RegExp> = {
  gallery: /gallery|portfolio/i,
  testimonials: /testimonial|review/i,
  faq: /\bfaq\b|question/i,
  pricing: /pricing|price/i,
  team: /\bteam\b|staff/i,
  process: /process|step/i,
  logos: /logo|partner/i,
};

function requireDesiredSections(sections: unknown[], input: GenerationInput, ctx: z.RefinementCtx) {
  const descriptions = sections.map((section) => typeof section === "string" ? section
    : section && typeof section === "object" && "blockType" in section ? String(section.blockType) : "");
  for (const desired of input.desiredSections) if (!descriptions.some((description) => desiredSectionTerms[desired].test(description))) {
    ctx.addIssue({ code: "custom", path: ["pages"], message: `Include the requested ${desired} section.` });
  }
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
  if (input.siteId) {
    const { data: site, error } = await supabase.from("sites").select("id")
      .eq("id", input.siteId).eq("account_id", input.accountId).maybeSingle();
    if (error || !site) throw new SiteGenerationError("This site is unavailable to your account.");
  } else {
    const { data, error } = await supabase.from("sites").select("id").eq("subdomain", input.subdomain!).maybeSingle();
    if (error) throw new SiteGenerationError("Could not check the subdomain.");
    if (data) throw new SiteGenerationError("This subdomain is already in use.");
  }
  return { supabase, user, isAdmin: Boolean(admin) };
}

function planValidator(input: GenerationInput) {
  return planSchema.superRefine((plan, ctx) => {
    if (input.style !== "auto" && plan.style !== input.style) ctx.addIssue({ code: "custom", path: ["style"], message: "Respect the requested style." });
    const slugs = plan.pages.map(({ slug }) => slug);
    if (slugs.length !== input.desiredPages.length || input.desiredPages.some((slug) => !slugs.includes(slug))) {
      ctx.addIssue({ code: "custom", path: ["pages"], message: "Include each requested page exactly once and omit unselected pages." });
    }
    requireDesiredSections(plan.pages.flatMap(({ sections }) => sections), input, ctx);
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
  });
}

export async function buildGeneratedSite(
  raw: unknown, emit: (event: GenerationProgress) => void = () => {}, requestId: string = crypto.randomUUID(),
): Promise<GenerationResult> {
  const input = createGenerationInputSchema(brand.marketingSiteSubdomain, true).parse(raw);
  const { supabase, isAdmin } = await authorize(input);
  if (!process.env.ANTHROPIC_API_KEY) throw new SiteGenerationError("AI is not configured. Ask your agency to enable it.");
  let generationId: string;
  try { generationId = await beginSiteGeneration(input.accountId, input.siteId); }
  catch (cause) {
    throw new SiteGenerationError(cause instanceof Error ? cause.message : "Could not reserve a site generation.");
  }
  const trace = { requestId, generationId, contract: CUSTOM_LAYOUT_CONTRACT };
  function customFailure(outcome: string, stage: string) {
    const message = outcome === "incomplete" ? `The AI response for the ${stage} was incomplete. Try simpler design guidance.`
      : outcome === "refused" ? `The AI could not complete the ${stage} with these instructions. Try rephrasing them.`
        : outcome === "missing_tool" ? `The AI did not return the ${stage} in the expected format. Please try again.`
          : `The AI-generated ${stage} failed validation. Try more focused design guidance.`;
    return new SiteGenerationError(`${message} No drafts were changed.`);
  }
  const warnings = new Set<string>();
  const business = JSON.stringify({
    businessName: input.businessName, businessType: input.businessType, city: input.city, services: input.services,
    difference: input.difference, style: input.style, primaryColor: input.primaryColor, secondaryColor: input.secondaryColor,
    phone: input.phone, email: input.email, address: input.address, tone: input.tone,
    openingHours: input.openingHours, description: input.description,
    generationMode: input.generationMode, styleDirection: input.styleDirection, fontDirection: input.fontDirection,
    designDescription: input.designDescription, desiredPages: input.desiredPages, desiredSections: input.desiredSections,
  });
  const businessProfile = businessSchema.parse({
    businessName: input.businessName, businessType: input.businessType, city: input.city,
    services: input.services, difference: input.difference, tone: input.tone,
    phone: input.phone, email: input.email, address: input.address, openingHours: input.openingHours,
  });
  const call: SiteToolCall = (tool, messages) => requestAi({
      accountId: input.accountId, siteId: input.siteId, action: "generate_site", generationId, correlationId: requestId,
      system: input.generationMode === "custom" ? customSystemPrompt() : SITE_SYSTEM_PROMPT, cacheTtl: "5m",
      tools: [tool], toolName: tool.name,
      maxTokens: tool.name === "plan_site" || tool.name === "plan_custom_site" ? 7000 : 16000,
      messages,
  });
  const prompt = (task: string) => `${task}\nBUSINESS DATA:\n${business}`;
  try {
    emit({ message: "Planning your site…" });
    let planPages: { slug: typeof PAGE_SLUGS[number]; title: string; sections: unknown[]; seo?: SitePlan["seo"]["home"] }[];
    let planStyle: "classic" | "modern";
    let planColors: SitePlan["colors"];
    let planFonts: SitePlan["fonts"];
    let planSeo: SitePlan["seo"] | undefined;
    if (input.generationMode === "custom") {
      const { schema, tool } = customPlanContract(input);
      const task = customPlanTask({
        businessName: input.businessName, businessType: input.businessType, city: input.city, services: input.services,
        difference: input.difference, style: input.style, styleDirection: input.styleDirection, fontDirection: input.fontDirection,
        designDescription: input.designDescription, desiredPages: input.desiredPages, desiredSections: input.desiredSections,
        primaryColor: input.primaryColor, secondaryColor: input.secondaryColor, phone: input.phone, email: input.email,
        address: input.address, tone: input.tone, openingHours: input.openingHours, description: input.description,
      });
      const { result, outcome } = await fillSiteTool(call, tool, schema, task, trace);
      if (!result.success) throw customFailure(outcome, "website plan");
      planPages = result.data.pages;
      planStyle = result.data.style;
      planColors = result.data.colors;
      planFonts = result.data.fonts;
    } else {
      const validator = planValidator(input);
      const task = `Plan the selected pages for this site. Use the user's desired section types where appropriate. Return only the selected pages, with Home required.\nDESIGN PREFERENCES:\n${JSON.stringify({
        styleDirection: input.styleDirection, fontDirection: input.fontDirection, designDescription: input.designDescription,
        desiredPages: input.desiredPages, desiredSections: input.desiredSections,
      })}`;
      let { result } = await runSiteTool(call, PLAN_SITE_TOOL, validator, [{ role: "user", content: prompt(task) }]);
      if (!result.success) {
        ({ result } = await runSiteTool(call, PLAN_SITE_TOOL, validator, [{
          role: "user", content: prompt(`Repair the site plan. Correct these validation errors:\n${validationMessage(result.error)}`),
        }], true));
      }
      if (!result.success) throw new SiteGenerationError("The site plan was invalid twice. No drafts were changed. Please contact your agency.");
      planPages = result.data.pages;
      planStyle = result.data.style;
      planColors = result.data.colors;
      planFonts = result.data.fonts;
      planSeo = result.data.seo;
    }
    planPages.sort((a, b) => PAGE_SLUGS.indexOf(a.slug) - PAGE_SLUGS.indexOf(b.slug));
    if (input.primaryColor) planColors.primary = input.primaryColor;
    if (input.secondaryColor) planColors.secondary = input.secondaryColor;
    const pages = [];
    for (const page of planPages) {
      const label = { "": "Home", about: "About", services: "Services", contact: "Contact" }[page.slug];
      let content: { type: string; props: Record<string, unknown> }[];
      if (input.generationMode === "custom") {
        emit({ message: `Designing ${label}…` });
        const { schema, tool } = customPageContract(page.slug, page.sections.length, input);
        const { result: parsed, outcome } = await fillSiteTool(call, tool, schema, customPageTask(page, {
          businessName: input.businessName, businessType: input.businessType, city: input.city, services: input.services,
          difference: input.difference, tone: input.tone, openingHours: input.openingHours,
          phone: input.phone, email: input.email, address: input.address, description: input.description,
          designDescription: input.designDescription, styleDirection: input.styleDirection, fontDirection: input.fontDirection, desiredPages: input.desiredPages,
        }), { ...trace, page: page.slug || "home" });
        if (!parsed.success) throw customFailure(outcome, `${label} page layout`);
        content = buildCustomSections(parsed.data.sections, planColors);
      } else {
        emit({ message: `Writing ${label}…` });
        const { slots, schema, task, tool } = pageFillContract(page as SitePlan["pages"][number]);
        const parsed = await fillPage(call, tool, schema, prompt(task));
        if (!parsed.success) throw new SiteGenerationError(`Page ${label} failed validation after repair. No drafts were changed.`);
        content = slots.map(({ key, designId, imageField }) => {
          const item = defaultSection(designId);
          if (imageField) item.props[imageField] = "";
          item.props = { ...item.props, ...parsed.data.sections[key] };
          return item;
        });
      }
      const seo = page.seo ?? planSeo?.[page.slug || "home"];
      if (!seo) throw new SiteGenerationError("A page was missing its search preview. No drafts were changed.");
      const navigation: { type: string; props: Record<string, unknown> } = {
        type: "Navigation",
        props: { ...puckConfig.components.Navigation.defaultProps, id: `Navigation-${crypto.randomUUID()}`,
          businessName: input.businessName, links: planPages.map((entry) => ({ label: entry.title, href: entry.slug ? `/${entry.slug}` : "/" })) },
      };
      pages.push({ slug: page.slug, title: page.title,
        data: { root: { props: { title: seo.title, description: seo.description } }, content: [navigation, ...content] } });
    }
    emit({ message: "Finding photos…" });
    const assetSiteId = input.siteId ?? crypto.randomUUID();
    const resolve = createPhotoResolver(warnings, { supabase, accountId: input.accountId, siteId: assetSiteId });
    const enrichedPages = [];
    for (const page of pages) {
      for (const section of page.data.content) if (section.type !== "Navigation") {
        section.props.photoCredits = await fillSectionPhotos(section.type, section.props, resolve);
      }
      enrichedPages.push({ ...page, data: sanitizePuckData({
        ...page.data, root: { props: { ...page.data.root.props, generationWarnings: [...warnings] } },
      }) });
    }
    for (const page of enrichedPages) page.data.root.props.generationWarnings = [...warnings];
    const theme = { style: planStyle, colors: planColors, headingFont: planFonts.heading, bodyFont: planFonts.body };
    emit({ message: "Saving unpublished drafts…" });
    let siteId = input.siteId;
    let pageId: string;
    if (siteId) {
      const { data, error } = await supabase.rpc("replace_ai_site_drafts_with_business", { p_site_id: siteId, p_theme: theme, p_pages: enrichedPages, p_business: businessProfile });
      if (error) throw new SiteGenerationError("Could not confirm the draft save. Check your drafts and contact your agency before retrying.");
      pageId = z.uuid().parse(data);
    } else {
      if (!isAdmin) throw new SiteGenerationError("Only the agency can create a site.");
      const { data, error } = await createAdminClient().rpc("create_ai_site_with_business", {
        p_account_id: input.accountId, p_name: input.businessName, p_subdomain: input.subdomain!,
        p_theme: theme, p_pages: enrichedPages, p_business: businessProfile, p_site_id: assetSiteId,
      });
      if (error) throw new SiteGenerationError(error.code === "23505" ? "This subdomain was just taken. No site was saved; contact your agency before retrying." : "Could not save the generated site. Contact your agency before retrying.");
      const saved = z.array(z.object({ site_id: z.uuid(), page_id: z.uuid() })).length(1).parse(data)[0];
      siteId = saved.site_id;
      pageId = saved.page_id;
    }
    await finishSiteGeneration(generationId, true, siteId);
    return { siteId, pageId, warnings: [...warnings] };
  } catch (cause) {
    try { await finishSiteGeneration(generationId, false); }
    catch (accountingError) {
      console.error("AI generation finalization failed", { requestId, generationId });
      throw accountingError;
    }
    if (cause instanceof SiteGenerationError) throw cause;
    // Log a reference, never prompts, business information or provider errors.
    console.error("AI site generation failed", { requestId, generationId });
    const message = `Generation stopped. Check your drafts and contact your agency with reference ${generationId} before retrying.`;
    if (cause instanceof AiProviderError) {
      throw new AiProviderError(input.generationMode === "custom" && (cause.details.status === 429 || (cause.details.status ?? 0) >= 500)
        ? "The AI service is temporarily unavailable. No drafts were changed."
        : message, cause.details);
    }
    throw new SiteGenerationError(message);
  }
}
