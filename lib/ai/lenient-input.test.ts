import { describe, expect, it } from "vitest";
import { z } from "zod";
import { iconNameSchema } from "@/lib/icons";
import { parseLenient } from "./lenient-input";

const schema = z.strictObject({
  radius: z.number().int().min(0).max(48).optional(),
  label: z.string().optional(),
  columns: z.literal([2, 3, 4]).optional(),
  level: z.union([z.literal(2), z.literal(3)]).optional(),
  size: z.enum(["24", "32"]).optional(),
  heading: z.enum(["h1", "h2", "h3"]).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  variant: z.enum(["primary", "secondary", "ghost"]).optional(),
  sticky: z.boolean().optional(),
  icon: iconNameSchema.optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  spacing: z.strictObject({ desktop: z.strictObject({ paddingTop: z.number() }).optional() }).optional(),
  background: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("none") }),
    z.strictObject({ type: z.literal("gradient"), angle: z.number().int().min(0).max(360) }),
  ]).optional(),
  rows: z.array(z.strictObject({ gap: z.number(), text: z.string() })).optional(),
  tags: z.array(z.string()).optional(),
  either: z.union([z.string().regex(/^#/), z.strictObject({ width: z.number() })]).optional(),
});

describe("lenient parsing of model input", () => {
  it("reads numbers written as text, with px, or in rem, wherever a number is expected", () => {
    expect(parseLenient(schema, {
      radius: "14px", columns: "3", level: "2", spacing: { desktop: { paddingTop: " 96 PX " } },
      background: { type: "gradient", angle: "135" }, rows: [{ gap: "24", text: "8px" }, { gap: 8.5, text: "b" }, { gap: "-4.5px", text: "c" }],
      either: { width: "12" },
    })).toEqual({
      radius: 14, columns: 3, level: 2, spacing: { desktop: { paddingTop: 96 } },
      background: { type: "gradient", angle: 135 }, rows: [{ gap: 24, text: "8px" }, { gap: 8.5, text: "b" }, { gap: -4.5, text: "c" }],
      either: { width: 12 },
    });
    expect(parseLenient(schema, { radius: "1rem", spacing: { desktop: { paddingTop: "0.5rem" } } })).toEqual({ radius: 16, spacing: { desktop: { paddingTop: 8 } } });
  });

  it("reads an option written as a number or in another spelling as the option it means", () => {
    // The reported failure: size 24 for the option "24".
    expect(parseLenient(schema, { size: 24, heading: 2, align: "Center", variant: "outline" }))
      .toEqual({ size: "24", heading: "h2", align: "center", variant: "ghost" });
    expect(parseLenient(schema, { size: "32px", heading: "H3", align: "middle", sticky: "true", label: 8 }))
      .toEqual({ size: "32", heading: "h3", align: "center", sticky: true, label: "8" });
    expect(parseLenient(schema, { size: "24", label: "8px" })).toEqual({ size: "24", label: "8px" });
  });

  it("reads objects and lists written as JSON strings, and one item where a list is expected", () => {
    // The reported failure: props sent as a string holding JSON.
    expect(parseLenient(schema, { props: '{"heading":"Hello","count":2}', rows: '[{"gap":"8","text":"a"}]', tags: "one" }))
      .toEqual({ props: { heading: "Hello", count: 2 }, rows: [{ gap: 8, text: "a" }], tags: ["one"] });
    expect(parseLenient(schema, '{"radius":"8px"}')).toEqual({ radius: 8 });
    expect(() => parseLenient(schema, { props: "not json" })).toThrow(z.ZodError);
    expect(() => parseLenient(schema, { props: "[1,2]" })).toThrow(z.ZodError);
  });

  it("leaves out keys the schema does not know and says so, instead of failing the call", () => {
    const notes: string[] = [];
    // The reported failure: an unrecognized textColor key.
    expect(parseLenient(schema, { radius: 8, textColor: "#ffffff", spacing: { desktop: { paddingTop: 8, gap: 4 } }, rows: [{ gap: 1, text: "a", extra: true }] },
      { notes, label: "design" })).toEqual({ radius: 8, spacing: { desktop: { paddingTop: 8 } }, rows: [{ gap: 1, text: "a" }] });
    expect([...notes].sort()).toEqual([
      "design.rows.0.extra is not a setting here and was ignored.", "design.spacing.desktop.gap is not a setting here and was ignored.",
      "design.textColor is not a setting here and was ignored.",
    ]);
  });

  it("finds the curated icon a model means, and falls back to a neutral one with a note", () => {
    const notes: string[] = [];
    expect(parseLenient(schema, { icon: "ShieldCheck" })).toEqual({ icon: "shield-check" });
    expect(parseLenient(schema, { icon: "check-circle" })).toEqual({ icon: "check" });
    expect(parseLenient(schema, { icon: "calendar-clock" })).toEqual({ icon: "calendar" });
    expect(parseLenient(schema, { icon: "pound-sterling" }, { notes, label: "props" })).toEqual({ icon: "check" });
    expect(notes).toEqual([expect.stringMatching(/^props\.icon: there is no "pound-sterling" icon, so "check" was used\. Available icons: wrench, /)]);
  });

  it("never changes the input, and still refuses what is not plainly something the schema accepts", () => {
    const input = { label: "8px", size: 24, radius: "8" };
    expect(parseLenient(schema, input)).toEqual({ label: "8px", size: "24", radius: 8 });
    expect(input).toEqual({ label: "8px", size: 24, radius: "8" });
    for (const value of [
      { radius: "50%" }, { radius: "large" }, { radius: "" }, { radius: "8 16" }, { radius: null }, { radius: true },
      { radius: "99px" }, { radius: "8.5" }, { columns: "5" }, { level: "4" }, { size: 28 }, { align: "justify" }, { variant: "huge" },
      { background: { type: "image" } }, { sticky: "yes" },
    ]) expect(() => parseLenient(schema, value), JSON.stringify(value)).toThrow(z.ZodError);
    // Words every object inherits are just words that match nothing.
    for (const value of [{ variant: "constructor" }, { align: "toString" }, { size: "__proto__" }]) expect(() => parseLenient(schema, value)).toThrow(z.ZodError);
    expect(parseLenient(schema, { icon: "my-constructor" })).toEqual({ icon: "check" });
    // The error names the rule that was broken, not the text form.
    expect(() => parseLenient(schema, { radius: "99px" })).toThrow(/Too big/);
  });
});
