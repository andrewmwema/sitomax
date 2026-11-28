import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Font, renderToBuffer } from "@react-pdf/renderer";
import { StorageApiError } from "@supabase/supabase-js";
import { GraderPdfDocument, type PdfLogo, type PdfScreenshot } from "./pdf-document";
import { graderCtaUrl } from "./presentation";
import { publicReportSchema, type PublicGraderReport } from "./public-report";
import { graderRpc, graderWorker } from "./worker";

// Bump when the PDF layout changes so cached PDFs are regenerated.
const PDF_CACHE_PREFIX = "v3";

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

let fontsReady: Promise<void> | null = null;

function registerFonts() {
  fontsReady ??= (async () => {
    const dir = join(process.cwd(), "assets/fonts/inter");
    const [regular, medium, semibold, bold] = await Promise.all([
      readFile(join(dir, "Inter-Regular.ttf")), readFile(join(dir, "Inter-Medium.ttf")),
      readFile(join(dir, "Inter-SemiBold.ttf")), readFile(join(dir, "Inter-Bold.ttf")),
    ]);
    const src = (bytes: Buffer) => `data:font/ttf;base64,${bytes.toString("base64")}`;
    Font.register({ family: "Inter", fonts: [
      { src: src(regular), fontWeight: 400 }, { src: src(medium), fontWeight: 500 },
      { src: src(semibold), fontWeight: 600 }, { src: src(bold), fontWeight: 700 },
    ] });
    // Wrap on word boundaries only; never hyphenate.
    Font.registerHyphenationCallback((word) => [word]);
  })().catch((error: unknown) => { fontsReady = null; throw error; });
  return fontsReady;
}

let logoReady: Promise<PdfLogo> | null = null;

function loadLogo() {
  logoReady ??= (async () => {
    const dir = join(process.cwd(), "public/brand");
    const [full, mark] = await Promise.all([
      readFile(join(dir, "sitomax-logo.png")), readFile(join(dir, "sitomax-mark.png")),
    ]);
    return { full, mark };
  })().catch((error: unknown) => { logoReady = null; throw error; });
  return logoReady;
}

const SCREENSHOT_MISSING = "We couldn't capture a preview of this page.";

/** Downscales the screenshot and detects blank captures or dark video areas that weren't captured. */
export async function prepareScreenshot(bytes: Uint8Array, png: boolean): Promise<PdfScreenshot> {
  const fallback: PdfScreenshot = { kind: "image", data: Buffer.from(bytes), format: png ? "png" : "jpg", note: null };
  let sharp: typeof import("sharp").default;
  try { sharp = (await import("sharp")).default; } catch { return fallback; }
  try {
    const { data, info } = await sharp(bytes).resize({ width: 48, fit: "fill", height: 96 }).removeAlpha().greyscale()
      .raw().toBuffer({ resolveWithObject: true });
    let flatRows = 0, darkRows = 0;
    for (let row = 0; row < info.height; row += 1) {
      const pixels = data.subarray(row * info.width, (row + 1) * info.width);
      const mean = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
      const deviation = Math.sqrt(pixels.reduce((sum, value) => sum + (value - mean) ** 2, 0) / pixels.length);
      if (deviation < 4) { flatRows += 1; if (mean < 12) darkRows += 1; }
    }
    if (flatRows === info.height) return { kind: "missing", reason: `${SCREENSHOT_MISSING} The page may load its content with video or animation.` };
    const resized = await sharp(bytes).resize({ width: 480, withoutEnlargement: true }).flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    return { kind: "image", data: resized, format: "jpg",
      note: darkRows >= info.height * 0.15 ? "Dark areas are video or animation that our snapshot couldn't capture." : null };
  } catch (error) {
    logPdfFailure("prepare screenshot", error);
    return fallback;
  }
}

function reportDate(report: PublicGraderReport, now: Date) {
  const parsed = report.scanned_at ? new Date(report.scanned_at) : now;
  const date = Number.isNaN(parsed.getTime()) ? now : parsed;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export async function renderGraderPdf(report: PublicGraderReport,
  options: { loadScreenshot?: (url: string) => Promise<{ bytes: Uint8Array; png: boolean }>; now?: Date } = {}): Promise<Uint8Array> {
  if (!report.unlocked || report.status !== "complete" || report.results === undefined || report.ai_summary === undefined)
    throw new Error("Report is not available.");
  try { await registerFonts(); } catch (error) { logPdfFailure("read fonts", error); throw error; }
  let logo: PdfLogo;
  try { logo = await loadLogo(); } catch (error) { logPdfFailure("read logo", error); throw error; }
  let image: PdfScreenshot = { kind: "missing", reason: SCREENSHOT_MISSING };
  if (report.screenshot_url) {
    let raw: { bytes: Uint8Array; png: boolean };
    try { raw = await (options.loadScreenshot ?? screenshot)(report.screenshot_url); }
    catch (error) { logPdfFailure("read screenshot", error); throw error; }
    image = await prepareScreenshot(raw.bytes, raw.png);
  }
  const mailing = process.env.GRADER_MAILING_ADDRESS?.trim();
  return new Uint8Array(await renderToBuffer(<GraderPdfDocument report={report} screenshot={image} logo={logo}
    ctaUrl={graderCtaUrl(report.slug)} mailingAddress={mailing && mailing.length <= 300 ? mailing : null}
    date={reportDate(report, options.now ?? new Date())} />));
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
  const path = `${PDF_CACHE_PREFIX}/${slug}.pdf`;
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
