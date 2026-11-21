import { describe, expect, it } from "vitest";
import { themeSchema } from "./schema";

describe("site theme schema", () => {
  it("accepts an optional favicon URL and removal value", () => {
    expect(themeSchema.parse({ faviconUrl: "https://cdn.example.test/favicon.png" })).toEqual({
      faviconUrl: "https://cdn.example.test/favicon.png",
    });
    expect(themeSchema.parse({ faviconUrl: "" })).toEqual({ faviconUrl: "" });
  });
});
