import { notFound } from "next/navigation";
import { Render } from "@puckeditor/core/rsc";
import { TenantFontHints } from "@/components/tenant-font-hints";
import { puckConfig, type PuckPageData } from "@/lib/puck/config";
import { linkContext } from "@/lib/links";
import { siteContacts } from "@/lib/page-navigation";
import { getPremiumTemplate } from "@/lib/templates/catalog";

type Props = { params: Promise<{ templateId: string; slug?: string[] }> };

function rewritePreviewLinks(value: unknown, templateId: string, pageSlugs: Set<string>): unknown {
  if (typeof value === "string" && value.startsWith("/")) {
    const url = new URL(value, "https://template-preview.invalid");
    const slug = url.pathname.replace(/^\/+|\/+$/g, "");
    if (pageSlugs.has(slug)) {
      return `/template-preview/${encodeURIComponent(templateId)}/${slug || "home"}${url.search}${url.hash}`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => rewritePreviewLinks(item, templateId, pageSlugs));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, rewritePreviewLinks(child, templateId, pageSlugs)]),
    );
  }
  return value;
}

export default async function TemplatePreviewPage({ params }: Props) {
  const { templateId, slug = [] } = await params;
  const template = await getPremiumTemplate(templateId);
  if (!template) notFound();

  const requestedSlug = slug.join("/");
  const pageSlug = requestedSlug === "home" ? "" : requestedSlug;
  const page = template.pages.find((candidate) => candidate.slug === pageSlug);
  if (!page) notFound();

  const previewBase = `/template-preview/${encodeURIComponent(template.id)}`;
  const pageSlugs = new Set(template.pages.map(({ slug: pagePath }) => pagePath));
  const data = rewritePreviewLinks(page.data, template.id, pageSlugs) as PuckPageData;
  const siteMenu = {
    links: template.pages.map((item) => ({
      label: item.nav_label,
      href: `${previewBase}/${item.slug || "home"}`,
    })),
    contacts: siteContacts(template.business),
  };

  return <>
    <TenantFontHints />
    <Render
      config={puckConfig}
      data={data}
      metadata={{
        theme: template.theme,
        siteMenu,
        siteLinks: linkContext([]),
        pagePath: `${previewBase}/${page.slug || "home"}`,
      }}
      fieldTransforms={{ richtext: ({ value }) => value }}
    />
  </>;
}
