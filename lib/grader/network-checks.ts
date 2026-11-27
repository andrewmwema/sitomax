import { fetchGraderUrl } from "./fetch";
import type { Check } from "./types";

function check(id: string, category: Check["category"], status: Check["status"], value: string | null, detail: string, fix: string): Check {
  return { id, category, status, value, detail, fix };
}

export async function securityChecks(finalUrl: string, tlsSucceeded: boolean): Promise<Check[]> {
  const url = new URL(finalUrl);
  const certificate = check("tls", "security", tlsSucceeded ? "pass" : "unknown",
    tlsSucceeded ? "Valid TLS connection" : null,
    tlsSucceeded ? "The page was fetched over HTTPS with certificate validation." : "Couldn't verify a TLS certificate.",
    "Install a valid TLS certificate for the website.");
  url.protocol = "http:";
  try {
    const result = await fetchGraderUrl(url.href);
    const encrypted = new URL(result.url).protocol === "https:";
    return [certificate, check("https_enforced", "security",
      result.status === 403 || result.status === 429 ? "unknown" : encrypted ? "pass" : "fail",
      result.status === 403 || result.status === 429 ? null : encrypted ? "Redirects to HTTPS" : "HTTP remains accessible",
      result.status === 403 || result.status === 429 ? "Couldn't check HTTP-to-HTTPS redirection."
        : encrypted ? "The HTTP request redirected to HTTPS." : "The HTTP request did not redirect to HTTPS.",
      "Redirect HTTP requests to HTTPS.")];
  } catch {
    return [certificate, check("https_enforced", "security", "unknown", null,
      "Couldn't check HTTP-to-HTTPS redirection.", "Redirect HTTP requests to HTTPS.")];
  }
}

export async function crawlerChecks(finalUrl: string): Promise<Check[]> {
  const base = new URL(finalUrl);
  let robotsStatus: Check["status"] = "unknown";
  let robotsDetail = "Couldn't check robots.txt.";
  let sitemapUrl = new URL("/sitemap.xml", base).href;
  try {
    const robots = await fetchGraderUrl(new URL("/robots.txt", base).href, 512 * 1024);
    if (robots.status === 200) {
      robotsStatus = "pass";
      robotsDetail = "robots.txt is reachable.";
      const declared = robots.body.toString("utf8").match(/^\s*sitemap\s*:\s*(\S+)/im)?.[1];
      if (declared) sitemapUrl = new URL(declared, robots.url).href;
    } else if (robots.status === 404) {
      robotsStatus = "warn";
      robotsDetail = "robots.txt returned 404.";
    }
  } catch {
    console.warn("Could not fetch robots.txt for a grader report");
  }
  let sitemapStatus: Check["status"] = "unknown";
  let sitemapDetail = "Couldn't check the sitemap.";
  try {
    const sitemap = await fetchGraderUrl(sitemapUrl, 3 * 1024 * 1024);
    if (sitemap.status === 200 && /<(?:\w+:)?(?:urlset|sitemapindex)\b/i.test(sitemap.body.toString("utf8", 0, 16_384))) {
      sitemapStatus = "pass";
      sitemapDetail = "A sitemap was reachable.";
    } else if (sitemap.status === 404) {
      sitemapStatus = "warn";
      sitemapDetail = "The sitemap URL returned 404.";
    } else if (sitemap.status === 200) {
      sitemapStatus = "warn";
      sitemapDetail = "The sitemap URL did not return recognizable sitemap XML.";
    }
  } catch {
    console.warn("Could not fetch sitemap for a grader report");
  }
  return [
    check("robots_txt", "seo", robotsStatus, robotsStatus === "unknown" ? null : robotsDetail, robotsDetail,
      "Make a suitable robots.txt available for search crawlers."),
    check("sitemap", "seo", sitemapStatus, sitemapStatus === "unknown" ? null : sitemapDetail, sitemapDetail,
      "Publish a valid XML sitemap and declare it in robots.txt."),
  ];
}
