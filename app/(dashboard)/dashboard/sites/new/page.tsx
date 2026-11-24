import Link from "next/link";
import { getSiteAccountOptions } from "@/lib/accounts";
import { instantiateTemplate } from "@/templates/instantiate";
import { templates } from "@/templates";
import { NewSiteWizard } from "@/components/dashboard/new-site-wizard";
import { sectionCatalog, type SectionDesign } from "@/lib/sections/catalog";
import { brand } from "@/lib/brand";
import { ArrowLeft, ArrowRight, Check, LayoutTemplate, MousePointer2, Sparkles } from "lucide-react";

export default async function NewSitePage({ searchParams }: {
  searchParams: Promise<{ method?: string | string[] }>;
}) {
  const accounts = await getSiteAccountOptions();
  const templateMode = (await searchParams).method === "template";
  const sample = { businessName: "Your business", city: "Your city", phone: "0123 456 789", email: "hello@example.com", address: "Your address", services: "your services" };
  const choices = templateMode ? Object.values(templates).map((template) => {
    const hero = instantiateTemplate(template, sample)[0].data.content.find((item) => item.type === "Hero");
    if (!hero) throw new Error(`Missing preview for ${template.key}`);
    const heroMetadata = sectionCatalog.find((design) => design.blockType === hero.type)?.metadata;
    if (!heroMetadata) throw new Error(`Missing section metadata for template hero ${template.key}`);
    return {
      key: template.key, name: template.name, theme: template.theme,
      design: { id: `preview-${template.key}`, name: template.name, blockType: hero.type, category: "Hero",
        props: hero.props, thumbnail: null, styles: ["classic", "modern"],
        description: `Preview of the ${template.name} template hero.`,
        bestFor: ["Template preview"],
        metadata: heroMetadata } satisfies SectionDesign,
    };
  }) : [];
  return <section className="site-creation mx-auto flex w-full max-w-6xl flex-col gap-8">
    <header className="creation-page-header">
      <Link href={templateMode ? "/dashboard/sites/new" : "/dashboard/sites"} className="creation-back-link">
        <ArrowLeft size={15} aria-hidden="true" />{templateMode ? "All creation options" : "Back to sites"}
      </Link>
      <p className="platform-eyebrow">{templateMode ? "Template studio" : "A new beginning"}</p>
      <h1>{templateMode ? "Start with a template" : "Create a site"}</h1>
      <p>{templateMode ? "A curated foundation, personalized with your business details. Make it your own in the editor."
        : "Two great ways to bring a business online. Choose your starting point; make every detail your own."}</p>
    </header>
    {!templateMode ? <>
      <div className="creation-paths">
        <Link href="/dashboard/sites/new/ai" className="creation-path creation-path-ai">
          <span className="creation-path-top"><span className="creation-path-icon"><Sparkles size={23} aria-hidden="true" /></span>
            <span className="creation-pill">Tailored to your business</span></span>
          <div className="creation-preview creation-preview-ai" aria-hidden="true">
            <div className="creation-mini-browser"><span /><span /><span /><i /></div>
            <div className="creation-mini-layout"><div><span className="creation-mini-eyebrow" /><strong>Your next chapter,<br />beautifully online.</strong><span className="creation-mini-line" /><span className="creation-mini-line short" /><span className="creation-mini-button" /></div>
              <div className="creation-mini-art"><Sparkles size={36} /></div></div>
            <span className="creation-preview-label"><Sparkles size={12} />Designed around your business</span>
          </div>
          <h2>Build with AI</h2>
          <p>Tell us about the business. Shape the pages, style and direction, then let AI create an editable first draft.</p>
          <ul>{["Business-led content and layouts", "Choose your pages and visual direction", "Review before anything goes live"].map((item) =>
            <li key={item}><Check size={15} aria-hidden="true" />{item}</li>)}</ul>
          <span className="creation-path-action">Build with AI <ArrowRight size={17} aria-hidden="true" /></span>
        </Link>
        <Link href="/dashboard/sites/new?method=template" className="creation-path">
          <span className="creation-path-top"><span className="creation-path-icon"><LayoutTemplate size={23} aria-hidden="true" /></span>
            <span className="creation-pill">A curated starting point</span></span>
          <div className="creation-preview creation-preview-templates" aria-hidden="true">
            {["Local & welcoming", "Bold & expressive", "Clean & considered"].map((label, index) => <div className={`creation-mini-template creation-mini-template-${index}`} key={label}>
              <span className="creation-mini-eyebrow" /><strong>{label}</strong><span className="creation-mini-template-image" /><span className="creation-mini-line" /><span className="creation-mini-line short" />
            </div>)}
          </div>
          <h2>Start with a template</h2>
          <p>Choose a ready-made design, add the business details and create a complete site you can customize.</p>
          <ul>{["Curated designs for different businesses", "A ready-made four-page structure", "Customize every section in the editor"].map((item) =>
            <li key={item}><Check size={15} aria-hidden="true" />{item}</li>)}</ul>
          <span className="creation-path-action">Explore templates <ArrowRight size={17} aria-hidden="true" /></span>
        </Link>
      </div>
      <p className="creation-choice-note"><MousePointer2 size={16} aria-hidden="true" />Both paths lead to your visual editor. You stay in control of the final result.</p>
    </> : accounts?.length ? <NewSiteWizard accounts={accounts} choices={choices} rootDomain={brand.rootDomain}
      marketingSubdomain={brand.marketingSiteSubdomain} /> :
      <p className="platform-panel p-6 text-sm">Create a <Link className="underline" href="/dashboard/clients">client account</Link> first.</p>}
  </section>;
}
