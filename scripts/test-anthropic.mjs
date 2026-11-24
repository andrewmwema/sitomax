import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { SITE_GENERATION_MODEL } from "../lib/ai/models.ts";
import { createEvalRecorder } from "./eval-accounting.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = new Set(process.argv.slice(2));
const generation = args.has("--generation");
const custom = args.has("--custom");
const curated = args.has("--curated");
const dryRun = args.has("--dry-run");
let apiKey;
let vite;
const redact = (value) => (apiKey ? value.replaceAll(apiKey, "[redacted]") : value).replace(/\bsk-ant-[\w-]+/g, "[redacted]");
try {
  if (existsSync(`${root}.env.local`)) loadEnvFile(`${root}.env.local`);
  apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey && !dryRun) throw new Error("ANTHROPIC_API_KEY is not set; no request sent.");
  const { createServer } = await import("vite");
  vite = await createServer({ root, configFile: `${root}vitest.config.ts`, logLevel: "error", server: { middlewareMode: true, ws: false, watch: null } });
  const { messageUsage } = await vite.ssrLoadModule("/lib/ai/agent-cost.ts");
  const { calculateCostUsd } = await vite.ssrLoadModule("/lib/ai/pricing.ts");
  const record = dryRun ? null : await createEvalRecorder({ calculateCostUsd, messageUsage });
  const sdk = dryRun ? null : new Anthropic({
    apiKey, baseURL: "https://api.anthropic.com", maxRetries: 0, timeout: 120_000,
  });
  const create = async (params) => {
    const response = await sdk.messages.create(params);
    await record(response);
    return response;
  };
  if (!generation && !custom && !curated) {
    const params = { model: SITE_GENERATION_MODEL, max_tokens: 32, thinking: { type: "between_tools" },
      messages: [{ role: "user", content: "Say hi" }] };
    console.log(JSON.stringify(params));
    if (sdk) {
      const { content, model, stop_reason } = await create(params);
      console.log(JSON.stringify({ model, stop_reason, content }, null, 2));
    }
  } else {
    // Load the app's TypeScript, catalog and test stubs without starting Next.
    const { anthropicRequestParams } = await vite.ssrLoadModule("/lib/ai/request-params.ts");
    const { pageFillContract } = await vite.ssrLoadModule("/lib/ai/site-schemas.ts");
    const { fillPage } = await vite.ssrLoadModule("/lib/ai/site-tool.ts");
    const { SITE_SYSTEM_PROMPT } = await vite.ssrLoadModule("/lib/ai/site-prompt.ts");
    const business = JSON.stringify({ businessName: "Example Plumbing", businessType: "Plumber",
      city: "Example City", services: ["Pipe repairs"], style: "modern" });
    const prompt = (task) => `${task}\nBUSINESS DATA:\n${business}`;
    const { CUSTOM_LAYOUT_CONTRACT, customPlanContract, customSiteSectionContract, customSystemPrompt } =
      custom ? await vite.ssrLoadModule("/lib/ai/custom-layout.ts") : {};
    const { customSiteMaxTokens, planCustomSite, writeCustomPage } = custom ? await vite.ssrLoadModule("/lib/ai/custom-site.ts") : {};
    async function send(tool, messages) {
      const params = anthropicRequestParams(SITE_GENERATION_MODEL, {
        maxTokens: custom ? customSiteMaxTokens(tool.name) : tool.name === "plan_site" ? 7000 : 16000,
        system: custom ? customSystemPrompt() : SITE_SYSTEM_PROMPT, cacheTtl: "5m", toolName: tool.name, tools: [tool], messages,
      });
      if (!sdk) {
        console.log(JSON.stringify({ model: params.model, tool: tool.name, strict: tool.strict,
          schemaBytes: Buffer.byteLength(JSON.stringify(tool.input_schema)), maxTokens: params.max_tokens,
          cacheTtl: params.system[0].cache_control.ttl }));
        return;
      }
      return create(params);
    }
    const trace = {
      requestId: crypto.randomUUID(), contract: CUSTOM_LAYOUT_CONTRACT ?? "curated",
      inspect({ attempt, issues, input: raw }) {
        for (const { path, code, message } of issues) {
          const value = path.reduce((current, key) => current && Object.hasOwn(current, key) ? current[key] : undefined, raw);
          console.log(JSON.stringify({ attempt, path, code, message: redact(message), received: redact(JSON.stringify(value) ?? "(missing)").slice(0, 180) }));
        }
      },
    };
    const defaultPages = ["", "about", "services", "contact"];
    if (!custom) {
      // --curated mirrors the reported "SitoMax designs" selection; --generation uses the default pages.
      const input = {
        ...JSON.parse(business), difference: "", style: "auto", styleDirection: "auto", fontDirection: "auto", designDescription: "",
        desiredPages: curated ? ["", "features", "pricing", "portfolio", "about", "contact"] : defaultPages,
        desiredSections: curated ? ["faq", "pricing"] : [], pageDetails: [],
        primaryColor: "", secondaryColor: "", phone: "", email: "", address: "", tone: "", openingHours: "", description: "",
      };
      const { CuratedPlanError, curatedPlanContract, planCuratedSite } = await vite.ssrLoadModule("/lib/ai/curated-plan.ts");
      if (!sdk) {
        await send(curatedPlanContract(input).tool, []);
      } else {
        let plan;
        try { plan = await planCuratedSite(send, input, prompt, trace); }
        catch (error) {
          if (error instanceof CuratedPlanError) console.log(JSON.stringify({ adminIssues: error.issues }));
          throw error;
        }
        for (const page of plan.pages) console.log(`${page.slug || "home"}: ${page.sections.map(({ designId }) => designId).join(", ")}`);
        for (const page of args.has("--plan-only") ? [] : plan.pages) {
          const { tool, task, schema } = pageFillContract(page);
          const filled = await fillPage(send, tool, schema, `${task}\nBUSINESS DATA:\n${JSON.stringify({
            ...JSON.parse(business), sitePages: input.desiredPages.map((slug) => ({ slug })) })}`);
          if (!filled.success) throw new Error(`Page ${page.title} failed validation after repair.`);
          const words = (value) => typeof value === "string" ? value.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length
            : value && typeof value === "object" ? Object.values(value).reduce((sum, item) => sum + words(item), 0) : 0;
          const sections = Object.values(filled.data.sections ?? {});
          console.log(`Validated ${page.slug || "home"}: ${sections.length} sections, ${words(filled.data)} words.`);
          if (args.has("--show")) console.log(JSON.stringify(filled.data, null, 1));
        }
        console.log(`Validated curated ${args.has("--plan-only") ? "plan" : "generation"}: ${input.desiredPages.map((slug) => slug || "home").join(", ")}.`);
      }
    } else {
      const desiredPages = args.has("--home-only") ? [""] : defaultPages;
      const input = {
        ...JSON.parse(business), difference: "", style: "auto", styleDirection: "auto", fontDirection: "auto",
        designDescription: "", desiredPages, desiredSections: args.has("--home-only") ? [] : ["faq", "pricing"],
        primaryColor: "", secondaryColor: "", phone: "", email: "", address: "", tone: "", openingHours: "", description: "",
      };
      if (!sdk) {
        await send(customPlanContract(input).tool, []);
        if (!args.has("--plan-only")) await send(customSiteSectionContract(input).tool, []);
      } else {
        const plan = await planCustomSite(send, input, trace);
        for (const page of args.has("--plan-only") ? [] : plan.pages) {
          const layout = await writeCustomPage(send, input, trace, plan, page, page.slug || "home", () => {});
          console.log(`Validated ${page.slug || "home"}: ${layout.length} sections (${page.sections.map(({ kind }) => kind).join(", ")}).`);
        }
        console.log(`Validated custom ${args.has("--plan-only") ? "plan" : "generation"}: ${desiredPages.map((slug) => slug || "home").join(", ")}.`);
      }
    }
  }
} catch (error) {
  console.error(JSON.stringify({
    status: error instanceof Anthropic.APIError ? error.status ?? null : null,
    error: {
      type: error instanceof Anthropic.APIError ? error.type ?? error.name : error.name,
      message: redact(error instanceof Anthropic.APIError ? error.apiMessage ?? "No provider error message returned." : error.message),
    },
  }, null, 2));
  process.exitCode = 1;
} finally {
  await vite?.close();
}
