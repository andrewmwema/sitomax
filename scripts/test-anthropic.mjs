import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { SITE_GENERATION_MODEL } from "../lib/ai/models.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = new Set(process.argv.slice(2));
const generation = args.has("--generation");
const custom = args.has("--custom");
const dryRun = args.has("--dry-run");
let apiKey;
let vite;
const redact = (value) => (apiKey ? value.replaceAll(apiKey, "[redacted]") : value).replace(/\bsk-ant-[\w-]+/g, "[redacted]");
try {
  loadEnvFile(`${root}.env.local`);
  apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey && !dryRun) throw new Error("ANTHROPIC_API_KEY is not set; no request sent.");
  const sdk = dryRun ? null : new Anthropic({
    apiKey, baseURL: "https://api.anthropic.com", maxRetries: 0, timeout: 120_000,
  });
  if (!generation && !custom) {
    const params = { model: SITE_GENERATION_MODEL, max_tokens: 32, thinking: { type: "between_tools" },
      messages: [{ role: "user", content: "Say hi" }] };
    console.log(JSON.stringify(params));
    if (sdk) {
      const { content, model, stop_reason } = await sdk.messages.create(params);
      console.log(JSON.stringify({ model, stop_reason, content }, null, 2));
    }
  } else {
    // Load the app's TypeScript, catalog and test stubs without starting Next.
    const { createServer } = await import("vite");
    vite = await createServer({ root, configFile: `${root}vitest.config.ts`, server: { middlewareMode: true, ws: false, watch: null } });
    const { anthropicRequestParams } = await vite.ssrLoadModule("/lib/ai/request-params.ts");
    const { aiCatalog, PAGE_SLUGS, pageFillContract, PLAN_SITE_TOOL, planSchema } = await vite.ssrLoadModule("/lib/ai/site-schemas.ts");
    const { fillPage, runSiteTool } = await vite.ssrLoadModule("/lib/ai/site-tool.ts");
    const { SITE_SYSTEM_PROMPT } = await vite.ssrLoadModule("/lib/ai/site-prompt.ts");
    const business = JSON.stringify({ businessName: "Example Plumbing", businessType: "Plumber",
      city: "Example City", services: ["Pipe repairs"], style: "modern" });
    const prompt = (task) => `${task}\nBUSINESS DATA:\n${business}`;
    const { CUSTOM_LAYOUT_CONTRACT, customPlanContract, customSiteSectionContract, customSystemPrompt } =
      custom ? await vite.ssrLoadModule("/lib/ai/custom-layout.ts") : {};
    const { customSiteMaxTokens, planCustomSite, writeCustomPage } = custom ? await vite.ssrLoadModule("/lib/ai/custom-site.ts") : {};
    async function send(tool, messages) {
      const params = anthropicRequestParams(SITE_GENERATION_MODEL, {
        maxTokens: custom ? customSiteMaxTokens(tool.name) : tool.name === "plan_site" ? 6000 : 16000,
        system: custom ? customSystemPrompt() : SITE_SYSTEM_PROMPT, cacheTtl: "5m", toolName: tool.name, tools: [tool], messages,
      });
      if (!sdk) {
        console.log(JSON.stringify({ model: params.model, tool: tool.name, strict: tool.strict,
          schemaBytes: Buffer.byteLength(JSON.stringify(tool.input_schema)), maxTokens: params.max_tokens,
          cacheTtl: params.system[0].cache_control.ttl }));
        return;
      }
      return sdk.messages.create(params);
    }
    if (custom) {
      const desiredPages = args.has("--home-only") ? [""] : [...PAGE_SLUGS];
      const input = {
        ...JSON.parse(business), difference: "", style: "auto", styleDirection: "auto", fontDirection: "auto",
        designDescription: "", desiredPages, desiredSections: args.has("--home-only") ? [] : ["faq", "pricing"],
        primaryColor: "", secondaryColor: "", phone: "", email: "", address: "", tone: "", openingHours: "", description: "",
      };
      const trace = {
        requestId: crypto.randomUUID(), contract: CUSTOM_LAYOUT_CONTRACT,
        inspect({ attempt, issues, input: raw }) {
          for (const { path, code, message } of issues) {
            const value = path.reduce((current, key) => current && Object.hasOwn(current, key) ? current[key] : undefined, raw);
            console.log(JSON.stringify({ attempt, path, code, message: redact(message), received: redact(JSON.stringify(value) ?? "(missing)").slice(0, 180) }));
          }
        },
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
        console.log(`Validated custom ${args.has("--plan-only") ? "plan" : "generation"}: ${desiredPages.map((slug) => slug || "home").join(", ")} (no database writes).`);
      }
    } else {
      const planMessages = [{ role: "user", content: prompt("Plan the complete site.") }];
      const plan = sdk ? (await runSiteTool(send, PLAN_SITE_TOOL, planSchema, planMessages)).result : null;
      if (plan && !plan.success) throw new Error("Generated plan failed local schema validation.");
      if (!sdk) await send(PLAN_SITE_TOOL, planMessages);
      const pages = plan ? plan.data.pages : PAGE_SLUGS.map((slug) => ({
        slug, title: slug || "Home", sections: ["Hero", "Services", "Footer"].map((blockType) => ({
          blockType, designId: aiCatalog.find((design) => design.blockType === blockType && design.styles.includes("modern")).id,
        })),
      }));
      pages.sort((a, b) => PAGE_SLUGS.indexOf(a.slug) - PAGE_SLUGS.indexOf(b.slug));
      for (const page of pages) {
        const { tool, task, schema } = pageFillContract(page);
        if (!sdk) {
          await send(tool, [{ role: "user", content: prompt(task) }]);
        } else if (!(await fillPage(send, tool, schema, prompt(task))).success) {
          throw new Error(`Page ${page.title} failed validation after repair.`);
        }
      }
      if (sdk) console.log("Validated one plan and four generated pages (no database writes).");
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
