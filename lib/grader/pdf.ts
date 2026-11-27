import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { StorageApiError } from "@supabase/supabase-js";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { brand } from "@/lib/brand";
import { graderCategories, graderCheckName, graderCtaUrl } from "./presentation";
import { publicReportSchema, type PublicGraderReport } from "./public-report";
import { graderRpc, graderWorker } from "./worker";

type Font = { font: PDFFont; characters: Set<number> };

class PdfFailure extends Error {
  constructor(readonly reason: string, readonly status?: number) {
    super(reason);
    this.name = "PdfFailure";
  }
}

function diagnostic(error: unknown) {
  if (error instanceof PdfFailure) return { type: error.name, reason: error.reason, status: error.status };
  if (error instanceof StorageApiError) return { type: error.name, status: error.status, code: error.code };
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" && /^[A-Z0-9_]{1,40}$/.test(error.code)
      ? error.code : undefined;
    return { type: error.name, code };
  }
  return { type: "UnknownError" };
}

function logPdfFailure(stage: string, error: unknown) {
  console.error("Grader PDF failed", { stage, ...diagnostic(error) });
}

async function screenshot(url: string): Promise<{ bytes: Uint8Array; png: boolean }> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new PdfFailure("Grader screenshot storage is not configured.");
  const storage = new URL(base);
  const image = new URL(url);
  const prefix = `${storage.pathname.replace(/\/$/, "")}/storage/v1/object/public/grader-screenshots/`;
  const name = image.pathname.slice(prefix.length);
  if (image.origin !== storage.origin || !image.pathname.startsWith(prefix)
    || !/^[0-9a-f-]{36}\.(png|jpg)$/.test(name) || image.search || image.hash) {
    throw new PdfFailure("Invalid grader screenshot URL.");
  }
  const response = await fetch(image, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new PdfFailure("Screenshot storage request failed.", response.status);
  if (Number(response.headers.get("content-length")) > 3 * 1024 * 1024)
    throw new PdfFailure("Grader screenshot is too large.");
  if (!response.body) throw new PdfFailure("Screenshot response has no body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 3 * 1024 * 1024) { await reader.cancel(); throw new PdfFailure("Grader screenshot is too large."); }
    chunks.push(value);
  }
  return { bytes: Buffer.concat(chunks), png: name.endsWith(".png") };
}

