import type {
  Config,
  ComponentConfig,
  DefaultComponentProps,
  WithPuckProps,
  CustomField,
} from "@puckeditor/core";
import { buildThemeStyle, themeFonts, type SiteTheme } from "@/lib/theme/presets";
import { googleFontsUrl } from "@/lib/theme/fonts";
import type { BlockDesign, DesignLevel } from "@/lib/sections/design";
import { SectionShell } from "@/components/blocks/ui/SectionShell";
import { hasMobileStickyCta, MobileStickyCTA } from "@/components/blocks/ui/mobile-sticky-cta";
import { PhotoCredits } from "@/components/blocks/ui/photo-credits";
import { ImageUploadField } from "@/components/editor/image-upload-field";
import { Hero, type HeroProps } from "@/components/blocks/hero";
import { TextSection, type TextSectionProps } from "@/components/blocks/text-section";
import { ImageWithText, type ImageWithTextProps } from "@/components/blocks/image-with-text";
import { Services, type ServicesProps } from "@/components/blocks/services";
import { Stats, type StatsProps } from "@/components/blocks/stats";
import { Gallery, type GalleryProps } from "@/components/blocks/gallery";
import { Testimonials, type TestimonialsProps } from "@/components/blocks/testimonials";
import { Logos, type LogosProps } from "@/components/blocks/logos";
import { Team, type TeamProps } from "@/components/blocks/team";
import { Process, type ProcessProps } from "@/components/blocks/process";
import { Pricing, type PricingProps } from "@/components/blocks/pricing";
import { ComparisonTable, type ComparisonTableProps } from "@/components/blocks/comparison-table";
import { Faq, type FaqProps } from "@/components/blocks/faq";
import { CallToAction, type CallToActionProps } from "@/components/blocks/call-to-action";
import { ContactForm, type ContactFormProps } from "@/components/blocks/contact-form";
import { Map, type MapProps } from "@/components/blocks/map";
import { Spacer, type SpacerProps } from "@/components/blocks/spacer";
import { Footer, type FooterProps } from "@/components/blocks/footer";
import { BlogPosts, type BlogPostsProps } from "@/components/blocks/blog-posts";
import { Navigation, type NavigationProps } from "@/components/blocks/navigation";
import { SiteHeader } from "@/components/header/site-header";
import { headerSchema, type SiteHeaderData } from "@/lib/header";
import { emptyBusiness } from "@/lib/business";
import { LayoutSection, type LayoutSectionProps } from "@/components/blocks/layout/section";
import { Row, type RowProps } from "@/components/blocks/layout/row";
import { Column, type ColumnProps } from "@/components/blocks/layout/column";
import { HeadingElement, type HeadingElementProps } from "@/components/blocks/elements/heading";
import { TextElement, type TextElementProps } from "@/components/blocks/elements/text";
import { ButtonElement, type ButtonElementProps } from "@/components/blocks/elements/button";
import { ImageElement, type ImageElementProps } from "@/components/blocks/elements/image";
import { IconElement, type IconElementProps } from "@/components/blocks/elements/icon";
import { IconListElement, type IconListElementProps } from "@/components/blocks/elements/icon-list";
import { VideoElement, type VideoElementProps } from "@/components/blocks/elements/video";
import { DividerElement, type DividerElementProps } from "@/components/blocks/elements/divider";
import {
  VerticalSpaceElement,
  type VerticalSpaceElementProps,
} from "@/components/blocks/elements/vertical-space";
import {
  SocialIconsElement,
  type SocialIconsElementProps,
} from "@/components/blocks/elements/social-icons";
import { MapEmbedElement, type MapEmbedElementProps } from "@/components/blocks/elements/map-embed";
import { FormElement, type FormElementProps } from "@/components/blocks/elements/form";
import { CountdownElement, type CountdownElementProps } from "@/components/blocks/elements/countdown";
import { BadgeElement, type BadgeElementProps } from "@/components/blocks/elements/badge";
import {
  StatNumberElement,
  type StatNumberElementProps,
} from "@/components/blocks/elements/stat-number";
import { EmbedElement, type EmbedElementProps } from "@/components/blocks/elements/embed";

