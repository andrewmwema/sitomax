import { GRADER_WEIGHTS } from "./config";
import type { Category, CheckStatus } from "./types";

type CheckLike = { id: string; category: Category; status: CheckStatus; value: string | number | null; detail: string; fix: string };

type CheckCopy = { label: string; why: string };

// One label map for the web report, the PDF and follow-up emails.
const CHECKS: Record<string, CheckCopy> = {
  mobile_performance: { label: "Mobile speed score", why: "Most local customers find you on a phone, and slow pages lose them." },
  desktop_performance: { label: "Desktop speed score", why: "A slow site feels unreliable and sends visitors back to search results." },
  mobile_lcp: { label: "Main content load time (mobile)", why: "Visitors decide in seconds whether to wait for your page." },
  desktop_lcp: { label: "Main content load time (desktop)", why: "Visitors decide in seconds whether to wait for your page." },
  mobile_cls: { label: "Layout stability (mobile)", why: "Content that jumps around causes mis-taps and frustration." },
  desktop_cls: { label: "Layout stability (desktop)", why: "Content that jumps around causes misclicks and frustration." },
  mobile_tbt: { label: "Mobile responsiveness (Total Blocking Time)", why: "A page that freezes while loading ignores taps on Call and Book buttons." },
  desktop_tbt: { label: "Desktop responsiveness (Total Blocking Time)", why: "A page that freezes while loading ignores clicks on your key buttons." },
  mobile_page_weight: { label: "Page size (mobile)", why: "Heavy pages load slowly on mobile data and cost visitors data." },
  desktop_page_weight: { label: "Page size (desktop)", why: "Heavy pages take longer to load for every visitor." },
  mobile_inp: { label: "Real-visitor responsiveness (mobile)", why: "Real visitors notice when buttons are slow to react." },
  desktop_inp: { label: "Real-visitor responsiveness (desktop)", why: "Real visitors notice when buttons are slow to react." },
  viewport: { label: "Mobile-friendly layout", why: "Without it, phones show a shrunken desktop page that is hard to use." },
  horizontal_overflow: { label: "No sideways scrolling on mobile", why: "Sideways scrolling makes a site feel broken on phones." },
  tap_targets: { label: "Tap-friendly buttons and links", why: "Small, crowded buttons are hard to tap and cause mistakes." },
  font_sizes: { label: "Readable text on mobile", why: "Visitors leave when they have to zoom in to read." },
  title: { label: "Page title", why: "The title is the headline people see in Google results." },
  description: { label: "Meta description", why: "A good description persuades searchers to click your result." },
  h1: { label: "Main heading (H1)", why: "One clear main heading tells visitors and Google what the page is about." },
  headings: { label: "Heading structure", why: "Logical headings make pages easier to scan and understand." },
  image_alt: { label: "Image descriptions (alt text)", why: "Alt text helps Google understand your images." },
  canonical: { label: "Preferred page address (canonical)", why: "It stops Google splitting your ranking across duplicate addresses." },
  indexable: { label: "Visible to search engines", why: "Pages marked noindex never appear in Google results." },
  open_graph: { label: "Social sharing preview", why: "Shared links without a preview get fewer clicks." },
  structured_data: { label: "Business details for Google (structured data)", why: "It helps Google show your business details accurately." },
  robots_txt: { label: "Search engine instructions (robots.txt)", why: "It guides search engines to the pages that matter." },
  sitemap: { label: "Sitemap", why: "A sitemap helps search engines find all of your pages." },
  psi_seo: { label: "Google SEO score", why: "Google's own checklist for pages that are easy to find." },
  privacy: { label: "Privacy policy", why: "A privacy policy builds trust and is often legally required." },
  copyright: { label: "Up-to-date copyright year", why: "An old year makes a business look inactive." },
  tls: { label: "Secure certificate (SSL)", why: "Browsers warn visitors away from sites without a valid certificate." },
  https_enforced: { label: "Secure connection (HTTPS)", why: "Visitors should always land on the secure version of your site." },
  mixed_content: { label: "Secure page resources", why: "Insecure files on a secure page can trigger browser warnings." },
  click_to_call: { label: "Tap-to-call phone link", why: "Mobile visitors expect to call you with one tap." },
  phone: { label: "Phone number visible", why: "Many customers still prefer to call before they buy." },
  contact: { label: "Contact form or page", why: "An easy way to reach you turns visitors into leads." },
  cta: { label: "Clear call to action", why: "Visitors need an obvious next step, like Call, Book or Get a quote." },
  booking: { label: "Online booking or quote request", why: "Letting customers book or ask for a quote online captures leads after hours." },
  email_link: { label: "Email link", why: "Some customers prefer to write rather than call." },
  address: { label: "Business address", why: "Local customers and Google both look for where you are." },
  hours: { label: "Opening hours", why: "Customers need to know when they can reach or visit you." },
  maps: { label: "Google Maps link", why: "A map link makes it easy for customers to find you." },
  reviews: { label: "Customer reviews on site", why: "Genuine reviews reassure new customers that you deliver." },
  google_profile: { label: "Google Business Profile", why: "Your Google profile is often the first thing local customers see." },
  places_rating: { label: "Google rating", why: "Your star rating shapes first impressions in Google search and Maps." },
  places_reviews: { label: "Google reviews", why: "More genuine reviews make your business easier to trust." },
  places_phone: { label: "Phone matches Google", why: "Matching details help customers and Google trust your listing." },
  places_address: { label: "Address matches Google", why: "Matching details help customers and Google trust your listing." },
  social_links: { label: "Social media links", why: "Active social profiles show customers you are open for business." },
  blog: { label: "Blog or news", why: "Helpful articles answer customer questions and attract searches." },
  latest_post: { label: "Recent updates", why: "Recent posts show the business is active." },
  accessibility_alt: { label: "Image descriptions for screen readers", why: "Screen reader users rely on alt text to understand images." },
  language: { label: "Page language set", why: "It helps screen readers and translators read your page correctly." },
  contrast: { label: "Text color contrast", why: "Low contrast text is hard to read, especially outdoors on a phone." },
  psi_accessibility: { label: "Google accessibility score", why: "Google's checklist for pages everyone can use." },
};

