import "server-only";

import { z } from "zod";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import type { Field } from "@puckeditor/core";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { puckConfig } from "@/lib/puck/config";
import { sanitizePuckData } from "@/lib/richtext";
import { businessSchema } from "@/lib/business";
import { isReservedForAccountSite } from "@/lib/reserved-subdomains";
import { contrastRatio } from "@/lib/theme/presets";
import { requestAi } from "./client";
import { AiProviderError } from "./provider-error";
import { beginSiteGeneration, finishSiteGeneration } from "./usage";
import { createGenerationInputSchema, type GenerationInput, type GenerationProgress, type GenerationResult } from "./site-input";
import { aiCatalog, blockFields, defaultSection, PAGE_SLUGS, pageFillContract, PLAN_SITE_TOOL, planSchema } from "./site-schemas";
import { SITE_SYSTEM_PROMPT } from "./site-prompt";
import { createPhotoResolver, fillSectionPhotos } from "./photos";
import { brand } from "@/lib/brand";

export class SiteGenerationError extends Error {}

function toolInput(message: Message, name: string): unknown {
  const tools = message.content.filter((part) => part.type === "tool_use");
  if (message.stop_reason !== "tool_use" || tools.length !== 1 || tools[0].name !== name) return undefined;
  return tools[0].input;
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

function validationMessage(error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n").slice(0, 8000);
}

function planValidator(input: GenerationInput) {
  return planSchema.superRefine((plan, ctx) => {
    if (input.style !== "auto" && plan.style !== input.style) ctx.addIssue({ code: "custom", path: ["style"], message: "Respect the requested style." });
    const bg = plan.colors.background, fg = plan.colors.text;
    if (contrastRatio(bg, fg) < 4.5) ctx.addIssue({ code: "custom", path: ["colors"], message: "Body text/background contrast must be at least 4.5:1." });
  });
}

/** Keep the preset's layout, replacing unverifiable sample copy with placeholders. */
export function safeDefaultSection(designId: string) {
  const item = defaultSection(designId);
  const walk = (props: Record<string, unknown>, fields: Record<string, Field>) => {
    for (const [key, field] of Object.entries(fields)) {
      const value = props[key];
      if (["text", "textarea", "richtext"].includes(field.type) && typeof value === "string") {
        props[key] = /(?:link|href)$/i.test(key) ? "/contact" : value ? `[Add ${field.label || key}]` : "";
      } else if (field.type === "custom" && key !== "design") props[key] = "";
      else if (field.type === "array" && Array.isArray(value)) {
        for (const entry of value) if (entry && typeof entry === "object") walk(entry, field.arrayFields as Record<string, Field>);
      } else if (field.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
        walk(value as Record<string, unknown>, field.objectFields as Record<string, Field>);
      }
    }
  };
  walk(item.props, blockFields(item.type));
  return item;
}

export async function buildGeneratedSite(
  raw: unknown, emit: (event: GenerationProgress) => void = () => {},
): Promise<GenerationResult> {
  const input = createGenerationInputSchema(brand.marketingSiteSubdomain, true).parse(raw);
  const { supabase, isAdmin } = await authorize(input);
  if (!process.env.ANTHROPIC_API_KEY) throw new SiteGenerationError("AI is not configured. Ask your agency to enable it.");
  let generationId: string;
  try { generationId = await beginSiteGeneration(input.accountId, input.siteId); }
  catch (cause) {
    throw new SiteGenerationError(cause instanceof Error ? cause.message : "Could not reserve a site generation.");
  }
  const warnings = new Set<string>();
  const business = JSON.stringify({
    businessName: input.businessName, businessType: input.businessType, city: input.city, services: input.services,
    difference: input.difference, style: input.style, primaryColor: input.primaryColor, secondaryColor: input.secondaryColor,
    phone: input.phone, email: input.email, address: input.address, tone: input.tone,
    openingHours: input.openingHours, description: input.description,
  });
  const businessProfile = businessSchema.parse({
    businessName: input.businessName, businessType: input.businessType, city: input.city,
    services: input.services, difference: input.difference, tone: input.tone,
    phone: input.phone, email: input.email, address: input.address, openingHours: input.openingHours,
  });
  const call = async (tool: typeof PLAN_SITE_TOOL, task: string, errors?: string) => {
    const response = await requestAi({
      accountId: input.accountId, siteId: input.siteId, action: "generate_site", generationId,
      system: SITE_SYSTEM_PROMPT, cacheTtl: "5m",
      tools: [tool], toolName: tool.name,
      maxTokens: tool.name === "plan_site" ? 6000 : 16000,
      messages: [{ role: "user", content: `${task}\nBUSINESS DATA:\n${business}${errors ? `\nThe previous response was invalid. Correct these validation errors:\n${errors}` : ""}` }],
    });
    return toolInput(response, tool.name);
  };
  try {
    emit({ message: "Planning your site…" });
    const validator = planValidator(input);
    let planResult = validator.safeParse(await call(PLAN_SITE_TOOL, "Plan the complete site."));
    if (!planResult.success) planResult = validator.safeParse(await call(PLAN_SITE_TOOL, "Repair the site plan.", validationMessage(planResult.error)));
    if (!planResult.success) throw new SiteGenerationError("The site plan was invalid twice. No drafts were changed. Please contact your agency.");
    const plan = planResult.data;
    plan.pages.sort((a, b) => PAGE_SLUGS.indexOf(a.slug) - PAGE_SLUGS.indexOf(b.slug));
    if (input.primaryColor) plan.colors.primary = input.primaryColor;
    if (input.secondaryColor) plan.colors.secondary = input.secondaryColor;

    const pages = [];
    for (const page of plan.pages) {
      const label = { "": "Home", about: "About", services: "Services", contact: "Contact" }[page.slug];
      emit({ message: `Writing ${label}…` });
      const { slots, schema, task, tool } = pageFillContract(page);
      let rawPage = await call(tool, task);
      let parsed = schema.safeParse(rawPage);
      if (!parsed.success) {
        rawPage = await call(tool, task, validationMessage(parsed.error));
        parsed = schema.safeParse(rawPage);
      }
      const candidates = parsed.success ? parsed.data.sections
        : z.object({ slug: z.literal(page.slug), sections: z.record(z.string(), z.unknown()) }).safeParse(rawPage).data?.sections;
      const content = slots.map(({ key, designId, schema: propsSchema, imageField }) => {
        const result = propsSchema.safeParse(candidates?.[key]);
        if (!result.success) {
          warnings.add(`${page.title}: "${aiCatalog.find((design) => design.id === designId)!.name}" used its default layout with placeholder copy after validation failed twice.`);
          return safeDefaultSection(designId);
        }
        const item = defaultSection(designId);
        if (imageField) item.props[imageField] = "";
        item.props = { ...item.props, ...result.data };
        return item;
      });
      const seo = plan.seo[page.slug || "home"];
      const navigation: { type: string; props: Record<string, unknown> } = {
        type: "Navigation",
        props: { ...puckConfig.components.Navigation.defaultProps, id: `Navigation-${crypto.randomUUID()}`,
          businessName: input.businessName, links: plan.pages.map((entry) => ({ label: entry.title, href: `/${entry.slug}` })) },
      };
      pages.push({ slug: page.slug, title: page.title,
        data: { root: { props: { title: seo.title, description: seo.description } }, content: [navigation, ...content] } });
    }
    emit({ message: "Finding photos…" });
    const resolve = createPhotoResolver(warnings);
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
    const theme = { style: plan.style, colors: plan.colors, headingFont: plan.fonts.heading, bodyFont: plan.fonts.body };
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
        p_theme: theme, p_pages: enrichedPages, p_business: businessProfile,
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
      console.error("AI generation finalization failed", { generationId });
      throw accountingError;
    }
    if (cause instanceof SiteGenerationError) throw cause;
    // Log a reference, never prompts, business information or provider errors.
    console.error("AI site generation failed", { generationId });
    const message = `Generation stopped. Check your drafts and contact your agency with reference ${generationId} before retrying.`;
    if (cause instanceof AiProviderError) throw new AiProviderError(message, cause.details);
    throw new SiteGenerationError(message);
  }
}
