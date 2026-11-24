import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

const fixtureAccounts = [
  ["63000000-0000-4000-8000-000000000001", "TEST-PHASE1-Showcase A"],
  ["63000000-0000-4000-8000-000000000002", "TEST-PHASE1-Showcase B"],
  ["63000000-0000-4000-8000-000000000003", "TEST-PHASE1-Clarity A"],
  ["63000000-0000-4000-8000-000000000004", "TEST-PHASE1-Clarity B"],
  ["63000000-0000-4000-8000-000000000005", "TEST-PHASE1-Studio A"],
  ["63000000-0000-4000-8000-000000000006", "TEST-PHASE1-Studio B"],
] as const;
const fixtureTemplates = new Set(["test-phase1-showcase", "test-phase1-clarity", "test-phase1-studio"]);
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--apply") || args.length > 1) {
  throw new Error("Usage: npx tsx scripts/cleanup-phase1-test-uploads.ts [--apply]");
}
const apply = args.includes("--apply");
if (apply && process.env.PHASE1_TEST_CLEANUP_APPROVED !== "YES") {
  throw new Error("Cleanup is disabled. Obtain approval and set PHASE1_TEST_CLEANUP_APPROVED=YES.");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase URL and service-role key are required.");
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data: accounts, error: accountError } = await supabase.from("accounts")
    .select("id, name, is_internal").in("id", fixtureAccounts.map(([id]) => id));
  if (accountError) throw new Error("Could not verify fixture accounts.", { cause: accountError });
  for (const account of accounts ?? []) {
    const expected = fixtureAccounts.find(([id]) => id === account.id);
    if (!expected || account.name !== expected[1] || account.is_internal) {
      throw new Error("A fixture account no longer has its expected identity.");
    }
  }

  const { data: sites, error: siteError } = await supabase.from("sites")
    .select("id, account_id, name, subdomain, template_key")
    .in("account_id", fixtureAccounts.map(([id]) => id));
  if (siteError) throw new Error("Could not verify fixture sites.", { cause: siteError });
  for (const site of sites ?? []) {
    if (!site.name?.startsWith("TEST-") || !site.subdomain.startsWith("test-")
      || !fixtureTemplates.has(site.template_key ?? "")) {
      throw new Error("A fixture account contains a site without all TEST markers.");
    }
  }

  const bucket = supabase.storage.from("site-assets");
  const paths: string[] = [];
  for (const site of sites ?? []) {
    for (let offset = 0; ; offset += 100) {
      const { data: objects, error } = await bucket.list(site.id, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error("Could not list fixture site uploads.", { cause: error });
      for (const object of objects) {
        if (!object.id || !object.name.startsWith("TEST-") || object.name.includes("/")) {
          throw new Error("A fixture site has an unmarked upload or nested folder; review it manually.");
        }
        paths.push(`${site.id}/${object.name}`);
      }
      if (objects.length < 100) break;
    }
  }

  console.info(`${apply ? "Deleting" : "Would delete"} ${paths.length} TEST-prefixed site uploads.`);
  if (apply && paths.length) {
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await bucket.remove(paths.slice(index, index + 100));
      if (error) throw new Error("Could not remove fixture site uploads.", { cause: error });
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Could not clean up fixture uploads.");
  process.exitCode = 1;
});
