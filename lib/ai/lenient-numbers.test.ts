import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseWithNumbers } from "./lenient-numbers";

const schema = z.strictObject({
  radius: z.number().int().min(0).max(48).optional(),
  label: z.string().optional(),
  columns: z.literal([2, 3, 4]).optional(),
  level: z.union([z.literal(2), z.literal(3)]).optional(),
  size: z.literal(["24", "32"]).optional(),
  spacing: z.strictObject({ desktop: z.strictObject({ paddingTop: z.number() }).optional() }).optional(),
  background: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("none") }),
    z.strictObject({ type: z.literal("gradient"), angle: z.number().int().min(0).max(360) }),
  ]).optional(),
  rows: z.array(z.strictObject({ gap: z.number(), text: z.string() })).optional(),
  either: z.union([z.string().regex(/^#/), z.strictObject({ width: z.number() })]).optional(),
});

describe("numeric strings in model input", () => {
  it("reads numbers written as text or with px wherever a number is expected", () => {
    expect(parseWithNumbers(schema, {
      radius: "14px", columns: "3", level: "2", spacing: { desktop: { paddingTop: " 96 PX " } },
      background: { type: "gradient", angle: "135" }, rows: [{ gap: "24", text: "8px" }, { gap: 8.5, text: "b" }, { gap: "-4.5px", text: "c" }],
      either: { width: "12" },
    })).toEqual({
      radius: 14, columns: 3, level: 2, spacing: { desktop: { paddingTop: 96 } },
      background: { type: "gradient", angle: 135 }, rows: [{ gap: 24, text: "8px" }, { gap: 8.5, text: "b" }, { gap: -4.5, text: "c" }],
      either: { width: 12 },
    });
  });

  it("leaves text fields, text options and the input itself untouched", () => {
    const input = { label: "8px", size: "24", radius: "8" };
    expect(parseWithNumbers(schema, input)).toEqual({ label: "8px", size: "24", radius: 8 });
    expect(input.radius).toBe("8");
  });

  it("still refuses values that are not plain numbers or break the schema's other rules", () => {
    for (const input of [
      { radius: "50%" }, { radius: "1rem" }, { radius: "large" }, { radius: "" }, { radius: "8 16" }, { radius: null }, { radius: true },
      { radius: "99px" }, { radius: "8.5" }, { columns: "5" }, { level: "4" }, { size: 24 }, { unknown: "8" },
    ]) expect(() => parseWithNumbers(schema, input), JSON.stringify(input)).toThrow(z.ZodError);
    // The error names the rule that was broken, not the text form.
    expect(() => parseWithNumbers(schema, { radius: "99px" })).toThrow(/Too big/);
  });
});
