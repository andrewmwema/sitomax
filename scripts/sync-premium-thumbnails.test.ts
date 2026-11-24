import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

type Row = { id: string; preview_image: string; updated_at: string };
const timestamp = "2026-01-01T00:00:00.000Z";
let server: Server | undefined;

async function fixture() {
  const rows: Row[] = ["showcase", "clarity", "studio"].map((id) => ({
    id, preview_image: `https://old.invalid/${id}`, updated_at: timestamp,
  }));
  const objects = new Map<string, Buffer>();
  const writes: string[] = [];
  const updates: { id: string | null; fields: string[] }[] = [];
  const control = { changeBeforeUpdate: "" };
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    if (path === "/rest/v1/site_templates" && req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(rows));
      return;
    }
    if (path === "/rest/v1/site_templates" && req.method === "PATCH") {
      writes.push(`PATCH ${path}`);
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const update = JSON.parse(Buffer.concat(chunks).toString()) as Partial<Row>;
      updates.push({ id: url.searchParams.get("id"), fields: Object.keys(update).sort() });
      if (control.changeBeforeUpdate) {
        const changed = rows.find((item) => item.id === control.changeBeforeUpdate);
        if (changed) changed.updated_at = "2026-02-01T00:00:00.000Z";
        control.changeBeforeUpdate = "";
      }
      const row = rows.find((item) => `eq.${item.id}` === url.searchParams.get("id")
        && `eq.${item.preview_image}` === url.searchParams.get("preview_image")
        && `eq.${item.updated_at}` === url.searchParams.get("updated_at"));
      if (row) Object.assign(row, update);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(row ? [{ id: row.id }] : []));
      return;
    }
    if (path.startsWith("/storage/v1/object/template-assets/")) {
      if (req.method === "GET") {
        const data = objects.get(path);
        if (data) {
          res.setHeader("Content-Type", "image/png");
          res.end(data);
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ statusCode: "404", error: "Not Found", message: "Object not found" }));
        }
        return;
      }
      if (req.method === "POST") {
        writes.push(`POST ${path}`);
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        if (req.headers["x-upsert"] !== "false" || objects.has(path)) {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ message: "Object already exists" }));
          return;
        }
        objects.set(path, Buffer.concat(chunks));
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ Id: path, Key: path }));
        return;
      }
    }
    res.writeHead(500);
    res.end("Unexpected request");
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const run = (args: string[] = [], extra: Record<string, string> = {}) => new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["node_modules/vite-node/vite-node.mjs", "--config", "vitest.config.ts",
      "scripts/sync-premium-thumbnails.ts", ...args], {
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: "local-test",
        PREMIUM_THUMBNAIL_EXPECTED_PROJECT_URL: base, PREMIUM_THUMBNAIL_SYNC_APPROVED: "", ...extra },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
  return { rows, objects, writes, updates, control, run };
}

afterEach(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  server = undefined;
});

describe("premium thumbnail sync", () => {
  it("is read-only by default and requires explicit approval for writes", async () => {
    const { run, writes } = await fixture();
    expect(await run()).toMatchObject({ code: 0, output: expect.stringContaining("Dry run only") });
    expect(await run(["--apply"])).toMatchObject({ code: 1, output: expect.stringContaining("Obtain explicit approval") });
    expect(await run(["--apply"], { PREMIUM_THUMBNAIL_SYNC_APPROVED: "YES", PREMIUM_THUMBNAIL_EXPECTED_PROJECT_URL: "https://wrong.invalid" }))
      .toMatchObject({ code: 1, output: expect.stringContaining("matching expected project URL") });
    expect(writes).toEqual([]);
  }, 30000);

  it("uploads only new thumbnails and updates only the three preview fields, idempotently", async () => {
    const { run, rows, objects, writes, updates } = await fixture();
    const approval = { PREMIUM_THUMBNAIL_SYNC_APPROVED: "YES" };
    expect(await run(["--apply"], approval)).toMatchObject({ code: 0 });
    expect(objects.size).toBe(3);
    expect(writes.filter((write) => write.startsWith("POST "))).toHaveLength(3);
    expect(writes.filter((write) => write.startsWith("PATCH "))).toHaveLength(3);
    expect(updates).toEqual(["showcase", "clarity", "studio"].map((id) => ({
      id: `eq.${id}`, fields: ["preview_image", "updated_at"],
    })));
    for (const row of rows) expect(row.preview_image).toContain(`/template-assets/masters/${row.id}/${row.id}-thumbnail-`);
    writes.length = 0;
    expect(await run(["--apply"], approval)).toMatchObject({ code: 0 });
    expect(writes).toEqual([]);
  }, 30000);

  it("refuses an occupied immutable path with different content before any writes", async () => {
    const { run, objects, writes } = await fixture();
    objects.set("/storage/v1/object/template-assets/masters/showcase/showcase-thumbnail-78c37dd57c490761.png", Buffer.from("unexpected"));
    expect(await run(["--apply"], { PREMIUM_THUMBNAIL_SYNC_APPROVED: "YES" }))
      .toMatchObject({ code: 1, output: expect.stringContaining("already contains different bytes") });
    expect(writes).toEqual([]);
  }, 30000);

  it("does not overwrite a master row changed since the preflight read", async () => {
    const { run, rows, control, writes } = await fixture();
    control.changeBeforeUpdate = "showcase";
    expect(await run(["--apply"], { PREMIUM_THUMBNAIL_SYNC_APPROVED: "YES" }))
      .toMatchObject({ code: 1, output: expect.stringContaining("changed concurrently") });
    expect(rows.every((row) => row.preview_image.startsWith("https://old.invalid/"))).toBe(true);
    expect(writes.filter((write) => write.startsWith("PATCH "))).toHaveLength(1);
  }, 30000);
});