export async function renderGraderPdf(report: PublicGraderReport): Promise<Uint8Array> {
  if (!report.unlocked || report.status !== "complete" || report.results === undefined || report.ai_summary === undefined)
    throw new Error("Report is not available.");
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  let fontBytes: Buffer[];
  try {
    fontBytes = await Promise.all([
      readFile(join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff")),
      readFile(join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff")),
      readFile(join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff")),
      readFile(join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-greek-400-normal.woff")),
      readFile(join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-vietnamese-400-normal.woff")),
    ]);
  } catch (error) { logPdfFailure("read fonts", error); throw error; }
  const fonts: Font[] = await Promise.all(fontBytes.map(async (bytes) => {
    const font = await pdf.embedFont(bytes);
    return { font, characters: new Set(font.getCharacterSet()) };
  }));
  pdf.setTitle(`${brand.name} website report`);
  const pageWidth = 595, pageHeight = 842, margin = 52, contentWidth = pageWidth - margin * 2;
  let page: PDFPage = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  let missingCharacters = false;
  function nextPage(required: number) {
    if (y - required >= margin) return;
    if (pdf.getPageCount() >= 100) throw new Error("Grader report is too long to render.");
    page = pdf.addPage([pageWidth, pageHeight]); y = pageHeight - margin;
  }
  function chosen(char: string) {
    const code = char.codePointAt(0)!;
    const font = fonts.find((item) => item.characters.has(code));
    if (!font) { missingCharacters = true; return { font: fonts[0].font, text: "?" }; }
    return { font: font.font, text: char };
  }
  function line(text: string, size = 10, color = rgb(0.13, 0.11, 0.17)) {
    const advance = size * 1.45;
    let runs: { font: PDFFont; text: string; width: number }[] = [];
    let width = 0;
    function flush() {
      nextPage(advance);
      let x = margin;
      for (const run of runs) {
        page.drawText(run.text, { x, y, size, font: run.font, color });
        x += run.width;
      }
      y -= advance; runs = []; width = 0;
    }
    for (const char of text.replaceAll("\r", "")) {
      if (char === "\n") { flush(); continue; }
      const selected = chosen(char);
      const charWidth = selected.font.widthOfTextAtSize(selected.text, size);
      if (width + charWidth > contentWidth && runs.length) flush();
      const last = runs[runs.length - 1];
      if (last?.font === selected.font) { last.text += selected.text; last.width += charWidth; }
      else runs.push({ font: selected.font, text: selected.text, width: charWidth });
      width += charWidth;
    }
    if (runs.length) flush();
    y -= 4;
  }
  line(`${brand.name} | Website report`, 22);
  line(report.domain, 15);
  line(`Score: ${report.scores?.overall ?? "Couldn't score"}${report.scores?.overall === null || !report.scores ? "" : "/100"}  Grade: ${report.scores?.grade ?? "Couldn't score"}`, 14);
  if (report.screenshot_url) {
    let image: Awaited<ReturnType<typeof screenshot>>;
    try { image = await screenshot(report.screenshot_url); }
    catch (error) { logPdfFailure("read screenshot", error); throw error; }
    const embedded = image.png ? await pdf.embedPng(image.bytes) : await pdf.embedJpg(image.bytes);
    const scale = Math.min(contentWidth / embedded.width, 290 / embedded.height, 1);
    const height = embedded.height * scale;
    nextPage(height + 14);
    page.drawImage(embedded, { x: margin, y: y - height, width: embedded.width * scale, height });
    y -= height + 18;
  } else line("Screenshot couldn't be checked.");
  line("Summary and fix plan", 16);
  if (report.ai_summary) {
    line(report.ai_summary.summary);
    report.ai_summary.fix_plan.forEach((item, index) => line(`${index + 1}. ${item}`));
  } else line("AI summary and fix plan couldn't be generated.");
  for (const [key, label] of graderCategories) {
    const checks = report.results?.checks.filter((check) => check.category === key) ?? [];
    if (!checks.length) continue;
    line(`${label} - ${report.scores?.categories[key] == null ? "Couldn't score" : `${report.scores.categories[key]}/100`}`, 16);
    for (const check of checks) {
      line(`${graderCheckName(check.id)} - ${check.status === "unknown" ? "Couldn't check" : check.status}`, 12);
      if (check.value !== null) line(`Found: ${check.value}`);
      line(check.detail);
      if (check.fix) line(`How to improve: ${check.fix}`);
    }
  }
  line(`${brand.name} can fix this for you`, 16);
  line("Launch a faster, lead-ready site in 7 days.");
  if (report.ai_summary?.sitomax_pitch) line(report.ai_summary.sitomax_pitch);
  const cta = graderCtaUrl(report.slug);
  line(cta ? `Contact us: ${cta}` : "Contact link is temporarily unavailable.");
  if (missingCharacters) line("Some characters could not be displayed. Please refer to the online report.");
  return pdf.save();
}

export async function graderPdf(slug: string): Promise<Uint8Array | null> {
  let raw: unknown;
  try { raw = await graderRpc("grader_get_report", { p_slug: slug }); }
  catch (error) { logPdfFailure("read report", error); throw error; }
  if (!raw) return null;
  const parsedResult = publicReportSchema.safeParse(raw);
  if (!parsedResult.success) {
    logPdfFailure("validate report", parsedResult.error);
    throw new Error("Invalid grader report.");
  }
  const parsed = parsedResult.data;
  if (!parsed.unlocked || parsed.status !== "complete") return null;
  let storage: ReturnType<ReturnType<typeof graderWorker>["client"]["storage"]["from"]>;
  try { storage = graderWorker().client.storage.from("grader-reports"); }
  catch (error) { logPdfFailure("configure storage", error); throw error; }
  const path = `${slug}.pdf`;
  const cached = await storage.download(path);
  if (cached.data) return new Uint8Array(await cached.data.arrayBuffer());
  if (!(cached.error instanceof StorageApiError &&
    (cached.error.code === "NoSuchKey" || (cached.error.status === 404 && cached.error.code === undefined)))) {
    logPdfFailure("read cache", cached.error);
    throw new Error("Could not read the cached grader PDF.");
  }
  let bytes: Uint8Array;
  try { bytes = await renderGraderPdf(parsed); }
  catch (error) { logPdfFailure("render report", error); throw error; }
  if (bytes.length > 8 * 1024 * 1024) {
    console.error("Grader PDF failed", { stage: "render report", reason: "PDF exceeds storage size limit" });
    throw new Error("Grader PDF is too large.");
  }
  const uploaded = await storage.upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (uploaded.error) {
    if (!(uploaded.error instanceof StorageApiError &&
      (uploaded.error.status === 409 || uploaded.error.code === "Duplicate" || uploaded.error.code === "ResourceAlreadyExists"))) {
      logPdfFailure("write cache", uploaded.error);
      throw new Error("Could not cache the grader PDF.");
    }
    const existing = await storage.download(path);
    if (!existing.data) {
      logPdfFailure("read concurrent cache", existing.error);
      throw new Error("Could not read the cached grader PDF.");
    }
    return new Uint8Array(await existing.data.arrayBuffer());
  }
  return bytes;
}
