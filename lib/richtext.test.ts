import { describe, expect, it } from "vitest";
import {
  sanitizePuckData,
  sanitizeRichText,
  type SanitizableConfig,
} from "./richtext";

describe("sanitizeRichText", () => {
  it("removes <script> tags and their content", () => {
    const html = '<p>hello</p><script>alert("xss")</script>';
    expect(sanitizeRichText(html)).toBe("<p>hello</p>");
  });

  it("removes event handler attributes like onerror", () => {
    const html = '<p onerror="alert(1)" onclick="alert(1)">text</p><img src="x" onerror="alert(1)">';
    const clean = sanitizeRichText(html);
    expect(clean).toContain("<p>text</p>");
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("<img");
  });

  it("removes javascript: links but keeps safe links", () => {
    const clean = sanitizeRichText('<a href="javascript:alert(1)">bad</a>');
    expect(clean).not.toContain("javascript:");

    const safe = sanitizeRichText('<a href="https://example.com" target="_blank">ok</a>');
    expect(safe).toContain('href="https://example.com"');
    expect(safe).toContain('rel="noopener noreferrer"');
    expect(safe).toContain('target="_blank"');
  });

  it('removes style="background:url(...)" payloads', () => {
    const clean = sanitizeRichText(
      '<span style="background:url(https://evil.example/x)">text</span>',
    );
    expect(clean).toBe("<span>text</span>");
  });

  it("removes url() values smuggled into allowed properties", () => {
    const clean = sanitizeRichText(
      '<span style="background-color:url(https://evil.example/x); color:url(x)">text</span>',
    );
    expect(clean).toBe("<span>text</span>");
  });

  it("removes font families that are not on the curated list", () => {
    const clean = sanitizeRichText(
      '<span style="font-family: Hacker Font">text</span>',
    );
    expect(clean).toBe("<span>text</span>");
  });

  it("keeps curated font families, normalized and quoted when needed", () => {
    expect(sanitizeRichText('<span style="font-family: inter">a</span>')).toBe(
      '<span style="font-family: Inter">a</span>',
    );
    expect(
      sanitizeRichText("<span style=\"font-family: 'DM Serif Display'\">a</span>"),
    ).toBe('<span style="font-family: &quot;DM Serif Display&quot;">a</span>');
  });

  it("keeps valid colors and drops malformed ones", () => {
    expect(sanitizeRichText('<span style="color: #A1B2C3">a</span>')).toBe(
      '<span style="color: #a1b2c3">a</span>',
    );
    expect(
      sanitizeRichText('<span style="background-color: rgba(10, 20, 30, 0.5)">a</span>'),
    ).toBe('<span style="background-color: rgba(10, 20, 30, 0.5)">a</span>');
    expect(sanitizeRichText('<span style="color: expression(alert(1))">a</span>')).toBe(
      "<span>a</span>",
    );
    expect(sanitizeRichText('<span style="color: var(--x)">a</span>')).toBe(
      "<span>a</span>",
    );
  });

  it("keeps font sizes between 10 and 96px and drops the rest", () => {
    expect(sanitizeRichText('<span style="font-size: 18px">a</span>')).toBe(
      '<span style="font-size: 18px">a</span>',
    );
    expect(sanitizeRichText('<span style="font-size: 1.5rem">a</span>')).toBe(
      '<span style="font-size: 1.5rem">a</span>',
    );
    expect(sanitizeRichText('<span style="font-size: 8px">a</span>')).toBe("<span>a</span>");
    expect(sanitizeRichText('<span style="font-size: 200px">a</span>')).toBe(
      "<span>a</span>",
    );
    expect(sanitizeRichText('<span style="font-size: 7rem">a</span>')).toBe(
      "<span>a</span>",
    );
  });

  it("keeps text-align and line-height within bounds", () => {
    expect(sanitizeRichText('<p style="text-align: CENTER">a</p>')).toBe(
      '<p style="text-align: center">a</p>',
    );
    expect(sanitizeRichText('<p style="line-height: 1.6">a</p>')).toBe(
      '<p style="line-height: 1.6">a</p>',
    );
    expect(sanitizeRichText('<p style="line-height: 0.5">a</p>')).toBe("<p>a</p>");
    expect(sanitizeRichText('<p style="line-height: 10">a</p>')).toBe("<p>a</p>");
  });

  it("drops style properties outside the allowlist but keeps allowed ones", () => {
    const clean = sanitizeRichText(
      '<span style="position: fixed; color: #fff; z-index: 999">a</span>',
    );
    expect(clean).toBe('<span style="color: #fff">a</span>');
  });

  it("keeps allowed formatting tags including span, mark and s", () => {
    const html =
      "<h2>Title</h2><p><strong>b</strong> <em>i</em> <u>u</u> <s>strike</s> " +
      "<span>plain</span> <mark>hi</mark></p><ul><li>item</li></ul><blockquote>q</blockquote>";
    expect(sanitizeRichText(html)).toBe(html);
  });
});

