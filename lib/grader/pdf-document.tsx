import { Document, Link, Page, Path, Circle, Svg, Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import { brand, brandLogo } from "@/lib/brand";
import { GRADER_STATUS_LABELS, graderPriorities, groupCategoryChecks, type PresentedCheck } from "./check-presentation";
import { graderCategories, graderGradeTone, graderScoreLabel, graderScoreTone, type GraderTone } from "./presentation";
import type { PublicGraderReport } from "./public-report";

export type PdfScreenshot =
  | { kind: "image"; data: Buffer; format: "jpg" | "png"; note: string | null }
  | { kind: "missing"; reason: string };

export type PdfLogo = { full: Buffer; mark: Buffer };

export type GraderPdfProps = {
  report: PublicGraderReport;
  logo: PdfLogo;
  screenshot: PdfScreenshot;
  ctaUrl: string | null;
  mailingAddress: string | null;
  date: string;
};

const color = {
  ink: "#201c2b", muted: "#57525f", line: "#e6e1ed", track: "#eeeaf4",
  accent: "#663dd1", accentSoft: "#f6f2fd", accentLine: "#ddd2f6", panel: "#faf9fc", white: "#ffffff",
};

// Text colors meet WCAG AA (≥4.5:1) on their tinted backgrounds.
const tones: Record<GraderTone, { fg: string; bg: string; bar: string }> = {
  pass: { fg: "#166534", bg: "#dcfce7", bar: "#16a34a" },
  warn: { fg: "#92400e", bg: "#fef3c7", bar: "#d97706" },
  fail: { fg: "#991b1b", bg: "#fee2e2", bar: "#dc2626" },
  unknown: { fg: "#475569", bg: "#f1f5f9", bar: "#94a3b8" },
};

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 10.5, color: color.ink, paddingTop: 46, paddingBottom: 66, paddingHorizontal: 54 },
  footer: { position: "absolute", bottom: 28, left: 54, right: 54, flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderTopWidth: 0.75, borderTopColor: color.line, paddingTop: 8, fontSize: 8, color: color.muted },
  kicker: { fontSize: 8.5, fontWeight: 600, color: color.accent, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 6 },
  title: { fontSize: 28, fontWeight: 700, lineHeight: 1.15, letterSpacing: -0.6 },
  h2: { fontSize: 18, fontWeight: 700, lineHeight: 1.2, letterSpacing: -0.3, marginBottom: 6 },
  h3: { fontSize: 16, fontWeight: 600, lineHeight: 1.25 },
  meta: { fontSize: 9, color: color.muted },
  body: { fontSize: 10.5, lineHeight: 1.55 },
  badge: { borderRadius: 9, paddingVertical: 2, paddingHorizontal: 7, fontSize: 8, fontWeight: 600, alignSelf: "flex-start" },
  divider: { borderBottomWidth: 0.75, borderBottomColor: color.line },
});

function Badge({ tone, children }: { tone: GraderTone; children: string }) {
  return <Text style={[s.badge, { color: tones[tone].fg, backgroundColor: tones[tone].bg }]}>{children}</Text>;
}

const LOGO_WIDTH = 132;
const MARK_HEIGHT = 11;

function Logo({ logo }: { logo: PdfLogo }) {
  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image is not an HTML img and has no alt prop.
  return <Image src={{ data: logo.full, format: "png" }}
    style={{ width: LOGO_WIDTH, height: LOGO_WIDTH * brandLogo.full.height / brandLogo.full.width }} />;
}

function Footer({ domain, date, logo }: { domain: string; date: string; logo: PdfLogo }) {
  return <View style={s.footer} fixed>
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image is not an HTML img and has no alt prop. */}
      <Image src={{ data: logo.mark, format: "png" }}
        style={{ height: MARK_HEIGHT, width: MARK_HEIGHT * brandLogo.mark.width / brandLogo.mark.height, marginRight: 6 }} />
      <Text>{`${brand.name} · Website report for ${domain} · ${date}`}</Text>
    </View>
    <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
  </View>;
}

