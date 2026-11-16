import type { Data } from "@puckeditor/core";
import { puckConfig, type RootProps } from "@/lib/puck/config";
import { sectionCatalog } from "@/lib/sections/catalog";
import type { SiteTheme } from "@/lib/theme/presets";
import type { ServicesProps } from "@/components/blocks/services";

type Block = keyof typeof puckConfig.components;
type BlockProps<T extends Block> = Partial<NonNullable<(typeof puckConfig.components)[T]["defaultProps"]>>;
type TemplateData = Data<Record<string, Record<string, unknown>>, RootProps>;

export type WebsiteTemplate = {
  key: string;
  name: string;
  theme: SiteTheme;
  pages: { title: string; slug: string; data: TemplateData }[];
};

type TemplateOptions = {
  key: string;
  name: string;
  theme: SiteTheme;
  hero: { design: string; heading: string; text: string };
  services: { design: string; heading: string; items: ServicesProps["services"] };
  about: { design: string; heading: string; text: string };
  gallery: string;
  cta: string;
  contact: string;
};

function block<T extends Block>(type: T, id: string, props: BlockProps<T>): TemplateData["content"][number] {
  return {
    type,
    props: { ...structuredClone(puckConfig.components[type].defaultProps), ...structuredClone(props), id },
  };
}

function designed<T extends Block>(type: T, designId: string, id: string, props: BlockProps<T> = {}): TemplateData["content"][number] {
  const design = sectionCatalog.find((entry) => entry.id === designId && entry.blockType === type);
  if (!design) throw new Error(`Unknown ${type} template design: ${designId}`);
  return block(type, id, { ...structuredClone(design.props), ...props });
}

export function createTemplate(options: TemplateOptions): WebsiteTemplate {
  const { key } = options;
  const navigation = (slug: string) => block("Navigation", `${key}-${slug}-navigation`, {
    businessName: "{{businessName}}", brandLink: "/",
    links: [{ label: "Home", href: "/" }, { label: "About", href: "/about" }, { label: "Services", href: "/services" }],
    buttonText: "Get in touch", buttonLink: "/contact",
    variant: options.theme.style === "classic" ? "dark" : "light",
  });
  const footer = (slug: string) => designed("Footer", options.theme.style === "classic" ? "footer-columns" : "footer-light-compact", `${key}-${slug}-footer`, {
    businessName: "{{businessName}}", phone: "{{phone}}", email: "{{email}}",
    address: "{{address}}, {{city}}", hours: "[Opening days and hours]",
    navigation: [{ label: "Home", href: "/" }, { label: "About", href: "/about" }, { label: "Services", href: "/services" }, { label: "Contact", href: "/contact" }],
  });
  const services = (slug: string) => designed("Services", options.services.design, `${key}-${slug}-services`, {
    heading: options.services.heading, services: options.services.items,
    text: "<p>Explore a starting point for your project. Ask us about {{services}} and what would suit your needs.</p>",
  });
  const cta = (slug: string) => designed("CallToAction", options.cta, `${key}-${slug}-cta`, {
    heading: "Let's talk about your next step", buttonLink: "/contact", secondaryButtonLink: "/services",
  });
  const about = (slug: string) => designed("ImageWithText", options.about.design, `${key}-${slug}-story`, {
    heading: options.about.heading, text: options.about.text,
  });
  const page = (title: string, slug: string, content: TemplateData["content"]): WebsiteTemplate["pages"][number] => ({
    title, slug,
    data: { root: { props: { title: `${title} | {{businessName}}`, description: `${options.name} in {{city}}. Learn about {{businessName}} and get in touch.` } }, content: [navigation(slug || "home"), ...content, footer(slug || "home")] },
  });

  return {
    key, name: options.name, theme: options.theme,
    pages: [
      page("Home", "", [
        designed("Hero", options.hero.design, `${key}-home-hero`, {
          eyebrow: "Local to {{city}}", heading: options.hero.heading, subheading: options.hero.text,
          badgeText: "", buttonText: "Get in touch", buttonLink: "/contact",
          secondaryButtonText: "Explore our services", secondaryButtonLink: "/services",
        }),
        services("home"),
        designed("Process", "process-step-cards", `${key}-home-process`),
        designed("Testimonials", "testimonials-cards", `${key}-home-reviews`),
        cta("home"),
      ]),
      page("About", "about", [
        about("about"),
        designed("TextSection", "text-mission", `${key}-about-mission`, { text: "<p>To bring a little more care, clarity and considered detail to the places and people around us.</p>", attribution: "{{businessName}} · {{city}}" }),
        designed("Team", "team-photo-cards", `${key}-about-team`),
        cta("about"),
      ]),
      page("Services", "services", [
        designed("TextSection", "text-centered-intro", `${key}-services-intro`, { heading: options.services.heading, text: "<p>Tell us what you need, and we will help you explore the options. Our work starts with a conversation about what matters to you.</p>" }),
        services("services"),
        designed("Gallery", options.gallery, `${key}-services-gallery`),
        cta("services"),
      ]),
      page("Contact", "contact", [
        designed("ContactForm", options.contact, `${key}-contact-form`, {
          heading: "A good place to start", text: "<p>Tell {{businessName}} what you have in mind. We are based in {{city}} and would like to hear your questions.</p>",
          details: [{ icon: "phone", label: "Call", value: "{{phone}}" }, { icon: "mail", label: "Email", value: "{{email}}" }, { icon: "map-pin", label: "Find us", value: "{{address}}, {{city}}" }, { icon: "clock", label: "Hours", value: "[Opening days and hours]" }],
        }),
        designed("Faq", "faq-accordion", `${key}-contact-faq`, { contactButtonLink: "/contact" }),
      ]),
    ],
  };
}
