import type { HeroProps } from "@/components/blocks/hero";
import type { TextSectionProps } from "@/components/blocks/text-section";
import type { ImageWithTextProps } from "@/components/blocks/image-with-text";
import type { ServicesProps } from "@/components/blocks/services";
import type { GalleryProps } from "@/components/blocks/gallery";
import type { TestimonialsProps } from "@/components/blocks/testimonials";
import type { PricingProps } from "@/components/blocks/pricing";
import type { FaqProps } from "@/components/blocks/faq";
import type { CallToActionProps } from "@/components/blocks/call-to-action";
import type { ContactFormProps } from "@/components/blocks/contact-form";
import type { MapProps } from "@/components/blocks/map";
import type { FooterProps } from "@/components/blocks/footer";
import type { AnimationType, BlockDesign } from "@/lib/sections/design";

/**
 * Section design library: curated, ready-to-insert presets for every
 * block, shown in the "Add section" gallery. The agency can add more
 * designs at runtime via "Save as design" (stored in section_designs).
 */

export const SECTION_CATEGORIES = [
  "Hero",
  "Features/Services",
  "About",
  "Text",
  "Stats",
  "Process",
  "Testimonials",
  "Pricing",
  "Team",
  "Gallery",
  "Logos",
  "FAQ",
  "Call to action",
  "Contact",
  "Footer",
] as const;

export type SectionCategory = (typeof SECTION_CATEGORIES)[number];

export type SiteStyle = "classic" | "modern";

export type SectionDesign = {
  id: string;
  /** Puck component type this design inserts (must exist in puckConfig). */
  blockType: string;
  category: SectionCategory;
  name: string;
  /** Static thumbnail URL; null = render a live preview (1280px, scaled). */
  thumbnail: string | null;
  /**
   * Complete preset props for the block. Once the SectionShell design
   * controls land (Phase 4b prompt C), presets include its "design"
   * object here too — inserted props always merge over defaultProps.
   */
  props: Record<string, unknown>;
  /** Site styles this design looks good in. */
  styles: SiteStyle[];
};

type BlockPropsMap = {
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
  Footer: FooterProps;
};

/**
 * Typed builder so every preset is checked against its block's props.
 * Presets are Partial: inserted props always merge over the block's
 * defaultProps (see buildDesignItem / DesignThumbnail), so a preset only
 * lists what the design changes.
 */
function design<T extends keyof BlockPropsMap>(entry: {
  id: string;
  blockType: T;
  category: SectionCategory;
  name: string;
  props: Partial<BlockPropsMap[T]>;
  thumbnail?: string | null;
  styles?: SiteStyle[];
}): SectionDesign {
  return {
    thumbnail: entry.thumbnail ?? null,
    styles: entry.styles ?? ["classic", "modern"],
    ...entry,
    props: entry.props as unknown as Record<string, unknown>,
  };
}

/**
 * Complete SectionShell "design" object for catalog presets: theme-driven
 * background (none = the block's own Section background, which adapts to
 * every palette), default spacing from --section-pad, and a subtle
 * entrance animation. Anchor IDs give menu links like #pricing out of
 * the box and stay editable per section.
 */
function shellDesign(
  options: {
    anchorId?: string;
    animation?: AnimationType | "none";
    background?: NonNullable<BlockDesign["background"]>;
    textColor?: BlockDesign["textColor"];
  } = {},
): BlockDesign {
  const {
    anchorId,
    animation = "fade-up",
    background = { type: "none" },
    textColor = "auto",
  } = options;
  return {
    settings: {
      fullBleed: true,
      ...(anchorId ? { anchorId } : null),
      hideOnDesktop: false,
      hideOnTablet: false,
      hideOnMobile: false,
    },
    background,
    border: { width: 0, radius: 0 },
    shadow: "none",
    textColor,
    animation:
      animation === "none"
        ? { trigger: "none", type: "fade", duration: 600, delay: 0 }
        : { trigger: "entrance", type: animation, duration: 600, delay: 0 },
    spacing: { desktop: {}, tablet: {}, mobile: {} },
  };
}