function arcPath(cx: number, cy: number, r: number, fraction: number) {
  const angle = Math.min(Math.max(fraction, 0), 0.9999) * 2 * Math.PI;
  const x = cx + r * Math.sin(angle);
  const y = cy - r * Math.cos(angle);
  return `M ${cx} ${cy - r} A ${r} ${r} 0 ${angle > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
}

function ScoreRing({ score, grade }: { score: number | null; grade: string | null }) {
  const size = 150, stroke = 13, r = (size - stroke) / 2, c = size / 2;
  const tone = tones[graderGradeTone(grade)];
  return <View style={{ width: size, height: size }}>
    <Svg width={size} height={size}>
      <Circle cx={c} cy={c} r={r} stroke={color.track} strokeWidth={stroke} fill="none" />
      {score !== null && score > 0 ? <Path d={arcPath(c, c, r, score / 100)} stroke={tone.bar} strokeWidth={stroke} fill="none" strokeLinecap="round" /> : null}
    </Svg>
    <View style={{ position: "absolute", top: 0, left: 0, width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 44, fontWeight: 700, lineHeight: 1, letterSpacing: -1.5 }}>{score === null ? "–" : String(score)}</Text>
      <Text style={[s.meta, { marginTop: 4 }]}>out of 100</Text>
    </View>
  </View>;
}

function DeviceFrame({ screenshot, domain }: { screenshot: PdfScreenshot; domain: string }) {
  const width = 146, screenHeight = 270;
  return <View style={{ alignItems: "center" }}>
    <View style={{ width: width + 14, padding: 7, paddingTop: 16, paddingBottom: 16, borderRadius: 24, backgroundColor: "#1d1a24" }}>
      <View style={{ position: "absolute", top: 7, left: (width + 14) / 2 - 18, width: 36, height: 4, borderRadius: 2, backgroundColor: "#3a3545" }} />
      {screenshot.kind === "image"
        // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image is not an HTML img and has no alt prop.
        ? <Image src={{ data: screenshot.data, format: screenshot.format }} style={{ width, height: screenHeight, objectFit: "cover", objectPosition: "top", borderRadius: 6, backgroundColor: color.white }} />
        : <View style={{ width, height: screenHeight, borderRadius: 6, backgroundColor: color.accentSoft, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ fontSize: 10, fontWeight: 600, textAlign: "center" }}>{domain}</Text>
          <Text style={[s.meta, { textAlign: "center", marginTop: 6 }]}>{screenshot.reason}</Text>
        </View>}
    </View>
    {screenshot.kind === "image" && screenshot.note ? <Text style={[s.meta, { width: 190, textAlign: "center", marginTop: 6, fontSize: 8 }]}>{screenshot.note}</Text> : null}
  </View>;
}

function firstSentences(text: string, count: number) {
  return text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).slice(0, count).join(" ");
}

function Cover({ report, screenshot, date, logo }: GraderPdfProps) {
  const score = report.scores?.overall ?? null;
  const grade = report.scores?.grade ?? null;
  const gradeTone = graderGradeTone(grade);
  const business = report.business_name?.trim();
  return <View>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Logo logo={logo} /><Text style={s.meta}>{`Scanned ${date}`}</Text>
    </View>
    <View style={{ marginTop: 28 }}>
      <Text style={s.kicker}>Website Report</Text>
      <Text style={s.title}>{business || report.domain}</Text>
      <Text style={{ fontSize: 12, color: color.muted, marginTop: 4 }}>{business ? report.domain : `How ${report.domain} performs for visitors, Google and leads`}</Text>
    </View>
    <View style={{ flexDirection: "row", marginTop: 20, alignItems: "center" }}>
      <View style={{ flex: 1, paddingRight: 24 }}>
        <ScoreRing score={score} grade={grade} />
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 14 }}>
          <Text style={[s.badge, { fontSize: 10, paddingVertical: 3, paddingHorizontal: 10, color: tones[gradeTone].fg, backgroundColor: tones[gradeTone].bg }]}>
            {grade ? `Grade ${grade} · ${graderScoreLabel(score)}` : "Couldn't score"}
          </Text>
        </View>
        {report.headline ? <Text style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.45, marginTop: 14 }}>{report.headline}</Text> : null}
      </View>
      <DeviceFrame screenshot={screenshot} domain={report.domain} />
    </View>
    <View style={{ marginTop: 20, padding: 18, borderRadius: 10, backgroundColor: color.panel, borderWidth: 0.75, borderColor: color.line }} wrap={false}>
      <Text style={[s.h3, { marginBottom: 6 }]}>Executive summary</Text>
      <Text style={s.body}>{report.ai_summary ? firstSentences(report.ai_summary.summary, 4) : "We couldn't generate a written summary for this scan. Your scores and detailed results follow."}</Text>
    </View>
  </View>;
}

function Scorecard({ report }: { report: PublicGraderReport }) {
  const checks = report.results?.checks ?? [];
  const priorities = graderPriorities(checks, 5);
  const accessibility = report.scores?.categories.accessibility ?? null;
  return <View break>
    <Text style={s.kicker}>Scorecard</Text>
    <Text style={s.h2}>How your website scored</Text>
    <Text style={[s.meta, { marginBottom: 12 }]}>Each category is scored from 0 to 100 using the checks we could complete. Your overall score weights these seven categories.</Text>
    {graderCategories.filter(([key]) => key !== "accessibility").map(([key, label]) => {
      const score = report.scores?.categories[key] ?? null;
      const tone = graderScoreTone(score);
      return <View key={key} style={[s.divider, { flexDirection: "row", alignItems: "center", paddingVertical: 9 }]}>
        <Text style={{ width: 128, fontWeight: 500 }}>{label}</Text>
        <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: color.track, marginRight: 14 }}>
          {score ? <View style={{ width: `${score}%`, height: 8, borderRadius: 4, backgroundColor: tones[tone].bar }} /> : null}
        </View>
        <Text style={{ width: 48, textAlign: "right", fontWeight: 700 }}>{score === null ? "–" : `${score}`}<Text style={[s.meta, { fontWeight: 400 }]}>{score === null ? "" : "/100"}</Text></Text>
        <Text style={{ width: 86, textAlign: "right", fontSize: 9, fontWeight: 600, color: tones[tone].fg }}>{graderScoreLabel(score)}</Text>
      </View>;
    })}
    {accessibility !== null ? <Text style={[s.meta, { marginTop: 8 }]}>{`Accessibility is reported separately and not included in the overall score: ${accessibility}/100 (${graderScoreLabel(accessibility)}).`}</Text> : null}
    <View style={{ marginTop: 24, padding: 18, borderRadius: 10, backgroundColor: color.accentSoft, borderWidth: 0.75, borderColor: color.accentLine }} wrap={false}>
      <Text style={s.h3}>Top priorities</Text>
      <Text style={[s.meta, { marginBottom: 6 }]}>Fix these first for the biggest impact. Issues come before items that need work.</Text>
      {priorities.length ? priorities.map((item, index) => <View key={item.id} style={{ flexDirection: "row", marginTop: 10 }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: color.accent, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
          <Text style={{ color: color.white, fontSize: 9, fontWeight: 700, lineHeight: 1 }}>{String(index + 1)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
            <Text style={{ fontWeight: 600, marginRight: 8 }}>{item.label}{item.found ? <Text style={{ fontWeight: 400, color: color.muted }}>{` · ${item.found}`}</Text> : null}</Text>
            <Badge tone={item.status}>{item.statusLabel}</Badge>
          </View>
          <Text style={[s.body, { color: color.muted, fontSize: 10 }]}>{item.why}</Text>
        </View>
      </View>) : <Text style={[s.body, { marginTop: 8 }]}>No issues or items needing work were found in the checks we could complete.</Text>}
    </View>
  </View>;
}

function Finding({ check }: { check: PresentedCheck }) {
  return <View style={[s.divider, { flexDirection: "row", paddingVertical: 9 }]} wrap={false}>
    <View style={{ width: 82 }}><Badge tone={check.status}>{check.statusLabel}</Badge></View>
    <View style={{ flex: 1 }}>
      <Text style={{ fontWeight: 600 }}>{check.label}</Text>
      {check.found ? <Text style={{ fontSize: 10, color: color.muted }}>{`Found: ${check.found}`}</Text> : null}
      <Text style={{ fontSize: 10 }}>{check.detail}</Text>
      {check.fix ? <Text style={{ fontSize: 10, marginTop: 2 }}><Text style={{ fontWeight: 600, color: color.accent }}>How to improve: </Text>{check.fix}</Text> : null}
    </View>
  </View>;
}

function DetailedResults({ report }: { report: PublicGraderReport }) {
  const checks = report.results?.checks ?? [];
  return <View break>
    <Text style={s.kicker}>Detailed results</Text>
    <Text style={s.h2}>Everything we checked</Text>
    <Text style={[s.meta, { marginBottom: 4 }]}>Within each category: issues first, then items that need work, then checks we couldn&apos;t complete. Passed checks are listed at the end.</Text>
    {graderCategories.map(([key, label]) => {
      const group = groupCategoryChecks(checks, key);
      if (!group.findings.length && !group.unknown.length && !group.passed.length) return null;
      const score = report.scores?.categories[key] ?? null;
      const tone = graderScoreTone(score);
      return <View key={key} style={{ marginTop: 18 }}>
        <View style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 6, borderBottomWidth: 1.5, borderBottomColor: color.ink }]} minPresenceAhead={70} wrap={false}>
          <Text style={s.h3}>{key === "accessibility" ? `${label} (not in overall score)` : label}</Text>
          <Text style={[s.badge, { fontSize: 9, color: tones[tone].fg, backgroundColor: tones[tone].bg }]}>
            {score === null ? "Couldn't score" : `${score}/100 · ${graderScoreLabel(score)}`}
          </Text>
        </View>
        {group.findings.map((check) => <Finding key={check.id} check={check} />)}
        {group.unknown.map((item) => <View key={item.reason} style={[s.divider, { flexDirection: "row", paddingVertical: 8 }]} wrap={false}>
          <View style={{ width: 82 }}><Badge tone="unknown">{GRADER_STATUS_LABELS.unknown}</Badge></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: 600 }}>{item.labels.join(", ")}</Text>
            <Text style={{ fontSize: 10, color: color.muted }}>{item.reason}</Text>
          </View>
        </View>)}
        {group.passed.length ? <View style={{ flexDirection: "row", paddingVertical: 8 }} wrap={false}>
          <View style={{ width: 82 }}><Badge tone="pass">{GRADER_STATUS_LABELS.pass}</Badge></View>
          <Text style={{ flex: 1, fontSize: 10 }}><Text style={{ fontWeight: 600 }}>Passed: </Text>{group.passed.map((check) => check.label).join(", ")}</Text>
        </View> : null}
      </View>;
    })}
  </View>;
}

function FixPlan({ report }: { report: PublicGraderReport }) {
  const steps = report.ai_summary?.fix_plan.length ? report.ai_summary.fix_plan
    : graderPriorities(report.results?.checks ?? [], 8).map((item) => `${item.label}: ${item.fix ?? item.detail}`);
  // Kept whole: follows the last category when it fits, otherwise starts a new page.
  return <View wrap={false} style={{ marginTop: 40 }}>
    <Text style={s.kicker}>Fix plan</Text>
    <Text style={s.h2}>Your step-by-step fix plan</Text>
    <Text style={[s.meta, { marginBottom: 10 }]}>Work through these steps in order and tick each one off when it&apos;s done.</Text>
    {steps.length ? steps.map((step, index) => <View key={index} style={[s.divider, { flexDirection: "row", paddingVertical: 11 }]} wrap={false}>
      <View style={{ width: 13, height: 13, borderWidth: 1.25, borderColor: color.accent, borderRadius: 3, marginTop: 2, marginRight: 12 }} />
      <Text style={{ width: 22, fontWeight: 700, color: color.accent }}>{`${index + 1}.`}</Text>
      <Text style={[s.body, { flex: 1 }]}>{step}</Text>
    </View>) : <Text style={s.body}>No fixes are needed based on the checks we could complete.</Text>}
  </View>;
}

function withoutGuarantee(text: string) {
  return (text.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [text])
    .filter((sentence) => !/guarantee/i.test(sentence)).map((sentence) => sentence.trim()).join(" ");
}

function Closing({ report, ctaUrl, mailingAddress, date }: GraderPdfProps) {
  const pitch = report.ai_summary?.sitomax_pitch ? withoutGuarantee(report.ai_summary.sitomax_pitch) : "";
  const website = `${brand.rootDomain.includes("localhost") ? "http" : "https"}://${brand.rootDomain}`;
  const points = ["Launch a faster, lead-ready site in 7 days.", "We walk through every finding in this report with you.", "Hosting, security and updates are handled for you."];
  return <View break>
    <Text style={s.kicker}>Next step</Text>
    <Text style={[s.title, { fontSize: 26 }]}>{`${brand.name} can fix this for you`}</Text>
    <Text style={{ fontSize: 12, lineHeight: 1.55, marginTop: 12, color: color.muted }}>
      We design, build and look after fast, mobile-friendly websites for local businesses, so more visitors call, book and buy.
    </Text>
    <View style={{ marginTop: 16 }}>
      {points.map((point) => <View key={point} style={{ flexDirection: "row", alignItems: "center", marginTop: 7 }}>
        <Svg width={14} height={14} viewBox="0 0 14 14"><Circle cx={7} cy={7} r={7} fill={color.accentSoft} />
          <Path d="M4 7.2l2 2 4-4.4" stroke={color.accent} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
        <Text style={{ marginLeft: 9, fontWeight: 500 }}>{point}</Text>
      </View>)}
    </View>
    {pitch ? <Text style={[s.body, { marginTop: 16 }]}>{pitch}</Text> : null}
    <View style={{ marginTop: 26, flexDirection: "row" }}>
      {ctaUrl ? <Link src={ctaUrl} style={{ textDecoration: "none" }}>
        <View style={{ backgroundColor: color.accent, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 22 }}>
          <Text style={{ color: color.white, fontSize: 12, fontWeight: 600 }}>Book a free consultation →</Text>
        </View>
      </Link> : <Link src={`mailto:${brand.supportEmail}`} style={{ textDecoration: "none" }}>
        <View style={{ backgroundColor: color.accent, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 22 }}>
          <Text style={{ color: color.white, fontSize: 12, fontWeight: 600 }}>Email us for a free consultation →</Text>
        </View>
      </Link>}
    </View>
    <View style={{ marginTop: 28, paddingTop: 14, borderTopWidth: 0.75, borderTopColor: color.line }}>
      <Text style={{ fontWeight: 600, marginBottom: 4 }}>Contact</Text>
      <Link src={`mailto:${brand.supportEmail}`} style={{ color: color.accent, textDecoration: "none" }}>{brand.supportEmail}</Link>
      <Link src={website} style={{ color: color.accent, textDecoration: "none" }}>{brand.rootDomain}</Link>
      {mailingAddress ? <Text style={s.meta}>{mailingAddress}</Text> : null}
    </View>
    <View style={{ marginTop: 24, padding: 14, borderRadius: 8, backgroundColor: color.panel }} wrap={false}>
      <Text style={{ fontSize: 9, fontWeight: 600, marginBottom: 3 }}>About this report</Text>
      <Text style={[s.meta, { lineHeight: 1.5 }]}>
        {`This report is based on automated checks of your homepage on ${date}, including Google PageSpeed Insights${report.results?.checks.some((check) => check.id.startsWith("places_") && check.status !== "unknown") ? " and your Google Business Profile" : ""}. Automated checks can miss things or flag items that are fine, so please confirm findings before making changes. Results depend on the changes made, and ${brand.name} does not guarantee specific rankings or outcomes.`}
      </Text>
    </View>
  </View>;
}

export function GraderPdfDocument(props: GraderPdfProps) {
  const { report, date } = props;
  return <Document title={`${brand.name} website report for ${report.domain}`} author={brand.name} subject="Website report" creator={brand.name} producer={brand.name}>
    <Page size="LETTER" style={s.page}>
      <Cover {...props} />
      <Scorecard report={report} />
      <DetailedResults report={report} />
      <FixPlan report={report} />
      <Closing {...props} />
      <Footer domain={report.domain} date={date} logo={props.logo} />
    </Page>
  </Document>;
}
