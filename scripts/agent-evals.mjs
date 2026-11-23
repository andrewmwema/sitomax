// Runs the AI agent against a fixture site and checks that what it stages is
// valid and keeps the agent's rules (no invented facts, AA contrast).
//
//   node scripts/agent-evals.mjs --dry-run        check the harness; no provider request
//   node scripts/agent-evals.mjs                  every request against Anthropic (uses ANTHROPIC_API_KEY)
//   node scripts/agent-evals.mjs --only faq,blog  selected requests
//   node scripts/agent-evals.mjs --verbose        print each step as it happens
//   node scripts/agent-evals.mjs --budget 5       stop spending at 5 USD in total (default 3)
//   node scripts/agent-evals.mjs --costs          print where each request's tokens and money went
//   node scripts/agent-evals.mjs --out run.json   save the results, to compare one run with another
//
// Runs happen in the agent's sandbox: no database is read or written, and no
// images are fetched. Exits with 1 when a request fails its checks.
import { writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
const costs = args.includes("--costs");
const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
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
  const { cacheSummary, describeAgentCost } = await vite.ssrLoadModule("/lib/ai/agent-cost.ts");

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
    console.log(`  ${result.passed ? "PASS" : "FAIL"} · ${result.steps} steps, ${result.toolErrors} tool errors (${result.firstAttemptFailures} first attempts), ${result.changes} changes`
      + (dryRun ? "" : ` · ${tokens.toLocaleString("en-US")} tokens · ${formatAiCost(result.costUsd, true)}`));
    if (!dryRun && (costs || verbose)) {
      for (const line of describeAgentCost(result.cost)) console.log(`    ${line}`);
    }
    if (!dryRun && verbose) {
      // One line per model request: a cache hit shows as tokens read, a miss as tokens written or uncached.
      result.calls.forEach((call, index) => console.log(`    call ${index + 1} ${call.model}: ${call.usage.cacheReadTokens} cache read, `
        + `${call.usage.cacheWrite5mTokens + call.usage.cacheWrite1hTokens} cache written, ${call.usage.inputTokens} uncached, ${call.usage.outputTokens} output · ${formatAiCost(call.costUsd, true)}`));
    }
    for (const failure of result.failures) console.log(`    ✗ ${redact(failure)}`);
    for (const note of result.notes) console.log(`    – ${note}`);
  }

  const failed = results.filter((result) => !result.passed);
  const skipped = cases.length - results.length;
  // A tool call refused on its first attempt costs a step and, in the editor, a wait; this is the number to keep down.
  const refused = results.reduce((total, result) => total + result.firstAttemptFailures, 0);
  console.log(`\nFirst-attempt tool failures: ${refused} in ${results.filter((result) => result.firstAttemptFailures).length} of ${results.length} requests.`);
  if (!dryRun && results.length) {
    // What each kind of request costs: the number the cost targets are set against.
    console.log("\nCost by request type (average, lowest to highest):");
    for (const kind of [...new Set(results.map((result) => result.kind))]) {
      const group = results.filter((result) => result.kind === kind);
      const amounts = group.map((result) => result.costUsd);
      const hitRate = group.reduce((total, result) => total + cacheSummary(result.cost).hitRate, 0) / group.length;
      console.log(`  ${kind.padEnd(8)} ${String(group.length).padStart(2)} requests · ${formatAiCost(amounts.reduce((a, b) => a + b, 0) / group.length, true)} `
        + `(${formatAiCost(Math.min(...amounts), true)} to ${formatAiCost(Math.max(...amounts), true)}) · ${Math.round(hitRate * 100)}% of input from cache`);
    }
  }
  if (out) {
    writeFileSync(out, `${JSON.stringify({ recordedAt: new Date().toISOString(), dryRun, totalUsd: spent, results: results.map((result) => ({
      id: result.id, kind: result.kind, passed: result.passed, failures: result.failures.map(redact), steps: result.steps, toolErrors: result.toolErrors,
      firstAttemptFailures: result.firstAttemptFailures, changes: result.changes, costUsd: result.costUsd, cost: result.cost, calls: result.calls,
    })) }, null, 2)}\n`);
    console.log(`Results saved to ${out}.`);
  }
  console.log(dryRun
    ? `Harness ${failed.length ? "FAILED" : "OK"}: ${results.length - failed.length}/${results.length} scripted runs completed and kept the rules.`
    : `${results.length - failed.length}/${results.length} passed${skipped ? `, ${skipped} skipped` : ""} · total ${formatAiCost(spent, true)}`);
  process.exitCode = failed.length || skipped ? 1 : 0;
} catch (cause) {
  console.error(redact(cause instanceof Error ? cause.message : "Agent evals failed."));
  process.exitCode = 1;
} finally {
  await vite?.close();
}
