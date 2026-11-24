import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = fileURLToPath(new URL("../", import.meta.url));
const [script, ...args] = process.argv.slice(2);
const scripts = { "agent-evals": "scripts/agent-evals.mjs", "test-anthropic": "scripts/test-anthropic.mjs" };
if (!Object.hasOwn(scripts, script ?? "")) {
  console.error("Usage: npm run agency-token -- agent-evals|test-anthropic [script options]");
  process.exitCode = 1;
} else if (!process.stdin.isTTY) {
  console.error("Agency sign-in requires an interactive terminal.");
  process.exitCode = 1;
} else {
  let supabase;
  let signedIn = false;
  try {
    if (existsSync(`${root}.env.local`)) loadEnvFile(`${root}.env.local`);
    const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } = process.env;
    if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY first.");
    const ask = (label, hidden = false) => new Promise((resolve) => {
      const output = hidden ? new Writable({ write(_chunk, _encoding, callback) { callback(); } }) : process.stderr;
      const input = createInterface({ input: process.stdin, output, terminal: true });
      process.stderr.write(label);
      input.question("", (answer) => { input.close(); if (hidden) process.stderr.write("\n"); resolve(answer); });
      input.on("SIGINT", () => { input.close(); process.stderr.write("\n"); process.exit(130); });
    });
    const email = await ask("Agency email: ");
    const password = await ask("Password: ", true);
    supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error("Sign-in failed.");
    signedIn = true;
    const admin = await supabase.rpc("is_super_admin");
    if (admin.error || admin.data !== true) throw new Error("This user is not an agency super admin.");
    const child = spawn(process.execPath, [scripts[script], ...args], {
      cwd: root, stdio: "inherit", env: { ...process.env, AGENCY_AI_ACCESS_TOKEN: data.session.access_token },
    });
    const status = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve(signal ? 1 : code ?? 1));
    });
    process.exitCode = status;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Agency sign-in failed.");
    process.exitCode = 1;
  } finally {
    if (signedIn) {
      const signedOut = await supabase.auth.signOut({ scope: "local" });
      if (signedOut.error) console.error("Could not revoke the temporary agency session; it will expire normally.");
    }
  }
}