/**
 * Built-in catalog. Categories without designs yet (Stats, Process,
 * Team, Logos) are filled by the Phase 4b design batches as new blocks
 * and presets are added — the gallery handles empty categories.
 */
export const sectionCatalog: SectionDesign[] = [
  // ------------------------------------------------------------- Hero
  design({
    id: "hero-split-image",
    blockType: "Hero",
    category: "Hero",
    name: "Split with image",
    props: {
      eyebrow: "Family owned since [2004]",
      heading: "Quality work, done right the first time",
      subheading:
        "From small repairs to full projects, our certified team shows up on time and leaves your place spotless.",
      buttonText: "Get a free quote",
      buttonLink: "/contact",
      secondaryButtonText: "See our work",
      secondaryButtonLink: "#gallery",
      backgroundImage: "/samples/team-at-work.jpg",
      secondaryImage: "",
      variant: "split",
      design: shellDesign({ animation: "fade" }),
    },
  }),
  design({
    id: "hero-centered-badge",
    blockType: "Hero",
    category: "Hero",
    name: "Centered with badge",
    props: {
      eyebrow: "",
      badgeText: "Rated [4.9]/5 by [300]+ local customers",
      heading: "Five-star service, right around the corner",
      subheading:
        "From the first call to the final clean-up, we make every job simple, tidy and stress-free — and we back it in writing.",
      buttonText: "Book a free visit",
      buttonLink: "/contact",
      secondaryButtonText: "See our services",
      secondaryButtonLink: "#services",
      backgroundImage: "",
      secondaryImage: "",
      variant: "centered",
      design: shellDesign({ animation: "fade" }),
    },
  }),
  design({
    id: "hero-overlay-photo",
    blockType: "Hero",
    category: "Hero",
    name: "Photo with overlay",
    props: {
      eyebrow: "Serving the area for over [20] years",
      heading: "Craftsmanship you can see, service you can count on",
      subheading:
        "Licensed, insured and recommended by your neighbours. Tell us about your project and get a clear, fixed quote.",
      buttonText: "Request a quote",
      buttonLink: "/contact",
      secondaryButtonText: "Explore our services",
      secondaryButtonLink: "#services",
      backgroundImage: "/samples/home-exterior.jpg",
      secondaryImage: "",
      variant: "overlay",
      design: shellDesign({ animation: "fade" }),
    },
  }),
  design({
    id: "hero-video-background",
    blockType: "Hero",
    category: "Hero",
    name: "Video background",
    props: {
      eyebrow: "See us in action",
      heading: "Work that speaks for itself",
      subheading:
        "Every project starts with a conversation. Tell us what you have in mind and we'll take it from there.",
      buttonText: "Start your project",
      buttonLink: "/contact",
      secondaryButtonText: "",
      secondaryButtonLink: "",
      backgroundImage: "",
      secondaryImage: "",
      variant: "centered",
      // The video slot ships with a sample poster photo and a 55% dark
      // overlay, so it looks finished immediately; paste a YouTube or
      // Vimeo URL (or upload a clip) in Design → Style → Background and
      // the poster becomes the loading frame.
      design: shellDesign({
        animation: "fade",
        background: {
          type: "video",
          overlayColor: "#0a0e14",
          overlayOpacity: 55,
          video: { poster: "/samples/kitchen.jpg" },
        },
      }),
    },
  }),
  design({
    id: "hero-lead-form",
    blockType: "Hero",
    category: "Hero",
    name: "With lead form",
    props: {
      eyebrow: "Free, no-obligation quotes",
      heading: "Tell us about your project today",
      subheading:
        "Fill in the form and a friendly expert will call you back within one business day — no pressure, no obligation.",
      buttonText: "",
      buttonLink: "",
      secondaryButtonText: "",
      secondaryButtonLink: "",
      backgroundImage: "",
      secondaryImage: "",
      variant: "lead-form",
      formName: "quote",
      submitText: "Get my free quote",
      formFields: [
        { label: "Name", fieldType: "text", required: true },
        { label: "Phone", fieldType: "tel", required: false },
        { label: "Email", fieldType: "email", required: true },
      ],
      design: shellDesign({ animation: "fade" }),
    },
  }),
  design({
    id: "hero-stats-row",
    blockType: "Hero",
    category: "Hero",
    name: "With stats row",
    props: {
      eyebrow: "Local, licensed and insured",
      heading: "Big-company standards, small-company care",
      subheading:
        "We've built our reputation one job at a time. Here's what that looks like after two decades of showing up for our customers.",
      buttonText: "Get a free quote",
      buttonLink: "/contact",
      secondaryButtonText: "See our work",
      secondaryButtonLink: "#gallery",
      backgroundImage: "/samples/home-interior.jpg",
      secondaryImage: "/samples/happy-customer.jpg",
      variant: "stats",
      stats: [
        { value: "[20]+", label: "Years in business" },
        { value: "[1,500]+", label: "Projects completed" },
        { value: "[4.9]/5", label: "Average customer rating" },
        { value: "[100]%", label: "Satisfaction guarantee" },
      ],
      design: shellDesign({ animation: "fade" }),
    },
  }),

  // -------------------------------------------- Features / Services
  design({
    id: "services-icon-grid",
    blockType: "Services",
    category: "Features/Services",
    name: "Icon grid",
    props: {
      eyebrow: "What we do",
      heading: "Services built around you",
      services: [
        {
          icon: "wrench",
          title: "Repairs & maintenance",
          text: "<p>Fast, tidy repairs with upfront pricing — no surprises on the invoice.</p>",
        },
        {
          icon: "clock",
          title: "Same-week scheduling",
          text: "<p>Book online or by phone and get a confirmed slot within days, not weeks.</p>",
        },
        {
          icon: "shield-check",
          title: "Guaranteed work",
          text: "<p>Every job is backed by a [12]-month workmanship guarantee, in writing.</p>",
        },
      ],
      variant: "grid",
      design: shellDesign({ anchorId: "services" }),
    },
  }),
  design({
    id: "services-icon-list",
    blockType: "Services",
    category: "Features/Services",
    name: "Icon list",
    props: {
      eyebrow: "Why choose us",
      heading: "Everything handled, start to finish",
      services: [
        {
          icon: "phone",
          title: "Free consultation",
          text: "<p>Talk through your project with an expert and get honest advice before you commit.</p>",
        },
        {
          icon: "star",
          title: "Top-rated team",
          text: "<p>Rated [five stars] by local customers for quality, punctuality and clean work.</p>",
        },
        {
          icon: "home",
          title: "Respect for your home",
          text: "<p>Dust sheets down, shoes off, and everything left exactly how we found it.</p>",
        },
      ],
      variant: "list",
      design: shellDesign({ anchorId: "services" }),
    },
  }),

  // ------------------------------------------------------------ About
  design({
    id: "about-image-right",
    blockType: "ImageWithText",
    category: "About",
    name: "Image with story",
    props: {
      image: "",
      imageAlt: "",
      eyebrow: "About us",
      heading: "A local team that cares",
      text: "<p>We started with one van and a simple promise: do great work and treat every customer like a neighbour. Today our team serves the whole area — same promise, same care.</p>",
      variant: "image-right",
      design: shellDesign({ anchorId: "about" }),
    },
  }),
  design({
    id: "about-centered-statement",
    blockType: "TextSection",
    category: "About",
    name: "Centered statement",
    props: {
      eyebrow: "Our story",
      heading: "Built on word of mouth",
      text: "<p>Most of our customers come from recommendations. We believe that says more than any ad could — quality work speaks for itself.</p>",
      variant: "centered",
      design: shellDesign({ anchorId: "about", animation: "fade" }),
    },
  }),
  design({
    id: "about-two-column",
    blockType: "TextSection",
    category: "About",
    name: "Two-column text",
    props: {
      eyebrow: "Who we are",
      heading: "More than [20] years of experience",
      text: "<p>Our certified team has handled every kind of project, from quick fixes to complete renovations.</p><p>We keep you informed at every step, stick to the schedule, and never charge for anything we haven't agreed up front.</p>",
      variant: "two-column",
      design: shellDesign({ anchorId: "about" }),
    },
  }),

  // ------------------------------------------------------------- Text
  design({
    id: "text-centered-intro",
    blockType: "TextSection",
    category: "Text",
    name: "Centered intro",
    props: {
      eyebrow: "Welcome",
      heading: "A local team with a simple promise",
      text: "<p>Do great work, charge a fair price and treat every home like our own. That promise has guided us since [2010], and it's why neighbours keep passing our number along.</p>",
      variant: "intro",
      design: shellDesign({ animation: "fade" }),
    },
  }),
  design({
    id: "text-side-heading",
    blockType: "TextSection",
    category: "Text",
    name: "Side heading + body",
    props: {
      eyebrow: "Our approach",
      heading: "What working with us looks like",
      text: "<p>Every job starts with a conversation and a clear, written quote — no surprises, no pressure.</p><ul><li>One point of contact from the first call to the final walk-through</li><li>Tidy workmanship, protected floors and a spotless handover</li><li>Honest advice, even when the answer is &quot;you don't need us for that&quot;</li></ul>",
      variant: "two-column",
      design: shellDesign(),
    },
  }),
  design({
    id: "text-mission",
    blockType: "TextSection",
    category: "Text",
    name: "Mission statement",
    props: {
      eyebrow: "Our mission",
      heading: "",
      text: "<p>Every family deserves an honest trade: clear prices, tidy work and a team that treats your home with the respect it deserves.</p>",
      variant: "mission",
      attribution: "[Jordan Smith], founder",
      design: shellDesign({ animation: "fade" }),
    },
  }),
  design({
    id: "text-two-column-article",
    blockType: "TextSection",
    category: "Text",
    name: "Two-column article",
    props: {
      eyebrow: "Our story",
      heading: "From one van to a trusted local name",
      text: "<p>We started out with a single van, a toolbox and a belief that good work speaks for itself. The first customers came from friends and family; the next came from their recommendations.</p><p>As the jobs grew, so did the team — but the way we work hasn't changed. We still answer our own phones, show up when we say we will and walk every customer through the work before we start.</p><p>Today you'll see our vans across the area, and we're proud that most of our work still comes the old-fashioned way: from people telling their neighbours about us.</p>",
      variant: "columns",
      design: shellDesign(),
    },
  }),
  design({
    id: "text-callout",
    blockType: "TextSection",
    category: "Text",
    name: "Text with callout box",
    props: {
      eyebrow: "Peace of mind",
      heading: "Quality work, backed in writing",
      text: "<p>Nobody should have to chase a tradesperson after the invoice is paid. That's why every job we complete comes with a written guarantee — and why we're still here when you call.</p><p>If something isn't right, we come back and fix it. It's that simple.</p>",
      variant: "callout",
      calloutIcon: "shield-check",
      calloutTitle: "Our [12]-month guarantee",
      calloutText: "<p>If any of our workmanship fails within [12] months, we return and make it right — free of charge, no quibbles.</p>",
      design: shellDesign(),
    },
  }),
  design({
    id: "text-pull-quote",
    blockType: "TextSection",
    category: "Text",
    name: "With pull quote",
    props: {
      eyebrow: "Why neighbours choose us",
      heading: "Service people talk about",
      text: "<p>We measure success by what customers say once the dust sheets are folded and the van has pulled away. Not the day the invoice is paid — months later, when the work has been lived with.</p><p>That's why we never rush a job or cut corners on materials. A tidy finish and a straight answer cost nothing extra, and they're the reason so much of our work comes from referrals.</p><p>Whether it's a small repair or a full renovation, you get the same crew, the same care and the same standard we'd want in our own homes.</p>",
      variant: "pull-quote",
      pullQuote: "“[They arrived when they said they would — and the finish is perfect.]”",
      design: shellDesign(),
    },
  }),
  design({
    id: "text-article",
    blockType: "TextSection",
    category: "Text",
    name: "Long-form article",
    props: {
      eyebrow: "Our story",
      heading: "How it all started",
      text: "<p>It began with a borrowed ladder, a second-hand van and a promise to a first customer: if the work isn't right, you don't pay. That first job led to a second, the second to a street's worth, and the business grew the only way we wanted it to — by word of mouth.</p><h3>Growing without losing our way</h3><p>Taking on a team meant writing down the things we'd always done by instinct: call back the same day, protect the floors, explain the work in plain language and never leave a mess behind.</p><p>Those habits are now the standard for everyone who wears our shirt. The tools have improved and the vans have multiplied since [2010], but the promise from that first job hasn't changed at all.</p>",
      variant: "article",
      design: shellDesign(),
    },
  }),
  design({
    id: "text-cta",
    blockType: "TextSection",
    category: "Text",
    name: "Heading, text + button",
    props: {
      eyebrow: "Ready when you are",
      heading: "Let's talk about your project",
      text: "<p>Tell us what you have in mind and we'll give you honest advice and a clear, fixed quote — free, and with no obligation.</p>",
      variant: "cta",
      ctaAlign: "center",
      buttonText: "Get a free quote",
      buttonLink: "/contact",
      secondaryButtonText: "See our services",
      secondaryButtonLink: "#services",
      design: shellDesign({ animation: "fade" }),
    },
  }),

  // ----------------------------------------------------- Testimonials
  design({
    id: "testimonials-cards",
    blockType: "Testimonials",
    category: "Testimonials",
    name: "Review cards",
    props: {
      eyebrow: "Testimonials",
      heading: "What our customers say",
      testimonials: [
        {
          quote: "They did a fantastic job from start to finish. On time, on budget and spotless.",
          name: "Alex P.",
          role: "Homeowner",
        },
        {
          quote: "Fast, friendly and professional. The only company we call now.",
          name: "Sam R.",
          role: "Local business",
        },
      ],
      variant: "cards",
      design: shellDesign({ anchorId: "reviews" }),
    },
  }),
  design({
    id: "testimonials-quotes",
    blockType: "Testimonials",
    category: "Testimonials",
    name: "Large quotes",
    props: {
      eyebrow: "Don't take our word for it",
      heading: "Loved by the neighbourhood",
      testimonials: [
        {
          quote: "The best decision we made on the whole renovation. Worth every penny.",
          name: "Jordan K.",
          role: "Homeowner",
        },
      ],
      variant: "quotes",
      design: shellDesign({ anchorId: "reviews", animation: "fade" }),
    },
  }),

  // ---------------------------------------------------------- Pricing
  design({
    id: "pricing-three-cards",
    blockType: "Pricing",
    category: "Pricing",
    name: "Three cards, highlighted plan",
    props: {
      eyebrow: "Pricing",
      heading: "Simple, honest pricing",
      plans: [
        {
          name: "Essential",
          price: "$49",
          period: "per visit",
          features: "Standard call-out\nUpfront quote\n[12]-month guarantee",
          buttonText: "Choose plan",
          buttonLink: "/contact",
          highlighted: false,
        },
        {
          name: "Complete",
          price: "$99",
          period: "per visit",
          features: "Everything in Essential\nPriority scheduling\nFree annual check-up",
          buttonText: "Choose plan",
          buttonLink: "/contact",
          highlighted: true,
        },
        {
          name: "Business",
          price: "Custom",
          period: "tailored quote",
          features: "Everything in Complete\nDedicated account manager\nSame-day response",
          buttonText: "Talk to us",
          buttonLink: "/contact",
          highlighted: false,
        },
      ],
      variant: "cards",
      design: shellDesign({ anchorId: "pricing" }),
    },
  }),
  design({
    id: "pricing-simple-columns",
    blockType: "Pricing",
    category: "Pricing",
    name: "Simple columns",
    props: {
      eyebrow: "Plans",
      heading: "Pick what fits",
      plans: [
        {
          name: "One-off",
          price: "$79",
          period: "single job",
          features: "Fixed quote\nNo hidden fees",
          buttonText: "Book now",
          buttonLink: "/contact",
          highlighted: false,
        },
        {
          name: "Care plan",
          price: "$19",
          period: "per month",
          features: "Two visits a year\nPriority call-outs\nMember discounts",
          buttonText: "Join the plan",
          buttonLink: "/contact",
          highlighted: true,
        },
      ],
      variant: "simple",
      design: shellDesign({ anchorId: "pricing" }),
    },
  }),

  // ---------------------------------------------------------- Gallery
  design({
    id: "gallery-grid",
    blockType: "Gallery",
    category: "Gallery",
    name: "Square grid",
    props: {
      eyebrow: "Our work",
      heading: "Recent projects",
      images: [
        { url: "", alt: "" },
        { url: "", alt: "" },
        { url: "", alt: "" },
        { url: "", alt: "" },
        { url: "", alt: "" },
        { url: "", alt: "" },
      ],
      columns: "3",
      variant: "grid",
      design: shellDesign({ anchorId: "gallery" }),
    },
  }),
  design({
    id: "gallery-masonry",
    blockType: "Gallery",
    category: "Gallery",
    name: "Masonry",
    props: {
      eyebrow: "Portfolio",
      heading: "A look at what we do",
      images: [
        { url: "", alt: "" },
        { url: "", alt: "" },
        { url: "", alt: "" },
        { url: "", alt: "" },
        { url: "", alt: "" },
      ],
      columns: "3",
      variant: "masonry",
      design: shellDesign({ anchorId: "gallery", animation: "fade" }),
    },
  }),

  // -------------------------------------------------------------- FAQ
  design({
    id: "faq-accordion",
    blockType: "Faq",
    category: "FAQ",
    name: "Accordion",
    props: {
      eyebrow: "FAQ",
      heading: "Frequently asked questions",
      items: [
        {
          question: "How quickly can you start?",
          answer: "<p>Usually within a few days — urgent jobs often same week.</p>",
        },
        {
          question: "Do you offer free quotes?",
          answer: "<p>Yes, every quote is free and without obligation.</p>",
        },
        {
          question: "Are you insured?",
          answer: "<p>Fully insured and certified, with documents available on request.</p>",
        },
      ],
      variant: "accordion",
      design: shellDesign({ anchorId: "faq" }),
    },
  }),
  design({
    id: "faq-two-column",
    blockType: "Faq",
    category: "FAQ",
    name: "Two columns",
    props: {
      eyebrow: "Good to know",
      heading: "Answers at a glance",
      items: [
        {
          question: "What areas do you cover?",
          answer: "<p>The whole metro area, including surrounding towns.</p>",
        },
        {
          question: "How do I pay?",
          answer: "<p>Card, bank transfer or cash — whatever suits you after the job is done.</p>",
        },
        {
          question: "Is the work guaranteed?",
          answer: "<p>Yes, all workmanship is covered for [12] months.</p>",
        },
        {
          question: "Do you clean up afterwards?",
          answer: "<p>Always. We leave your place exactly how we found it.</p>",
        },
      ],
      variant: "two-column",
      design: shellDesign({ anchorId: "faq" }),
    },
  }),

  // --------------------------------------------------- Call to action
  design({
    id: "cta-dark-band",
    blockType: "CallToAction",
    category: "Call to action",
    name: "Dark band",
    props: {
      eyebrow: "Get started",
      heading: "Ready to get started?",
      text: "Contact us today for a free, no-obligation quote.",
      buttonText: "Contact us",
      buttonLink: "/contact",
      variant: "dark",
      design: shellDesign({ animation: "fade" }),
    },
  }),
  design({
    id: "cta-primary-band",
    blockType: "CallToAction",
    category: "Call to action",
    name: "Primary band",
    props: {
      eyebrow: "Limited availability",
      heading: "Book your spot this month",
      text: "Our calendar fills up fast — secure your preferred date today.",
      buttonText: "Check availability",
      buttonLink: "/contact",
      variant: "primary",
      design: shellDesign({ animation: "zoom-in" }),
    },
  }),
  design({
    id: "cta-split",
    blockType: "CallToAction",
    category: "Call to action",
    name: "Split with button",
    props: {
      eyebrow: "Questions?",
      heading: "Talk to a real person",
      text: "Call or message us — we reply within one business day.",
      buttonText: "Get in touch",
      buttonLink: "/contact",
      variant: "split",
      design: shellDesign(),
    },
  }),

  // ---------------------------------------------------------- Contact
  design({
    id: "contact-form-centered",
    blockType: "ContactForm",
    category: "Contact",
    name: "Centered form",
    props: {
      eyebrow: "Contact",
      heading: "Send us a message",
      formName: "contact",
      submitText: "Send message",
      formFields: [
        { label: "Name", fieldType: "text", required: true },
        { label: "Email", fieldType: "email", required: true },
        { label: "Message", fieldType: "textarea", required: true },
      ],
      variant: "centered",
      design: shellDesign({ anchorId: "contact" }),
    },
  }),
  design({
    id: "contact-form-split",
    blockType: "ContactForm",
    category: "Contact",
    name: "Split form",
    props: {
      eyebrow: "Free quote",
      heading: "Tell us about your project",
      formName: "quote",
      submitText: "Request my quote",
      formFields: [
        { label: "Name", fieldType: "text", required: true },
        { label: "Email", fieldType: "email", required: true },
        { label: "Phone", fieldType: "tel", required: false },
        { label: "What do you need?", fieldType: "textarea", required: true },
      ],
      variant: "split",
      design: shellDesign({ anchorId: "contact" }),
    },
  }),
  design({
    id: "contact-map-split",
    blockType: "Map",
    category: "Contact",
    name: "Map with address",
    props: {
      eyebrow: "Location",
      heading: "Come and see us",
      address: "",
      variant: "split",
      design: shellDesign({ anchorId: "contact", animation: "fade" }),
    },
  }),

  // ----------------------------------------------------------- Footer
  design({
    id: "footer-columns",
    blockType: "Footer",
    category: "Footer",
    name: "Columns",
    props: {
      businessName: "Your business",
      phone: "(555) 123-4567",
      address: "123 Main St, Springfield",
      socialLinks: [
        { platform: "facebook", url: "" },
        { platform: "instagram", url: "" },
      ],
      variant: "columns",
      design: shellDesign({ animation: "none" }),
    },
  }),
  design({
    id: "footer-centered",
    blockType: "Footer",
    category: "Footer",
    name: "Centered",
    props: {
      businessName: "Your business",
      phone: "(555) 123-4567",
      address: "123 Main St, Springfield",
      socialLinks: [],
      variant: "centered",
      design: shellDesign({ animation: "none" }),
    },
  }),
];

/** Catalog + saved designs for one category, catalog first. */
export function designsForCategory(
  designs: SectionDesign[],
  category: SectionCategory,
): SectionDesign[] {
  return designs.filter((entry) => entry.category === category);
}
