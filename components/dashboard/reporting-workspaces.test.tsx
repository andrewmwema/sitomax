import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalyticsReport } from "./analytics-report";
import { AiCostReport } from "./ai-cost-report";
import { formatAiCost } from "@/lib/ai/cost-format";
import type { SiteAnalyticsReport } from "@/lib/analytics";

const emptyAnalytics: SiteAnalyticsReport = {
  visits: 0, unique_visitors: 0, form_submissions: 0,
  daily: [{ day: "2026-11-18", visits: 0 }, { day: "2026-11-19", visits: 0 }],
  pages: [], referrers: [], devices: [],
};
const accountId = "00000000-0000-4000-8000-000000000001";

describe("Phase 4 reporting workspaces", () => {
  it("uses a useful traffic empty state instead of a zero-filled chart", () => {
    const html = renderToStaticMarkup(<AnalyticsReport report={emptyAnalytics} siteId="site" siteName="North Studio" days={7} />);
    expect(html).toContain("No traffic recorded in this period");
    expect(html).not.toContain('role="img"');
    expect(html).toContain("Daily unique visitors");
    expect(html).toContain("not a deduplicated audience");
    expect(html).not.toContain("NaN");
  });

  it("keeps daily values accessible and does not invent a conversion rate", () => {
    const report: SiteAnalyticsReport = {
      ...emptyAnalytics, visits: 10, unique_visitors: 7, form_submissions: 2,
      daily: [{ day: "2026-11-18", visits: 3 }, { day: "2026-11-19", visits: 7 }],
      pages: [{ label: "/services", count: 8 }], devices: [{ label: "mobile", count: 6 }],
    };
    const html = renderToStaticMarkup(<AnalyticsReport report={report} siteId="site" siteName="North Studio" days={7} />);
    expect(html).toContain("Maximum 7 visits per day");
    expect(html).toContain("Daily recorded visits in UTC");
    expect(html).toContain("/services");
    expect(html).toContain("/dashboard/forms?site=site");
    expect(html).toContain("does not attribute submissions to visits");
    expect(html).not.toContain("20%");
  });

  it("formats zero summaries normally and preserves useful precision for small cost details", () => {
    expect(formatAiCost(0)).toBe("$0.00");
    expect(formatAiCost(0, true)).toBe("$0.00");
    expect(formatAiCost(0.0014)).toBe("$0.00");
    expect(formatAiCost(0.0014, true)).toBe("$0.001400");
    expect(formatAiCost(0.0000001, true)).toBe("<$0.000001");
    const html = renderToStaticMarkup(<AiCostReport rows={[]} usage={[]} sites={[]} month="2026-10" currentMonth="2026-11" />);
    expect(html.match(/\$0\.00/g)?.length).toBe(2);
    expect(html).toContain("No client accounts yet");
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it("separates historical recorded costs from current allocation and pending requests", () => {
    const html = renderToStaticMarkup(<AiCostReport
      rows={[{ account_id: accountId, account_name: "Client A", requests: 2, cost_usd: 0.0014 }]}
      usage={[{ account_id: accountId, account_name: "Client A", site_generations: 1, edits: 2, included_generations: 1, included_edits: 1, monthly_site_generations: 0, monthly_edits: 2, pending_requests: 3, extra_credits: 4 }]}
      sites={[{ id: "site", account_id: accountId, name: "Client website", subdomain: "client" }]}
      month="2026-10" currentMonth="2026-11" />);
    expect(html).toContain("$0.001400");
    expect(html).toContain("Costs and API requests: 2026-10");
    expect(html).toContain("current UTC month (2026-11)");
    expect(html).toContain("3 held / awaiting reconciliation");
    expect(html).toContain("No included allowance");
    expect(html).toContain("50%");
    expect(html).toContain("/dashboard/sites/site");
    expect(html).toContain("Estimates, not billing charges");
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it("reports unavailable allocation explicitly rather than substituting zero usage", () => {
    const html = renderToStaticMarkup(<AiCostReport rows={[{ account_id: accountId, account_name: "Client A", requests: 0, cost_usd: 0 }]} usage={null} sites={null} month="2026-11" currentMonth="2026-11" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Could not load current allowances");
    expect(html).toContain("Website list unavailable");
    expect(html).not.toContain("0 held / awaiting reconciliation");
  });
});
