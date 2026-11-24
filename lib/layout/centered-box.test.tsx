import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@puckeditor/core";
import { compile } from "@tailwindcss/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { puckConfig, type PuckPageData } from "@/lib/puck/config";
import { blankSection, type LayoutItem } from "./structure";

/**
 * Where boxes end up is decided by the browser, so these cases are laid out
 * by a real one, with the site's compiled stylesheet. They run when a
 * Chromium is available (CHROME_BIN, Playwright's cache or a system Chrome)
 * and are skipped otherwise.
 */
function findChrome(): string | null {
  if (process.env.CHROME_BIN) return existsSync(process.env.CHROME_BIN) ? process.env.CHROME_BIN : null;
  const cache = path.join(os.homedir(), ".cache", "ms-playwright");
  const cached = existsSync(cache) ? readdirSync(cache).filter((name) => name.startsWith("chromium")).sort().reverse().flatMap((name) => [
    path.join(cache, name, "chrome-headless-shell-linux64", "chrome-headless-shell"),
    path.join(cache, name, "chrome-linux64", "chrome"),
    path.join(cache, name, "chrome-linux", "chrome"),
  ]) : [];
  return [...cached, "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((file) => existsSync(file)) ?? null;
}
const chrome = findChrome();

const PARAGRAPH = "<p>Whether you run a trade business, a salon, a restaurant, a clinic, a church or a nonprofit, your website has one job: turn visitors into enquiries, so local customers can find you and get in touch.</p>";
type Design = Record<string, unknown>;

/** A custom section holding a heading and a paragraph, found again in the page by its anchor. */
function section(name: string, align: string | undefined, designs: { element?: Design; column?: Design; section?: Design } = {}): LayoutItem {
  const item = blankSection();
  item.props.id = name;
  item.props.design = { ...designs.section, settings: { anchorId: name } };
  const column = ((item.props.rows as LayoutItem[])[0].props.columns as LayoutItem[])[0];
  column.props.design = designs.column ?? {};
  column.props.content = (["Heading", "Text"] as const).map((type) => ({ type, props: {
    ...puckConfig.components[type].defaultProps, id: `${name}-${type}`, align, design: designs.element ?? {},
    text: type === "Heading" ? "Our services at a glance" : PARAGRAPH,
  } }));
  return item;
}

const CASES = [
  section("center", "center"),
  section("right", "right"),
  section("left", "left"),
  // No alignment of its own: the column's applies.
  section("inherited", undefined, { column: { appearance: { desktop: { align: "center" } } } }),
  section("devices", "center", { element: { appearance: { tablet: { align: "right" }, mobile: { align: "left" } } } }),
  // A section's alignment applies to all of its headings and paragraphs.
  section("forced", "left", { section: { appearance: { desktop: { align: "center" } } } }),
];

const MEASURE = `
  const cases = {};
  for (const name of ${JSON.stringify(CASES.map((item) => item.props.id))}) {
    const root = document.getElementById(name);
    const column = root.querySelector(".layout-column").getBoundingClientRect();
    const gaps = (node) => { const box = node.getBoundingClientRect(); return [Math.round(box.left - column.left), Math.round(column.right - box.right)]; };
    cases[name] = { heading: gaps(root.querySelector("h2")), paragraph: gaps(root.querySelector("p")) };
  }
  document.getElementById("result").textContent = JSON.stringify({ width: innerWidth, cases });
`;

type Gaps = [left: number, right: number];
type Measured = Record<string, { heading: Gaps; paragraph: Gaps }>;

describe.skipIf(!chrome)("centered boxes in a custom layout, laid out by a browser", () => {
  let directory = "";
  let stylesheet = "";
  let markup = "";

  /** Lays the cases out at a viewport width and returns the free space on each side of each box. */
  async function measure(width: number, css: string): Promise<Measured> {
    const file = path.join(directory, `${width}-${Math.random().toString(36).slice(2)}.html`);
    writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body>${markup}<pre id="result"></pre><script>${MEASURE}</script></body></html>`);
    const { stdout } = await promisify(execFile)(chrome!, [
      "--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", `--window-size=${width},900`,
      "--virtual-time-budget=3000", "--dump-dom", `file://${file}`,
    ], { maxBuffer: 32 * 1024 * 1024 });
    const result = JSON.parse(/<pre id="result">([^<]*)<\/pre>/.exec(stdout)![1].replaceAll("&quot;", '"')) as { width: number; cases: Measured };
    expect(result.width).toBe(width);
    return result.cases;
  }

  beforeAll(async () => {
    directory = mkdtempSync(path.join(os.tmpdir(), "centered-box-"));
    // Rendered as the editor and the AI preview render it: rich text inside the editor's own wrapper.
    markup = renderToStaticMarkup(createElement(Render, {
      config: puckConfig, data: { root: { props: {} }, content: CASES } as unknown as PuckPageData,
    })).replace(/<link[^>]*>/g, "");
    const classes = [...new Set([...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1].split(/\s+/)))];
    const compiler = await compile(readFileSync(path.resolve("app/globals.css"), "utf8"), { base: path.resolve("app"), onDependency: () => {} });
    stylesheet = compiler.build(classes);
  }, 60_000);
  afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

  it("centers the paragraph box under a centered heading on every device", async () => {
    for (const width of [1280, 900, 390]) {
      const { center } = await measure(width, stylesheet);
      expect(center.paragraph[0], `paragraph at ${width}px`).toBe(center.paragraph[1]);
      expect(center.heading[0], `heading at ${width}px`).toBe(center.heading[1]);
    }
  }, 60_000);

  it("fails without the fix: a second width cap leaves the paragraph box at the left", async () => {
    const nestedCap = /\.rich-text \.rich-text\s*\{[^}]*\}/;
    expect(stylesheet).toMatch(nestedCap);
    const { center } = await measure(1280, stylesheet.replace(nestedCap, ""));
    expect(center.paragraph[0]).toBe(0);
    expect(center.paragraph[1]).toBeGreaterThan(100);
  }, 60_000);

  it("places a width-capped box where its text is aligned, per device and by inheritance", async () => {
    const capped = `${stylesheet} .rich-text.layout-text.layout-text, .layout-shell-element h2 { max-width: 280px; }`;
    const expectations: Record<number, Record<string, "center" | "left" | "right">> = {
      1280: { center: "center", right: "right", left: "left", inherited: "center", devices: "center", forced: "center" },
      900: { center: "center", right: "right", left: "left", inherited: "center", devices: "right", forced: "center" },
      390: { center: "center", right: "right", left: "left", inherited: "center", devices: "left", forced: "center" },
    };
    for (const [width, expected] of Object.entries(expectations)) {
      const measured = await measure(Number(width), capped);
      for (const [name, side] of Object.entries(expected)) {
        for (const box of ["heading", "paragraph"] as const) {
          const [left, right] = measured[name][box];
          const where = `${name} ${box} at ${width}px (${left}px | ${right}px)`;
          expect(left + right, where).toBeGreaterThan(40);
          if (side === "center") expect(Math.abs(left - right), where).toBeLessThanOrEqual(1);
          if (side === "left") expect(left, where).toBe(0);
          if (side === "right") expect(right, where).toBe(0);
        }
      }
    }
  }, 60_000);
});
