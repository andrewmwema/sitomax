import { describe, expect, it } from "vitest";
import { findCenteredIndentIssues } from "./indent-qa";

describe("centered indent warning", () => {
  it("finds large indents in nested centered text without warning for unrelated text or code", () => {
    const data = { content: [
      { type: "Section", props: { rows: [{ type: "Text", props: {
        text: '<p style="text-align: center; margin-left: 128px">Introduction</p>',
      } }] } },
      { type: "Section", props: { rows: [{ type: "Text", props: {
        align: "center", text: '<p style="margin-left: 64px">Centered</p>',
      } }] } },
      { type: "Section", props: { rows: [{ type: "Text", props: {
        align: "left", text: '<p style="margin-left: 64px">Left</p>',
      } }] } },
      { type: "TextSection", props: { text: '<p style="text-align: center; margin-left: 32px">Small</p>' } },
      { type: "Embed", props: { code: '<p style="text-align: center; margin-left: 128px">Code</p>' } },
    ] };
    expect(findCenteredIndentIssues(data)).toEqual([
      { index: 0, label: "Section" }, { index: 1, label: "Section" },
    ]);
  });
});