export const GRADER_STATUS_LABELS: Record<CheckStatus, string> = {
  fail: "Issue", warn: "Needs work", unknown: "Couldn't check", pass: "Pass",
};

export const GRADER_STATUS_ORDER: readonly CheckStatus[] = ["fail", "warn", "unknown", "pass"];

export function graderCheckLabel(id: string): string {
  const known = CHECKS[id]?.label;
  if (known) return known;
  const label = id.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function graderCheckWhy(id: string): string | null {
  return CHECKS[id]?.why ?? null;
}

function sentence(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

const PAGESPEED_METRIC = /^(Largest Contentful Paint|Cumulative Layout Shift|Total Blocking Time|Total page weight): (.+?)\.?$/;

export function graderCheckDetail(check: Pick<CheckLike, "status" | "detail">): string {
  const detail = check.detail.replace(/\s+/g, " ").trim();
  if (/^Couldn't check (?:.+ with PageSpeed|the .+ PageSpeed score)\.$/.test(detail))
    return "Google PageSpeed couldn't measure this.";
  if (/^[^:]+: PageSpeed audit result\.$/.test(detail))
    return check.status === "pass" ? "Google PageSpeed found no problems." : "Google PageSpeed flagged this on your homepage.";
  const score = /^.+ PageSpeed score: (\d+)\/100\.$/.exec(detail);
  if (score) return `Google PageSpeed scored this ${score[1]}/100.`;
  const metric = PAGESPEED_METRIC.exec(detail);
  if (metric) {
    const measured = metric[2].replace(/^Total size was\s*/i, "").replace(/\u00a0/g, " ");
    return metric[1] === "Total page weight" ? `The page downloads ${measured} of data.` : `Measured at ${measured}.`;
  }
  const inp = /^(?:mobile|desktop) field Interaction to Next Paint: (\d+) ms\.$/.exec(detail);
  if (inp) return `Real visitors wait about ${inp[1]} ms for the page to respond (Chrome user data).`;
  const openGraph = /^(\d) of the Open Graph title, description and image tags were found\.$/.exec(detail);
  if (openGraph) return `${openGraph[1]} of 3 social sharing tags (title, description and image) were found.`;
  const places = /^Couldn't check Google Places: (.+)$/.exec(detail);
  if (places) return `Couldn't look up the Google Business Profile: ${places[1]}`;
  return sentence(detail
    .replace(/early in HTML order \(not a visual fold test\)/, "near the top of the page")
    .replace(/ in the downloaded HTML; this is a heuristic\.?$/, " on your homepage")
    .replace(/; its quality was not checked\.?$/, ""));
}

function normalizedText(value: string) {
  return value.toLowerCase().replace(/\u00a0/g, " ").replace(/[^a-z0-9/ ]+/g, " ").replace(/\s+/g, " ").trim();
}

function foundValue(check: CheckLike, detail: string): string | null {
  if (check.value === null || check.status === "unknown") return null;
  if (check.id === "open_graph") return null;
  if (check.id === "headings" && typeof check.value === "number") return `${check.value} headings`;
  const raw = String(check.value).replace(/\u00a0/g, " ").trim();
  if (!raw || /^(not )?found$/i.test(raw)) return null;
  const value = normalizedText(raw.replace(/^Total size was\s*/i, ""));
  const text = normalizedText(detail);
  if (!value || text.includes(value) || value.includes(text)) return null;
  if (/^\d+(\.\d+)?$/.test(value) && new RegExp(`\\b${value.replace(".", "\\.")}\\b`).test(text)) return null;
  return raw.length > 160 ? `${raw.slice(0, 157).trimEnd()}…` : raw;
}

export function graderCheckFix(fix: string): string {
  const lighthouse = /^Review the (mobile|desktop) performance Lighthouse recommendations\.?$/.exec(fix.trim());
  if (lighthouse) return `Work through Google PageSpeed's recommendations for ${lighthouse[1]} speed.`;
  const category = /^Review the (SEO|accessibility) Lighthouse recommendations\.?$/.exec(fix.trim());
  if (category) return `Work through Google PageSpeed's recommendations for ${category[1]}.`;
  if (fix.trim() === "Add Open Graph title, description and image metadata.")
    return "Add social sharing tags (Open Graph title, description and image) so links to your site show a proper preview.";
  return sentence(fix);
}

export type PresentedCheck = {
  id: string;
  category: Category;
  status: CheckStatus;
  statusLabel: string;
  label: string;
  why: string | null;
  found: string | null;
  detail: string;
  fix: string | null;
};

export function presentCheck(check: CheckLike): PresentedCheck {
  const detail = graderCheckDetail(check);
  const fix = check.status === "pass" || check.status === "unknown" ? null : graderCheckFix(check.fix);
  return {
    id: check.id, category: check.category, status: check.status, statusLabel: GRADER_STATUS_LABELS[check.status],
    label: graderCheckLabel(check.id), why: graderCheckWhy(check.id), found: foundValue(check, detail),
    detail, fix: fix && normalizedText(fix) !== normalizedText(detail) ? fix : null,
  };
}

export type UnknownGroup = { reason: string; labels: string[] };
export type CategoryResults = {
  findings: PresentedCheck[];
  unknown: UnknownGroup[];
  passed: PresentedCheck[];
};

export function groupCategoryChecks(checks: readonly CheckLike[], category: Category): CategoryResults {
  const presented = checks.filter((check) => check.category === category).map(presentCheck);
  const findings = [...presented.filter((check) => check.status === "fail"), ...presented.filter((check) => check.status === "warn")];
  const unknown: UnknownGroup[] = [];
  for (const check of presented.filter((item) => item.status === "unknown")) {
    const group = unknown.find((item) => item.reason === check.detail);
    if (group) group.labels.push(check.label);
    else unknown.push({ reason: check.detail, labels: [check.label] });
  }
  return { findings, unknown, passed: presented.filter((check) => check.status === "pass") };
}

function baseId(id: string) {
  if (id === "accessibility_alt") return "image_alt";
  return id.replace(/^(mobile|desktop)_/, "");
}

export type GraderPriority = PresentedCheck & { why: string };

/** Highest-impact findings: issues before needs-work, then by category weight; one entry per mobile/desktop pair. */
export function graderPriorities(checks: readonly CheckLike[], limit = 5): GraderPriority[] {
  const weight = (category: Category) => GRADER_WEIGHTS[category] ?? 0;
  const seen = new Set<string>();
  const ranked = checks
    .map((check, index) => ({ check, index }))
    .filter(({ check }) => check.status === "fail" || check.status === "warn")
    .sort((a, b) => (a.check.status === b.check.status ? 0 : a.check.status === "fail" ? -1 : 1)
      || weight(b.check.category) - weight(a.check.category) || a.index - b.index);
  const result: GraderPriority[] = [];
  for (const { check } of ranked) {
    const key = baseId(check.id);
    if (seen.has(key)) continue;
    seen.add(key);
    const presented = presentCheck(check);
    result.push({ ...presented, why: presented.why ?? presented.detail });
    if (result.length >= limit) break;
  }
  return result;
}
