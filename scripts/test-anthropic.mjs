import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { SITE_GENERATION_MODEL } from "../lib/ai/models.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = new Set(process.argv.slice(2));
const generation = args.has("--generation") || args.has("--legacy");
const dryRun = args.has("--dry-run");
const legacy = args.has("--legacy");
let apiKey;
let vite;
try {
  loadEnvFile(`${root}.env.local`);
  apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey && !dryRun) throw new Error("ANTHROPIC_API_KEY is not set; no request sent.");
  const sdk = dryRun ? null : new Anthropic({
    apiKey, baseURL: "https://api.anthropic.com", maxRetries: 0, timeout: 120_000,
  });
  if (!generation) {
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
    const { GENERATION_TOOLS, planSchema, fillSchema } = await vite.ssrLoadModule("/lib/ai/site-schemas.ts");
    const { SITE_SYSTEM_PROMPT } = await vite.ssrLoadModule("/lib/ai/site-prompt.ts");
    const { z } = await import("zod");
    const business = JSON.stringify({ businessName: "Example Plumbing", businessType: "Plumber",
      city: "Example City", services: ["Pipe repairs"], style: "modern" });
    async function send(toolName, task, maxTokens) {
      const content = `${task}\nBUSINESS DATA:\n${business}`;
      const params = anthropicRequestParams(SITE_GENERATION_MODEL, {
        maxTokens, system: SITE_SYSTEM_PROMPT, cacheTtl: "5m", toolName,
        tools: GENERATION_TOOLS, messages: [{ role: "user", content }],
      });
      if (legacy) {
        delete params.thinking;
        params.messages = [{ role: "user", content }];
        params.tool_choice = { type: "tool", name: toolName, disable_parallel_tool_use: true };
        params.tools = GENERATION_TOOLS.map((tool, i) => ({
          ...tool, input_schema: { ...z.toJSONSchema(i === 0 ? planSchema : fillSchema), type: "object" },
        }));
      }
      const headers = { "anthropic-version": "2023-06-01" };
      console.log(JSON.stringify({ ...params, messages: "[omitted]", temperature: "unset", top_p: "unset", headers, betaHeaders: [] }, null, 2));
      if (!sdk) return;
      const result = await sdk.messages.create(params, { headers });
      const calls = result.content.filter((block) => block.type === "tool_use");
      if (result.stop_reason !== "tool_use" || calls.length !== 1 || calls[0].name !== toolName) {
        throw new Error(`Expected exactly one ${toolName} call; received stop_reason=${result.stop_reason}.`);
      }
      console.log(JSON.stringify({ model: result.model, stop_reason: result.stop_reason, tool: toolName, usage: result.usage }));
      return calls[0].input;
    }
    const plan = await send("plan_site", "Plan the complete site.", 6000);
    if (plan && !legacy) {
      const validated = planSchema.parse(plan);
      for (const page of validated.pages) {
        const pageResult = await send("fill_page", `Fill this page in exactly the planned section order:\n${JSON.stringify(page)}`, 16000);
        fillSchema.parse(pageResult);
      }
      console.log("Validated one plan and four generated pages (no database writes).");
    }
  }
} catch (error) {
  const redact = (value) => (apiKey ? value.replaceAll(apiKey, "[redacted]") : value).replace(/\bsk-ant-[\w-]+/g, "[redacted]");
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
