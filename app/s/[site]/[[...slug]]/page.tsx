import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Render } from "@puckeditor/core/rsc";
import type { Data } from "@puckeditor/core";
import { puckConfig } from "@/lib/puck/config";
import {
  getSiteByHost,
  getSitePage,
  type TenantPage,
  type TenantSite,
} from "@/lib/tenant";

/**
 * PUBLIC tenant site renderer. Reached only via the proxy rewrite:
 *   {subdomain}.ROOT_DOMAIN/{path}  ->  /s/{subdomain}/{path}
 *   {custom-domain}/{path}          ->  /s/{custom-domain}/{path}
 *
 * Renders pages.published_data with Puck, wrapped in the site theme as
 * CSS variables so blocks can use var(--color-primary) etc.
 */

type Params = PageProps<"/s/[site]/[[...slug]]">["params"];

type SiteTheme = {
  colors?: {
    primary?: string;
    secondary?: string;
    background?: string;
    text?: string;
  };
  fonts?: {
    heading?: string;
    body?: string;
  };
};

type PageSeo = {
  title?: string;
  description?: string;
};

/** Loads the site + published page for the request, or null for a 404. */
async function loadPublishedPage(
  params: Params,
): Promise<{ site: TenantSite; page: TenantPage } | null> {
  const { site: siteParam, slug } = await params;
  const site = await getSiteByHost(siteParam);
  if (!site) return null;

  const page = await getSitePage(site.id, slug?.join("/") ?? "");
  if (!page?.published_data) return null;

  return { site, page };
}

function themeToCssVars(theme: SiteTheme): CSSProperties {
  return {
    "--color-primary": theme.colors?.primary ?? "#4f46e5",
    "--color-secondary": theme.colors?.secondary ?? "#0ea5e9",
    "--color-background": theme.colors?.background ?? "#ffffff",
    "--color-text": theme.colors?.text ?? "#18181b",
    "--font-heading": theme.fonts?.heading ?? "inherit",
    "--font-body": theme.fonts?.body ?? "inherit",
  } as CSSProperties;
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const loaded = await loadPublishedPage(params);
  if (!loaded) return {};

  const { site, page } = loaded;
  const seo = (page.seo ?? {}) as PageSeo;
  const title = seo.title || page.title || site.name || site.subdomain;

  return {
    title,
    description: seo.description || undefined,
  };
}

export default async function TenantSitePage({ params }: { params: Params }) {
  const loaded = await loadPublishedPage(params);
  if (!loaded) notFound();

  const { site, page } = loaded;
  const data = page.published_data as Partial<Data>;
  const theme = (site.theme ?? {}) as SiteTheme;

  return (
    <div
      style={{
        ...themeToCssVars(theme),
        backgroundColor: "var(--color-background)",
        color: "var(--color-text)",
        fontFamily: "var(--font-body)",
      }}
      className="flex min-h-screen flex-1 flex-col"
    >
      <Render
        config={puckConfig}
        data={{ content: [], root: {}, ...data } as Data}
      />
    </div>
  );
}
