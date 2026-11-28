import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { brand, brandLogo } from "@/lib/brand";
import { graderGradeTone, type GraderTone } from "@/lib/grader/presentation";
import { loadSharedGraderReport } from "@/lib/grader/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = `${brand.name} website report`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ringColor: Record<GraderTone, string> = { pass: "#16a34a", warn: "#d97706", fail: "#dc2626", unknown: "#94a3b8" };

async function assets() {
  const [semibold, bold, logo] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/inter/Inter-SemiBold.ttf")),
    readFile(join(process.cwd(), "assets/fonts/inter/Inter-Bold.ttf")),
    readFile(join(process.cwd(), "public", brandLogo.full.path)),
  ]);
  return { semibold, bold, logo: `data:image/png;base64,${logo.toString("base64")}` };
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [report, files] = await Promise.all([loadSharedGraderReport(slug).catch(() => null), assets()]);
  const score = report?.scores?.overall ?? null;
  const grade = report?.scores?.grade ?? null;
  const tone = ringColor[graderGradeTone(grade)];
  const radius = 130;
  const angle = 2 * Math.PI * Math.min(score ?? 0, 99.9) / 100;
  // Satori ignores SVG transforms, so draw the arc clockwise from 12 o'clock as a path.
  const arc = `M 160 ${160 - radius} A ${radius} ${radius} 0 ${angle > Math.PI ? 1 : 0} 1 ${160 + radius * Math.sin(angle)} ${160 - radius * Math.cos(angle)}`;
  const logoHeight = 64;
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#fcfaf8", fontFamily: "Inter", color: "#201c2b", padding: 72 }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, paddingRight: 48 }}>
        <img src={files.logo} alt="" height={logoHeight} width={Math.round(logoHeight * brandLogo.full.width / brandLogo.full.height)} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: "#663dd1", letterSpacing: 2, textTransform: "uppercase" }}>Website report</div>
          <div style={{ display: "flex", fontSize: report && report.domain.length > 22 ? 54 : 68, fontWeight: 700, marginTop: 16, lineHeight: 1.1 }}>
            {report?.domain ?? "Get your free website grade"}
          </div>
          {report?.business_name ? <div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: "#625e6b", marginTop: 14 }}>{report.business_name}</div> : null}
        </div>
        <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: "#625e6b" }}>Speed · Mobile · Search · Security · Leads</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 360, position: "relative" }}>
        <svg width="320" height="320" viewBox="0 0 320 320">
          <circle cx="160" cy="160" r={radius} fill="none" stroke="#eeeaf4" strokeWidth="28" />
          {score ? <path d={arc} fill="none" stroke={tone} strokeWidth="28" strokeLinecap="round" /> : null}
        </svg>
        <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 96, fontWeight: 700, lineHeight: 1 }}>{score ?? "?"}</div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: "#625e6b", marginTop: 6 }}>{grade ? `Grade ${grade}` : "out of 100"}</div>
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Inter", data: files.semibold, style: "normal", weight: 600 },
        { name: "Inter", data: files.bold, style: "normal", weight: 700 },
      ],
    },
  );
}