type Components = {
  Hero: HeroProps;
  TextSection: TextSectionProps;
  ImageWithText: ImageWithTextProps;
  Services: ServicesProps;
  Stats: StatsProps;
  Gallery: GalleryProps;
  Testimonials: TestimonialsProps;
  Logos: LogosProps;
  Team: TeamProps;
  Process: ProcessProps;
  Pricing: PricingProps;
  ComparisonTable: ComparisonTableProps;
  Faq: FaqProps;
  CallToAction: CallToActionProps;
  ContactForm: ContactFormProps;
  Map: MapProps;
  Spacer: SpacerProps;
  Footer: FooterProps;
  BlogPosts: BlogPostsProps;
  Navigation: NavigationProps;
  // Custom layout system (Section → Row → Column → elements).
  Section: LayoutSectionProps;
  Row: RowProps;
  Column: ColumnProps;
  Heading: HeadingElementProps;
  Text: TextElementProps;
  Button: ButtonElementProps;
  Image: ImageElementProps;
  Icon: IconElementProps;
  IconList: IconListElementProps;
  Video: VideoElementProps;
  Divider: DividerElementProps;
  VerticalSpace: VerticalSpaceElementProps;
  SocialIcons: SocialIconsElementProps;
  MapEmbed: MapEmbedElementProps;
  Form: FormElementProps;
  Countdown: CountdownElementProps;
  Badge: BadgeElementProps;
  StatNumber: StatNumberElementProps;
  Embed: EmbedElementProps;
};

export type RootProps = {
  __editorTheme?: SiteTheme;
  __editorHeader?: SiteHeaderData;
  hideHeader?: boolean;
  transparentHeader?: boolean;
  __legacyNavigation?: boolean;
  title?: string;
  seoTitle?: string;
  description?: string;
  socialImage?: string;
  indexing?: "inherit" | "index" | "noindex";
};

export type PuckConfig = Config<Components, RootProps>;

function socialImageRootField(): CustomField<string | undefined> {
  return {
    type: "custom",
    label: "Social share image",
    render: ({ value, onChange, readOnly }) => (
      <ImageUploadField value={value ?? ""} onChange={onChange} readOnly={readOnly} />
    ),
  };
}