/** Minimal config exercising every traversal path the sanitizer supports. */
const testConfig: SanitizableConfig = {
  root: {
    fields: {
      intro: { type: "richtext" },
      title: { type: "text" },
    },
  },
  components: {
    Card: {
      fields: {
        body: { type: "richtext" },
        rows: {
          type: "array",
          arrayFields: {
            cell: { type: "richtext" },
            nested: {
              type: "array",
              arrayFields: { deep: { type: "richtext" } },
            },
          },
        },
        meta: {
          type: "object",
          objectFields: { caption: { type: "richtext" } },
        },
      },
    },
    Wrapper: {
      fields: {
        children: { type: "slot" },
      },
    },
  },
};

const XSS = '<p>ok</p><script>alert(1)</script>';

describe("sanitizePuckData", () => {
  it("sanitizes richtext fields in root.props", () => {
    const data = {
      root: { props: { intro: XSS, title: "<script>keep-as-is</script>" } },
      content: [],
    };
    sanitizePuckData(data, testConfig);
    expect(data.root.props.intro).toBe("<p>ok</p>");
    // Non-richtext fields are left alone (they are escaped at render time).
    expect(data.root.props.title).toBe("<script>keep-as-is</script>");
  });

  it("sanitizes richtext props in content, arrays (nested) and objects", () => {
    const data = {
      root: { props: {} },
      content: [
        {
          type: "Card",
          props: {
            body: XSS,
            rows: [
              { cell: XSS, nested: [{ deep: XSS }] },
              { cell: "<p>fine</p>" },
            ],
            meta: { caption: XSS },
          },
        },
      ],
    };
    sanitizePuckData(data, testConfig);
    const props = data.content[0].props;
    expect(props.body).toBe("<p>ok</p>");
    expect(props.rows[0].cell).toBe("<p>ok</p>");
    expect(props.rows[0].nested?.[0].deep).toBe("<p>ok</p>");
    expect(props.rows[1].cell).toBe("<p>fine</p>");
    expect(props.meta.caption).toBe("<p>ok</p>");
  });

  it("recurses into slot fields and zones", () => {
    const data = {
      root: { props: {} },
      content: [
        {
          type: "Wrapper",
          props: {
            children: [{ type: "Card", props: { body: XSS } }],
          },
        },
      ],
      zones: {
        "Wrapper-1:zone": [{ type: "Card", props: { body: XSS } }],
      },
    };
    sanitizePuckData(data, testConfig);
    expect(data.content[0].props.children[0].props.body).toBe("<p>ok</p>");
    expect(data.zones["Wrapper-1:zone"][0].props.body).toBe("<p>ok</p>");
  });

  it("ignores unknown component types and malformed items without crashing", () => {
    const data = {
      content: [
        { type: "Unknown", props: { body: XSS } },
        { props: { body: XSS } },
        null,
        "garbage",
      ],
    };
    expect(() => sanitizePuckData(data as never, testConfig)).not.toThrow();
  });

  it("covers blocks from the real Puck config automatically", () => {
    const data = {
      root: { props: { title: "Page" } },
      content: [
        { type: "TextSection", props: { text: XSS } },
        { type: "Services", props: { services: [{ icon: "star", title: "t", text: XSS }] } },
        { type: "Faq", props: { items: [{ question: "q", answer: XSS }] } },
      ],
    };
    sanitizePuckData(data);
    expect(data.content[0].props).toMatchObject({ text: "<p>ok</p>" });
    expect(data.content[1].props).toMatchObject({
      services: [{ text: "<p>ok</p>" }],
    });
    expect(data.content[2].props).toMatchObject({
      items: [{ answer: "<p>ok</p>" }],
    });
  });

  it("converts plain legacy strings to paragraphs", () => {
    const data = {
      content: [{ type: "TextSection", props: { text: "line one\n\nline two" } }],
    };
    sanitizePuckData(data);
    expect(data.content[0].props.text).toBe("<p>line one</p><p>line two</p>");
  });
});
