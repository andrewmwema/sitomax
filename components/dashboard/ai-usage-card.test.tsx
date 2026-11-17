import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiUsageCard } from "./ai-usage-card";

describe("account AI usage card", () => {
  it("distinguishes included quota, completed requests, pending reservations and remaining credits", () => {
    const html = renderToStaticMarkup(createElement(AiUsageCard, {
      usage: {
        account_id: "00000000-0000-4000-8000-000000000001", account_name: "Client A",
        site_generations: 2, edits: 55, included_generations: 1, included_edits: 50,
        pending_requests: 1, monthly_site_generations: 1, monthly_edits: 50, extra_credits: 4,
      },
    }));
    expect(html).toContain("1 / 1");
    expect(html).toContain("50 / 50");
    expect(html).toContain("2 site generations and 55 edits recorded");
    expect(html).toContain("1 requests reserved");
    expect(html).toContain("10 per site, 1 per edit");
    expect(html).not.toMatch(/Anthropic|Claude|Supabase|cost_usd/);
  });
});