/**
 * Wraps a block's render in SectionShell, which applies the shared
 * "design" controls (settings, background, border, shadow, animation,
 * spacing) every block exposes via its design field. Centralized here
 * so EVERY registered block gets the same treatment.
 *
 * Layout-system components are `inline` (no extra editor wrapper), so
 * the shell itself carries Puck's drag ref and the editor DOM matches
 * the published DOM exactly.
 *
 * Puck's ComponentConfig generic uses an exact-type constraint that
 * cannot be abstracted over a type parameter, hence the local `any`;
 * every call site below stays fully typed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withSectionShell<C extends ComponentConfig<any>>(
  config: C,
  level: DesignLevel = "section",
): C {
  const BaseRender = config.render;
  const render = ((
    props: WithPuckProps<DefaultComponentProps & { design?: BlockDesign; photoCredits?: unknown }> & {
      id: string;
    },
  ) => (
    <SectionShell
      design={props.design}
      isEditing={props.puck.isEditing}
      blockId={props.id}
      level={level}
      dragRef={config.inline ? props.puck.dragRef : undefined}
    >
      <BaseRender {...props} />
      <PhotoCredits credits={props.photoCredits} />
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
        "Stats",
        "Testimonials",
        "Logos",
        "Team",
        "Process",
        "Pricing",
        "ComparisonTable",
        "Faq",
        "BlogPosts",
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
    customLayout: {
      title: "Layout blocks",
      components: ["Section", "Row"],
    },
    elements: {
      title: "Elements",
      components: [
        "Heading",
        "Text",
        "Button",
        "Image",
        "Icon",
        "IconList",
        "Divider",
        "VerticalSpace",
        "Badge",
        "StatNumber",
      ],
    },
    widgets: {
      title: "Media & widgets",
      components: ["Video", "SocialIcons", "MapEmbed", "Form", "Countdown", "Embed"],
    },
    // Columns are managed by their row's column preset.
    internal: {
      title: "Internal",
      components: ["Column", "Navigation"],
      visible: false,
    },
  },
  root: {
    fields: {
      title: { type: "text", label: "Page title" },
      hideHeader: { type: "radio", label: "Hide header on this page", options: [{ label: "No", value: false }, { label: "Yes", value: true }] },
      transparentHeader: { type: "radio", label: "Transparent header over hero", options: [{ label: "No", value: false }, { label: "Yes", value: true }] },
      seoTitle: { type: "text", label: "SEO title (optional)" },
      description: {
        type: "textarea",
        label: "SEO description",
        placeholder: "Shown in search engine results.",
      },
      socialImage: socialImageRootField(),
      indexing: { type: "radio", label: "Search visibility", options: [
        { label: "Site default", value: "inherit" }, { label: "Index", value: "index" }, { label: "Hide", value: "noindex" },
      ] },
    },
    defaultProps: {
      title: "",
      seoTitle: "",
      description: "",
      socialImage: "",
      indexing: "inherit",
    },
    render: ({ children, puck, __editorTheme, __editorHeader, hideHeader, transparentHeader, __legacyNavigation }) => {
      const theme = (puck.isEditing && __editorTheme) || (puck.metadata?.theme ?? {}) as SiteTheme;
      const rawHeader = puck.isEditing ? __editorHeader : puck.metadata?.siteHeader;
      const header = rawHeader ? headerSchema.parse(rawHeader) : undefined;
      const headerView = header && !hideHeader && !__legacyNavigation ? <SiteHeader header={header}
        menu={puck.metadata?.siteMenu ?? { links: [], contacts: emptyBusiness }}
        links={puck.metadata?.siteLinks ?? { pages: {} }} path={puck.metadata?.pagePath}
        transparent={transparentHeader} editing={puck.isEditing} /> : null;
      return (
        <div
          className="site-content flex min-h-screen min-w-0 flex-col antialiased"
          data-site-style={theme.style === "modern" ? "modern" : "classic"}
          data-mobile-sticky-cta={hasMobileStickyCta(theme.mobileStickyCta) ? "true" : undefined}
          style={{
            ...buildThemeStyle(theme),
            position: "relative",
            backgroundColor: "var(--color-bg)",
            color: "var(--color-text)",
            fontFamily: "var(--font-body)",
            lineHeight: 1.6,
          }}
        >
          <link rel="stylesheet" href={googleFontsUrl(themeFonts(theme))} />
          {puck.isEditing && typeof puck.metadata?.renderHeader === "function"
            ? puck.metadata.renderHeader(headerView) : headerView}
          <main id={header ? "site-main-content" : undefined} className="flex flex-1 flex-col" tabIndex={-1}>{children}</main>
          <MobileStickyCTA settings={theme.mobileStickyCta} />
        </div>
      );
    },
  },
  components: {
    Hero: withSectionShell(Hero),
    TextSection: withSectionShell(TextSection),
    ImageWithText: withSectionShell(ImageWithText),
    Services: withSectionShell(Services),
    Stats: withSectionShell(Stats),
    Gallery: withSectionShell(Gallery),
    Testimonials: withSectionShell(Testimonials),
    Logos: withSectionShell(Logos),
    Team: withSectionShell(Team),
    Process: withSectionShell(Process),
    Pricing: withSectionShell(Pricing),
    ComparisonTable: withSectionShell(ComparisonTable),
    Faq: withSectionShell(Faq),
    CallToAction: withSectionShell(CallToAction),
    ContactForm: withSectionShell(ContactForm),
    Map: withSectionShell(Map),
    Spacer: withSectionShell(Spacer),
    Footer: withSectionShell(Footer),
    BlogPosts: withSectionShell(BlogPosts),
    Navigation: withSectionShell(Navigation),
    Section: withSectionShell(LayoutSection),
    Row: withSectionShell(Row, "row"),
    Column: withSectionShell(Column, "column"),
    Heading: withSectionShell(HeadingElement, "element"),
    Text: withSectionShell(TextElement, "element"),
    Button: withSectionShell(ButtonElement, "element"),
    Image: withSectionShell(ImageElement, "element"),
    Icon: withSectionShell(IconElement, "element"),
    IconList: withSectionShell(IconListElement, "element"),
    Video: withSectionShell(VideoElement, "element"),
    Divider: withSectionShell(DividerElement, "element"),
    VerticalSpace: withSectionShell(VerticalSpaceElement, "element"),
    SocialIcons: withSectionShell(SocialIconsElement, "element"),
    MapEmbed: withSectionShell(MapEmbedElement, "element"),
    Form: withSectionShell(FormElement, "element"),
    Countdown: withSectionShell(CountdownElement, "element"),
    Badge: withSectionShell(BadgeElement, "element"),
    StatNumber: withSectionShell(StatNumberElement, "element"),
    Embed: withSectionShell(EmbedElement, "element"),
  },
};
