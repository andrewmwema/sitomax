import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

const fixtures = [
  ["64000000-0000-4000-8000-000000000001", "TEST-PHASE2-Showcase-Client"],
  ["64000000-0000-4000-8000-000000000002", "TEST-PHASE2-Showcase-Agency"],
  ["64000000-0000-4000-8000-000000000003", "TEST-PHASE2-Clarity-Client"],
  ["64000000-0000-4000-8000-000000000004", "TEST-PHASE2-Clarity-Agency"],
  ["64000000-0000-4000-8000-000000000005", "TEST-PHASE2-Studio-Client"],
  ["64000000-0000-4000-8000-000000000006", "TEST-PHASE2-Studio-Agency"],
  ["64000000-0000-4000-8000-000000000007", "TEST-PHASE2-Mode2-Client"],
  ["64000000-0000-4000-8000-000000000008", "TEST-PHASE2-Mode2-Agency"],
] as const;
const templates = new Set(["showcase", "clarity", "studio"]);
const args = process.argv.slice(2);
if (args.length > 1 || args.some((arg) => arg !== "--apply")) {
  throw new Error("Usage: npx tsx scripts/cleanup-phase2-test-uploads.ts [--apply]");
}
const apply = args.includes("--apply");
if (apply && process.env.PHASE2_TEST_CLEANUP_APPROVED !== "YES") {
  throw new Error("Obtain separate cleanup approval and set PHASE2_TEST_CLEANUP_APPROVED=YES.");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const expected = process.env.PHASE2_TEST_EXPECTED_PROJECT_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !expected || url !== expected || !key) {
  throw new Error("Set the Supabase URL, matching PHASE2_TEST_EXPECTED_PROJECT_URL, and service-role key.");
}
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data: accounts, error: accountError } = await supabase.from("accounts")
    .select("id, name, is_internal").in("id", fixtures.map(([id]) => id));
  if (accountError) throw new Error("Could not verify fixture accounts.", { cause: accountError });
  for (const account of accounts ?? []) {
    const expectedAccount = fixtures.find(([id]) => id === account.id);
    if (!expectedAccount || account.name !== expectedAccount[1] || account.is_internal) {
      throw new Error("A fixture account no longer has its expected identity.");
    }
  }
  const { data: profiles, error: profileError } = await supabase.from("profiles")
    .select("id, email").in("email", ["support@sitomax.com", "hello@sitomax.com"]);
  if (profileError || profiles?.length !== 2) throw new Error("Could not verify both test profiles.", { cause: profileError });
  for (const profile of profiles) {
    const { data, error } = await supabase.auth.admin.getUserById(profile.id);
    if (error || !data.user?.email || data.user.email.toLowerCase() !== profile.email?.toLowerCase()) {
      throw new Error("A test profile does not match its Auth user.", { cause: error });
    }
  }
  const userIds = new Set(profiles.map(({ id }) => id));
  const { data: members, error: memberError } = await supabase.from("account_members")
    .select("user_id, role").in("account_id", fixtures.map(([id]) => id));
  if (memberError) throw new Error("Could not verify fixture members.", { cause: memberError });
  if (members?.some((member) => !userIds.has(member.user_id) || member.role !== "owner")) {
    throw new Error("A fixture account contains an unexpected member.");
  }
  const { data: sites, error: siteError } = await supabase.from("sites")
    .select("id, name, subdomain, template_key, custom_domain, domain_verified")
    .in("account_id", fixtures.map(([id]) => id));
  if (siteError) throw new Error("Could not verify fixture sites.", { cause: siteError });
  for (const site of sites ?? []) {
    if (!site.name?.startsWith("TEST-") || !site.subdomain.startsWith("test-")
      || !templates.has(site.template_key ?? "") || site.custom_domain || site.domain_verified) {
      throw new Error("A fixture account contains a site without all expected TEST markers.");
    }
  }

  const bucket = supabase.storage.from("site-assets");
  const paths: string[] = [];
  for (const site of sites ?? []) {
    for (let offset = 0; ; offset += 100) {
      const { data: objects, error } = await bucket.list(site.id, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error("Could not list fixture-site uploads.", { cause: error });
      for (const object of objects) {
        if (!object.id || !object.name.startsWith("TEST-") || object.name.includes("/")) {
          throw new Error("A fixture site has an unmarked upload or nested folder; review it manually.");
        }
        paths.push(`${site.id}/${object.name}`);
      }
      if (objects.length < 100) break;
    }
  }
  console.info(`${apply ? "Deleting" : "Would delete"} ${paths.length} TEST-prefixed site uploads:`);
  for (const path of paths) console.info(path);
  if (apply) {
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await bucket.remove(paths.slice(index, index + 100));
      if (error) throw new Error("Could not remove fixture-site uploads.", { cause: error });
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Could not clean up fixture uploads.");
  process.exitCode = 1;
});
