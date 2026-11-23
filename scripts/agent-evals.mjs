// Runs the AI agent against a fixture site and checks that what it stages is
// valid and keeps the agent's rules (no invented facts, AA contrast).
//
//   node scripts/agent-evals.mjs --dry-run        check the harness; no provider request
//   node scripts/agent-evals.mjs                  all ten requests against Anthropic (uses ANTHROPIC_API_KEY)
//   node scripts/agent-evals.mjs --only faq,blog  selected requests
//   node scripts/agent-evals.mjs --verbose        print each step as it happens
//   node scripts/agent-evals.mjs --budget 5       stop spending at 5 USD in total (default 3)
//
// Runs happen in the agent's sandbox: no database is read or written, and no
// images are fetched. Exits with 1 when a request fails its checks.
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
const only = args.includes("--only") ? new Set((args[args.indexOf("--only") + 1] ?? "").split(",").filter(Boolean)) : null;
const budget = args.includes("--budget") ? Number(args[args.indexOf("--budget") + 1]) : 3;
let apiKey;
let vite;
const redact = (value) => (apiKey ? value.replaceAll(apiKey, "[redacted]") : value).replace(/\bsk-ant-[\w-]+/g, "[redacted]");

try {
  try { loadEnvFile(`${root}.env.local`); } catch { /* The key may come from the environment instead. */ }
  apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey && !dryRun) throw new Error("ANTHROPIC_API_KEY is not set; no request sent. Use --dry-run to check the harness.");
  if (!Number.isFinite(budget) || budget <= 0) throw new Error("--budget must be a positive number of US dollars.");

  // Load the app's TypeScript, catalog and test stubs without starting Next.
  const { createServer } = await import("vite");
  vite = await createServer({ root, configFile: `${root}vitest.config.ts`, logLevel: "error", server: { middlewareMode: true, ws: false, watch: null } });
  const { DRY_RUN_SCRIPT, EVAL_CASES, runEval, scriptedModel } = await vite.ssrLoadModule("/test/evals/agent-evals.ts");
  const { formatAiCost } = await vite.ssrLoadModule("/lib/ai/cost-format.ts");

  // The scripted edit cannot satisfy the requests, so a dry run judges only the rules every run must keep.
  const cases = EVAL_CASES.filter((entry) => !only || only.has(entry.id))
    .map((entry) => dryRun ? { ...entry, verify: () => null } : entry);
  if (!cases.length) throw new Error(`No eval matches --only. Choose from: ${EVAL_CASES.map((entry) => entry.id).join(", ")}.`);
  const sdk = dryRun ? null : new Anthropic({ apiKey, baseURL: "https://api.anthropic.com", maxRetries: 0, timeout: 120_000 });
  const live = (params, { signal, onText }) => {
    const stream = sdk.messages.stream(params, { signal });
    stream.on("text", onText);
    return stream.finalMessage();
  };

  console.log(dryRun
    ? "Dry run: a scripted model makes one small edit per request. This checks the harness, not the requests.\n"
    : `Running ${cases.length} request(s) against Anthropic, spending at most ${formatAiCost(budget)}.\n`);
  const results = [];
  let spent = 0;
  for (const entry of cases) {
    if (spent >= budget) {
      console.log(`${entry.id}: skipped, the budget of ${formatAiCost(budget)} is spent.`);
      continue;
    }
    process.stdout.write(`${entry.id}: ${entry.request.split("\n")[0]}\n`);
    const result = await runEval(entry, dryRun ? scriptedModel(DRY_RUN_SCRIPT) : live, {
      // One request may use at most a quarter of the budget, and never more than what is left.
      maxCostUsd: Math.min(budget / 4, budget - spent),
      onEvent: (event) => {
        if (!verbose) return;
        if (event.type === "step") console.log(`    · ${event.name}`);
        if (event.type === "tool_error") console.log(`    ! ${event.name}: ${String(event.message).slice(0, 200)}`);
        if (event.type === "plan") console.log(`    plan: ${(event.steps ?? []).join(" | ").slice(0, 300)}`);
        if (event.type === "question") console.log(`    question: ${String(event.question).slice(0, 200)}`);
      },
    });
    results.push(result);
    spent += result.costUsd;
    const { inputTokens, outputTokens, cacheReadTokens, cacheWrite5mTokens, cacheWrite1hTokens } = result.tokens;
    const tokens = inputTokens + outputTokens + cacheReadTokens + cacheWrite5mTokens + cacheWrite1hTokens;
    console.log(`  ${result.passed ? "PASS" : "FAIL"} · ${result.steps} steps, ${result.toolErrors} tool errors, ${result.changes} changes`
      + (dryRun ? "" : ` · ${tokens.toLocaleString("en-US")} tokens · ${formatAiCost(result.costUsd, true)}`));
    for (const failure of result.failures) console.log(`    ✗ ${redact(failure)}`);
    for (const note of result.notes) console.log(`    – ${note}`);
  }

  const failed = results.filter((result) => !result.passed);
  const skipped = cases.length - results.length;
  console.log(dryRun
    ? `\nHarness ${failed.length ? "FAILED" : "OK"}: ${results.length - failed.length}/${results.length} scripted runs completed and kept the rules.`
    : `\n${results.length - failed.length}/${results.length} passed${skipped ? `, ${skipped} skipped` : ""} · total ${formatAiCost(spent, true)}`);
  process.exitCode = failed.length || skipped ? 1 : 0;
} catch (cause) {
  console.error(redact(cause instanceof Error ? cause.message : "Agent evals failed."));
  process.exitCode = 1;
} finally {
  await vite?.close();
}
