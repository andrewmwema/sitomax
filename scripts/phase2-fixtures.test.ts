import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const sqlPairs = (text: string) => [...text.matchAll(/\('([0-9a-f-]{36})'::uuid, '(TEST-PHASE2-[^']+)'/g)]
  .map(([, id, name]) => `${id}:${name}`).sort();

describe("Phase 2 fixture cleanup", () => {
  it("covers every seeded account in both SQL and upload cleanup", () => {
    const fixtures = sqlPairs(read("supabase/seeds/phase2_test_fixtures.sql"));
    const sql = read("supabase/seeds/phase2_test_cleanup.sql");
    const uploads = read("scripts/cleanup-phase2-test-uploads.ts");
    const uploadPairs = [...uploads.matchAll(/\["([0-9a-f-]{36})", "(TEST-PHASE2-[^"]+)"\]/g)]
      .map(([, id, name]) => `${id}:${name}`).sort();
    expect(fixtures.length).toBeGreaterThan(0);
    expect(new Set(fixtures).size).toBe(fixtures.length);
    expect(sqlPairs(sql)).toEqual(fixtures);
    expect(uploadPairs).toEqual(fixtures);
    const deletionIds = sql.match(/fixture_ids constant uuid\[\] := array\[([\s\S]*?)\]::uuid\[\]/)?.[1] ?? "";
    expect([...deletionIds.matchAll(/'([0-9a-f-]{36})'/g)].map(([, id]) => id).sort())
      .toEqual(fixtures.map((entry) => entry.split(":")[0]).sort());
  });
});
