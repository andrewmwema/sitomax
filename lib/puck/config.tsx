import type {
  Config,
  ComponentConfig,
  DefaultComponentProps,
  WithPuckProps,
} from "@puckeditor/core";
import { buildThemeStyle, type SiteTheme } from "@/lib/theme/presets";
import { fontVariables } from "@/lib/theme/fonts";
import type { BlockDesign } from "@/lib/sections/design";
import { SectionShell } from "@/components/blocks/ui/SectionShell";
import { Hero, type HeroProps } from "@/components/blocks/hero";
import { TextSection, type TextSectionProps } from "@/components/blocks/text-section";
import { ImageWithText, type ImageWithTextProps } from "@/components/blocks/image-with-text";
import { Services, type ServicesProps } from "@/components/blocks/services";
import { Gallery, type GalleryProps } from "@/components/blocks/gallery";
import { Testimonials, type TestimonialsProps } from "@/components/blocks/testimonials";
import { Pricing, type PricingProps } from "@/components/blocks/pricing";
import { Faq, type FaqProps } from "@/components/blocks/faq";
import { CallToAction, type CallToActionProps } from "@/components/blocks/call-to-action";
import { ContactForm, type ContactFormProps } from "@/components/blocks/contact-form";
import { Map, type MapProps } from "@/components/blocks/map";
import { Spacer, type SpacerProps } from "@/components/blocks/spacer";
import { Footer, type FooterProps } from "@/components/blocks/footer";

type Components = {
  Hero: HeroProps;
  TextSection: TextSectionProps;
  ImageWithText: ImageWithTextProps;
  Services: ServicesProps;
  Gallery: GalleryProps;
  Testimonials: TestimonialsProps;
  Pricing: PricingProps;
  Faq: FaqProps;
  CallToAction: CallToActionProps;
  ContactForm: ContactFormProps;
  Map: MapProps;
  Spacer: SpacerProps;
  Footer: FooterProps;
};

export type RootProps = {
  title?: string;
  description?: string;
};

export type PuckConfig = Config<Components, RootProps>;

/**
 * Wraps a block's render in SectionShell, which applies the shared
 * "design" controls (settings, background, border, shadow, animation,
 * spacing) every block exposes via its design field. Centralized here
 * so EVERY registered block gets the same treatment.
 *
 * Puck's ComponentConfig generic uses an exact-type constraint that
 * cannot be abstracted over a type parameter, hence the local `any`;
 * every call site below stays fully typed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withSectionShell<C extends ComponentConfig<any>>(config: C): C {
  const BaseRender = config.render;
  const render = ((
    props: WithPuckProps<DefaultComponentProps & { design?: BlockDesign }> & {
      id: string;
    },
  ) => (
    <SectionShell design={props.design} isEditing={props.puck.isEditing}>
      <BaseRender {...props} />
    </SectionShell>
  )) as C["render"];
  return { ...config, render };
}

/** The Puck data shape produced by this config (pages.draft/published_data). */
export type PuckPageData = import("@puckeditor/core").UserGenerics<PuckConfig>["UserData"];

/**
 * Puck configuration: registers every block in components/blocks/ and the
 * page root. The root applies the site theme (passed as Puck metadata) as
 * CSS variables, so the same theme works in the editor preview and on the
 * public site.
 */
export const puckConfig: PuckConfig = {
  categories: {
    layout: {
      title: "Layout",
      components: ["Hero", "Spacer", "Footer"],
    },
    content: {
      title: "Content",
      components: [
        "TextSection",
        "ImageWithText",
        "Services",
        "Testimonials",
        "Pricing",
        "Faq",
      ],
    },
    media: {
      title: "Media",
      components: ["Gallery", "Map"],
    },
    conversion: {
      title: "Conversion",
      components: ["CallToAction", "ContactForm"],
    },
  },
  root: {
    fields: {
      title: { type: "text", label: "Page title" },
      description: {
        type: "textarea",
        label: "SEO description",
        placeholder: "Shown in search engine results.",
      },
    },
    defaultProps: {
      title: "",
      description: "",
    },
    render: ({ children, puck }) => {
      const theme = (puck.metadata?.theme ?? {}) as SiteTheme;
      return (
        <div
          className={`${fontVariables} flex min-h-screen flex-col antialiased`}
          style={{
            ...buildThemeStyle(theme),
            backgroundColor: "var(--color-bg)",
            color: "var(--color-text)",
            fontFamily: "var(--font-body)",
            lineHeight: 1.6,
          }}
        >
          {children}
        </div>
      );
    },
  },
  components: {
    Hero: withSectionShell(Hero),
    TextSection: withSectionShell(TextSection),
    ImageWithText: withSectionShell(ImageWithText),
    Services: withSectionShell(Services),
    Gallery: withSectionShell(Gallery),
    Testimonials: withSectionShell(Testimonials),
    Pricing: withSectionShell(Pricing),
    Faq: withSectionShell(Faq),
    CallToAction: withSectionShell(CallToAction),
    ContactForm: withSectionShell(ContactForm),
    Map: withSectionShell(Map),
    Spacer: withSectionShell(Spacer),
    Footer: withSectionShell(Footer),
  },
};
