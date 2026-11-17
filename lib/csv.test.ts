import { describe, expect, it } from "vitest";
import { csvCell } from "./csv";

describe("CSV export cells", () => {
  it("quotes delimiters and neutralizes spreadsheet formulas", () => {
    expect(csvCell('Hello, "friend"')).toBe('"Hello, ""friend"""');
    expect(csvCell("  =1+1")).toBe('"\'  =1+1"');
    expect(csvCell("-1")).toBe('"\'-1"');
    expect(csvCell("\t@cmd")).toBe('"\'\t@cmd"');
  });
});
