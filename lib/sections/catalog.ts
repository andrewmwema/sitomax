import type { HeroProps } from "@/components/blocks/hero";
import type { TextSectionProps } from "@/components/blocks/text-section";
import type { ImageWithTextProps } from "@/components/blocks/image-with-text";
import type { ServicesProps } from "@/components/blocks/services";
import type { StatsProps } from "@/components/blocks/stats";
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
  Stats: StatsProps;
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
 * Built-in catalog. Categories without designs yet (Process,
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
    name: "Icon grid · three columns",
    props: {
      eyebrow: "What we do",
      heading: "A little help. A fresh start. A better space.",
      text: "<p>From the small jobs on your list to the changes you have been planning, find the right kind of help for your home or business.</p>",
      services: [
        {
          icon: "wrench",
          title: "Repairs & maintenance",
          text: "<p>Put the everyday fixes in good hands, with practical advice on what needs attention and what can wait.</p>",
          image: "/samples/tools.jpg",
          imageAlt: "Sample of tools ready for a maintenance project",
        },
        {
          icon: "home",
          title: "Thoughtful improvements",
          text: "<p>Make your space work a little harder for you, with updates shaped around how you live and work.</p>",
          image: "/samples/home-interior.jpg",
          imageAlt: "Sample of a bright, comfortable living space",
        },
        {
          icon: "heart-handshake",
          title: "Ongoing care",
          text: "<p>Look after the details before they become bigger jobs. Talk to us about a plan that fits your property.</p>",
          image: "/samples/home-exterior.jpg",
          imageAlt: "Sample of a well-kept home exterior",
        },
      ],
      variant: "grid",
      design: shellDesign({ anchorId: "services" }),
    },
  }),
  design({
    id: "services-bordered-grid",
    blockType: "Services",
    category: "Features/Services",
    name: "Bordered service grid",
    props: {
      eyebrow: "One place to start",
      heading: "Good spaces deserve good care.",
      text: "<p>A practical range of services for the places that matter to you. Choose where to begin, and we will talk through the next step.</p>",
      services: [
        { icon: "wrench", title: "Everyday repairs", text: "<p>The small fixes that make a noticeable difference to your day.</p>", image: "/samples/tools.jpg", imageAlt: "Sample of tools laid out for a repair" },
        { icon: "paintbrush", title: "Finishing touches", text: "<p>Refresh tired details and give a familiar room a new lease of life.</p>", image: "/samples/home-interior.jpg", imageAlt: "Sample of a thoughtfully finished living room" },
        { icon: "ruler", title: "Project planning", text: "<p>Turn a rough idea into a clear brief, with your priorities at the centre.</p>", image: "/samples/team-at-work.jpg", imageAlt: "Sample of a team discussing a project" },
        { icon: "home", title: "Property upkeep", text: "<p>A considered approach to keeping your home or workspace in good shape.</p>", image: "/samples/home-exterior.jpg", imageAlt: "Sample of a welcoming home exterior" },
        { icon: "sofa", title: "Room improvements", text: "<p>Explore useful changes that make your space feel more like you.</p>", image: "/samples/kitchen.jpg", imageAlt: "Sample of a refreshed kitchen" },
        { icon: "heart-handshake", title: "Personal guidance", text: "<p>Not sure what you need? Start with a conversation about your options.</p>", image: "/samples/happy-customer.jpg", imageAlt: "Sample customer portrait" },
      ],
      variant: "bordered",
      design: shellDesign({ anchorId: "services" }),
    },
  }),
  design({
    id: "services-image-cards",
    blockType: "Services",
    category: "Features/Services",
    name: "Image service cards",
    props: {
      eyebrow: "Make room for better",
      heading: "What could your space become?",
      text: "<p>Small updates and bigger ideas, brought into focus. Explore a few ways we can help you take the next step.</p>",
      services: [
        { icon: "sofa", title: "Spaces to come home to", text: "<p>Comfortable, useful updates for the rooms where everyday life happens.</p>", image: "/samples/home-interior.jpg", imageAlt: "Sample of a light-filled living room with inviting seating" },
        { icon: "home", title: "A fresh first impression", text: "<p>Give the outside of your property the same care and attention as the inside.</p>", image: "/samples/home-exterior.jpg", imageAlt: "Sample of a carefully maintained home exterior" },
        { icon: "sparkles", title: "Details that work harder", text: "<p>Thoughtful improvements for kitchens, workspaces and the busy corners in between.</p>", image: "/samples/kitchen.jpg", imageAlt: "Sample of a bright kitchen with practical work surfaces" },
      ],
      variant: "image-cards",
      design: shellDesign({ anchorId: "services", animation: "fade" }),
    },
  }),
  design({
    id: "services-alternating-rows",
    blockType: "Services",
    category: "Features/Services",
    name: "Alternating image rows",
    props: {
      eyebrow: "Built around your plans",
      heading: "The right help, at every stage.",
      text: "<p>A good result starts with understanding what matters to you. Here is how our services can fit around your plans.</p>",
      services: [
        { icon: "lightbulb", title: "Start with a clearer picture", text: "<p>Tell us what is working, what is not, and what you would like to change. Together, we can explore a sensible way forward.</p><p><strong>Your priorities first.</strong> The right scope makes the next decision easier.</p>", image: "/samples/team-at-work.jpg", imageAlt: "Sample of a team sharing ideas around a table" },
        { icon: "wrench", title: "Take care of the practical details", text: "<p>From everyday repairs to a more considered update, choose the work that makes the biggest difference to your space.</p><ul><li>Repairs and maintenance</li><li>Useful improvements</li><li>Careful finishing touches</li></ul>", image: "/samples/tools.jpg", imageAlt: "Sample of tools prepared for hands-on work" },
        { icon: "heart-handshake", title: "Keep things feeling their best", text: "<p>Spaces change as life does. Ask about ongoing care, future improvements and the little details worth keeping an eye on.</p><p>We are here to help you think beyond the next job.</p>", image: "/samples/home-interior.jpg", imageAlt: "Sample of a comfortable, well-kept interior" },
      ],
      variant: "image-rows",
      design: shellDesign({ anchorId: "services", animation: "fade" }),
    },
  }),
  design({
    id: "services-icon-list",
    blockType: "Services",
    category: "Features/Services",
    name: "Heading with icon list",
    props: {
      eyebrow: "A more considered service",
      heading: "Good work starts with listening.",
      text: "<p>You should feel comfortable asking questions. Our approach makes room for the details, from your first idea to your next step.</p>",
      services: [
        {
          icon: "heart-handshake",
          title: "A conversation, not a sales pitch",
          text: "<p>Share your ideas, ask your questions and explore what is right for your space.</p>",
          image: "/samples/team-at-work.jpg",
          imageAlt: "Sample of a collaborative project conversation",
        },
        {
          icon: "ruler",
          title: "A scope you can understand",
          text: "<p>Talk through the work, the options and the practical details before deciding how to proceed.</p>",
          image: "/samples/tools.jpg",
          imageAlt: "Sample of tools for planning and measuring",
        },
        {
          icon: "home",
          title: "Care for the place you call yours",
          text: "<p>Tell us about access, your routine and anything we should know about your home or workplace.</p>",
          image: "/samples/home-interior.jpg",
          imageAlt: "Sample of a welcoming home interior",
        },
      ],
      variant: "list",
      design: shellDesign({ anchorId: "services" }),
    },
  }),
  design({
    id: "services-tabs",
    blockType: "Services",
    category: "Features/Services",
    name: "Service explorer tabs",
    props: {
      eyebrow: "Find your starting point",
      heading: "Different needs. The same thoughtful approach.",
      text: "<p>Explore the kind of help you have in mind, then tell us a little more about your plans.</p>",
      services: [
        { icon: "wrench", title: "Repair", text: "<p>Some jobs have been on the list for a while. Others need a closer look. Let us help you work out what to tackle first.</p><ul><li>Everyday fixes and adjustments</li><li>Practical maintenance advice</li><li>A clear conversation about your options</li></ul>", image: "/samples/tools.jpg", imageAlt: "Sample of a selection of tools for everyday repairs" },
        { icon: "sparkles", title: "Refresh", text: "<p>A familiar space can feel new again. Explore thoughtful changes that balance how a room looks with how you use it.</p><ul><li>Room updates and finishing details</li><li>Ideas shaped around your space</li><li>A sensible scope for your budget</li></ul>", image: "/samples/kitchen.jpg", imageAlt: "Sample of a refreshed kitchen with a clean, practical layout" },
        { icon: "home", title: "Maintain", text: "<p>A little attention today can help you plan for tomorrow. Talk to us about the ongoing needs of your home or business.</p><ul><li>Property care and upkeep</li><li>Help prioritising future work</li><li>Support as your needs change</li></ul>", image: "/samples/home-exterior.jpg", imageAlt: "Sample of a well-kept residential property" },
      ],
      variant: "tabs",
      design: shellDesign({ anchorId: "services", animation: "fade" }),
    },
  }),

  // ------------------------------------------------------------ Stats
  design({
    id: "stats-editorial-row",
    blockType: "Stats",
    category: "Stats",
    name: "Editorial numbers row",
    props: {
      eyebrow: "The bigger picture",
      heading: "Small details. Meaningful milestones.",
      text: "<p>Our story is built one project and one conversation at a time. Here is a snapshot of the business behind the work.</p>",
      stats: [
        { value: "[20]+", label: "Years serving locally", detail: "Part of the community we call home.", icon: "home" },
        { value: "[1,500]+", label: "Projects completed", detail: "Everyday jobs and bigger transformations.", icon: "wrench" },
        { value: "[4.9]/5", label: "Customer rating", detail: "From [200]+ customer reviews.", icon: "star" },
        { value: "[12]", label: "Team members", detail: "People who care about the details.", icon: "users" },
      ],
      image: "/samples/team-at-work.jpg",
      imageAlt: "Sample of a team at work",
      variant: "row",
      design: shellDesign({ anchorId: "our-numbers", animation: "fade" }),
    },
  }),
  design({
    id: "stats-metric-cards",
    blockType: "Stats",
    category: "Stats",
    name: "Milestone metric cards",
    props: {
      eyebrow: "More than numbers",
      heading: "Local roots. A growing story.",
      text: "<p>Behind these milestones are real people and the spaces they care about.</p>",
      stats: [
        { value: "[20]+", label: "Years of local service", detail: "Building relationships, one job at a time.", icon: "map-pin" },
        { value: "[1,500]+", label: "Projects brought to life", detail: "From the first idea to the finishing touch.", icon: "wrench" },
        { value: "[4.9]/5", label: "Average customer rating", detail: "Based on [200]+ customer reviews.", icon: "star" },
      ],
      image: "/samples/home-interior.jpg",
      imageAlt: "Sample of a completed home interior",
      variant: "cards",
      design: shellDesign({ anchorId: "our-numbers" }),
    },
  }),
  design({
    id: "stats-photo-split",
    blockType: "Stats",
    category: "Stats",
    name: "Photo & numbers",
    props: {
      eyebrow: "People behind the progress",
      heading: "A local team. A shared sense of pride.",
      text: "<p>We measure progress in the work we do and the relationships we build along the way.</p>",
      stats: [
        { value: "[20]+", label: "Years in the community", detail: "Local knowledge, put to work.", icon: "home" },
        { value: "[12]", label: "Team members", detail: "Different skills, a shared approach.", icon: "users" },
        { value: "[1,500]+", label: "Completed projects", detail: "Each one with its own story.", icon: "wrench" },
        { value: "[4.9]/5", label: "Customer rating", detail: "From [200]+ customer reviews.", icon: "star" },
      ],
      image: "/samples/team-at-work.jpg",
      imageAlt: "Sample of a team collaborating on a project",
      variant: "split",
      design: shellDesign({ anchorId: "our-numbers", animation: "fade" }),
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
      eyebrow: "A clear place to start",
      heading: "The right scope for your next step.",
      text: "<p>Choose the kind of help you have in mind. We will talk through your space, your priorities and the details before you decide.</p>",
      note: "<p>Example starting prices. Your written proposal will confirm the scope, final price and any applicable taxes.</p>",
      highlightLabel: "Featured plan",
      plans: [
        {
          name: "A little help",
          description: "<p>For a practical fix or a smaller job on your list.</p>",
          price: "$[149]",
          period: "starting price / project",
          yearlyPrice: "",
          yearlyPeriod: "per year",
          features: "Project consultation\nAgreed scope of work\nWritten estimate",
          buttonText: "Discuss a small job",
          buttonLink: "/contact",
          highlighted: false,
        },
        {
          name: "A fresh start",
          description: "<p>For a considered update to a well-loved space.</p>",
          price: "$[499]",
          period: "starting price / project",
          yearlyPrice: "",
          yearlyPeriod: "per year",
          features: "Project consultation\nAgreed scope of work\nWritten estimate\nPlanning & finishing guidance",
          buttonText: "Explore your project",
          buttonLink: "/contact",
          highlighted: true,
        },
        {
          name: "Something bigger",
          description: "<p>For a wider brief that needs a tailored approach.</p>",
          price: "Custom",
          period: "a proposal shaped around you",
          yearlyPrice: "",
          yearlyPeriod: "per year",
          features: "Project consultation\nAgreed scope of work\nWritten estimate\nPlanning & finishing guidance\nPhased project planning",
          buttonText: "Talk through your brief",
          buttonLink: "/contact",
          highlighted: false,
        },
      ],
      variant: "cards",
      design: shellDesign({ anchorId: "pricing" }),
    },
  }),
  design({
    id: "pricing-billing-toggle",
    blockType: "Pricing",
    category: "Pricing",
    name: "Monthly / yearly plans",
    props: {
      eyebrow: "Care that fits your routine",
      heading: "Make room for ongoing care.",
      text: "<p>Explore a regular plan for your home or business. Choose monthly or yearly billing to see the full price for that period.</p>",
      note: "<p>Example plan prices. Availability, service frequency and plan terms are confirmed in your written agreement.</p>",
      highlightLabel: "Featured plan",
      plans: [
        {
          name: "Essential",
          description: "<p>A simple starting point for everyday upkeep.</p>",
          price: "$[29]",
          period: "per month / billed monthly",
          yearlyPrice: "$[290]",
          yearlyPeriod: "per year / billed yearly",
          features: "Property care guidance\nPlanned maintenance check-in\nWritten care notes",
          buttonText: "Explore Essential",
          buttonLink: "/contact",
          highlighted: false,
        },
        {
          name: "Complete",
          description: "<p>More room to plan for the details ahead.</p>",
          price: "$[59]",
          period: "per month / billed monthly",
          yearlyPrice: "$[590]",
          yearlyPeriod: "per year / billed yearly",
          features: "Property care guidance\nPlanned maintenance check-in\nWritten care notes\nSeasonal project planning",
          buttonText: "Explore Complete",
          buttonLink: "/contact",
          highlighted: true,
        },
        {
          name: "Business",
          description: "<p>A considered plan for your working space.</p>",
          price: "$[99]",
          period: "per month / billed monthly",
          yearlyPrice: "$[990]",
          yearlyPeriod: "per year / billed yearly",
          features: "Property care guidance\nPlanned maintenance check-in\nWritten care notes\nSeasonal project planning\nWorkspace care review",
          buttonText: "Explore Business",
          buttonLink: "/contact",
          highlighted: false,
        },
      ],
      variant: "billing",
      design: shellDesign({ anchorId: "pricing", animation: "fade" }),
    },
  }),
  design({
    id: "pricing-comparison-table",
    blockType: "Pricing",
    category: "Pricing",
    name: "Plan comparison table",
    props: {
      eyebrow: "A closer look",
      heading: "Find the fit. See the details.",
      text: "<p>Compare the support in each plan, from everyday guidance to a more complete approach to property care.</p>",
      note: "<p>Example starting prices per month. The service schedule, terms and final price will be agreed before work begins.</p>",
      highlightLabel: "Featured plan",
      plans: [
        { name: "Essential", description: "<p>The foundations of a useful care plan.</p>", price: "$[29]", period: "per month", yearlyPrice: "$[290]", yearlyPeriod: "per year", features: "Property care guidance\nWritten care notes", buttonText: "Choose Essential", buttonLink: "/contact", highlighted: false },
        { name: "Complete", description: "<p>A broader view of your property's needs.</p>", price: "$[59]", period: "per month", yearlyPrice: "$[590]", yearlyPeriod: "per year", features: "Property care guidance\nWritten care notes\nMaintenance check-in\nSeasonal planning", buttonText: "Choose Complete", buttonLink: "/contact", highlighted: true },
        { name: "Business", description: "<p>Care shaped around your working space.</p>", price: "$[99]", period: "per month", yearlyPrice: "$[990]", yearlyPeriod: "per year", features: "Property care guidance\nWritten care notes\nMaintenance check-in\nSeasonal planning\nWorkspace review", buttonText: "Choose Business", buttonLink: "/contact", highlighted: false },
      ],
      variant: "comparison",
      design: shellDesign({ anchorId: "pricing", animation: "fade" }),
    },
  }),
  design({
    id: "pricing-single-checklist",
    blockType: "Pricing",
    category: "Pricing",
    name: "Single plan with checklist",
    props: {
      eyebrow: "One thoughtful starting point",
      heading: "A simpler way to care for your space.",
      text: "<p>No long list of packages to work through. Start with a practical care visit and a conversation about what your property needs.</p><p>Tell us what matters most, and we will help you shape the next step.</p>",
      note: "<p>Example starting price. Your written estimate will set out the work, any materials and applicable taxes.</p>",
      highlightLabel: "Your starting point",
      plans: [
        { name: "The local care visit", description: "<p>A focused visit for the everyday details.</p>", price: "$[149]", period: "starting price / visit", yearlyPrice: "", yearlyPeriod: "per year", features: "A conversation about your priorities\nA review of the work you have in mind\nA clearly agreed scope\nPractical next-step guidance\nWritten notes for your records", buttonText: "Plan your care visit", buttonLink: "/contact", highlighted: true },
      ],
      variant: "single",
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
      eyebrow: "Before we begin",
      heading: "A few things worth knowing.",
      text: "<p>From the first conversation to the next step, here are answers to some useful questions about working with us.</p>",
      openFirst: true,
      contactHeading: "A question about your project?",
      contactText: "<p>Tell us what you have in mind and we can talk through your options.</p>",
      contactButtonText: "Talk to our team",
      contactButtonLink: "/contact",
      contactImage: "/samples/team-at-work.jpg",
      contactImageAlt: "Sample of a team discussing a local project",
      items: [
        {
          question: "Where should I start?",
          answer: "<p>Tell us a little about your property and what you would like to change. Photos, rough measurements and a preferred timeframe are useful if you have them.</p><p>We can then talk through the right next step for your project.</p>",
        },
        {
          question: "Which areas do you cover?",
          answer: "<p>Our service area is [service area]. Include your location when you get in touch so we can confirm whether we can help.</p>",
        },
        {
          question: "How is the price worked out?",
          answer: "<p>The scope of work, access, materials and timing all play a part. Ask for a written breakdown so you can understand the proposed work before deciding.</p>",
        },
        { question: "Can I talk through an idea before deciding?", answer: "<p>Of course. Bring your questions and priorities, even if your plans are still taking shape. A clearer brief makes it easier to explore the options.</p>" },
        { question: "What happens if the scope changes?", answer: "<p>Changes should be discussed before additional work goes ahead. Ask for the revised scope, price and timing to be set out in writing.</p>" },
      ],
      variant: "accordion",
      design: shellDesign({ anchorId: "faq" }),
    },
  }),
  design({
    id: "faq-two-column",
    blockType: "Faq",
    category: "FAQ",
    name: "Two-column answers",
    props: {
      eyebrow: "The practical details",
      heading: "Clear answers. A more confident start.",
      text: "<p>A little information makes planning easier. Here are some of the details to consider before your project gets under way.</p>",
      openFirst: true,
      contactHeading: "Need a little guidance?",
      contactText: "<p>Share your questions and tell us about your plans.</p>",
      contactButtonText: "Get in touch",
      contactButtonLink: "/contact",
      contactImage: "/samples/team-at-work.jpg",
      contactImageAlt: "Sample of a local team sharing project ideas",
      items: [
        {
          question: "Can you help me choose what to tackle first?",
          answer: "<p>Tell us what is most important to you, from everyday convenience to a bigger improvement. We can explore a scope that reflects your priorities.</p>",
        },
        {
          question: "Do I need to be there during the work?",
          answer: "<p>It depends on the work and access arrangements. Let us know about your routine so attendance, keys and any special instructions can be discussed in advance.</p>",
        },
        {
          question: "What should I do before a visit?",
          answer: "<p>Gather any photos or notes that may help explain the job. Ask whether the work area needs clearing and mention parking or access restrictions.</p>",
        },
        {
          question: "How far ahead should I get in touch?",
          answer: "<p>Availability depends on the type of work and the time of year. Share your preferred dates early so the team can discuss a suitable schedule.</p>",
        },
        { question: "What payment methods can I use?", answer: "<p>Our accepted methods are [payment methods]. The payment schedule and any deposit will be included in your written proposal.</p>" },
        { question: "Can I ask about aftercare?", answer: "<p>Yes. Ask about ongoing maintenance, product care and any applicable cover before you agree to the work. Keep your proposal and care notes for reference.</p>" },
      ],
      variant: "two-column",
      design: shellDesign({ anchorId: "faq" }),
    },
  }),
  design({
    id: "faq-contact-sidebar",
    blockType: "Faq",
    category: "FAQ",
    name: "FAQ with contact sidebar",
    props: {
      eyebrow: "Let us make it clearer",
      heading: "Questions first. A plan next.",
      text: "<p>Start with the answers below. If your project needs a more personal conversation, we are here to help you explore it.</p>",
      openFirst: true,
      contactHeading: "Your project is worth a conversation.",
      contactText: "<p>Every space has its own details. Share a little about yours and the kind of help you are looking for.</p>",
      contactButtonText: "Talk to our team",
      contactButtonLink: "/contact",
      contactImage: "/samples/team-at-work.jpg",
      contactImageAlt: "Sample of a team talking through plans together",
      items: [
        { question: "I am not sure which service I need. Can you help?", answer: "<p>Describe the issue or the change you would like to make. A photo and a few details about your space can be a useful starting point.</p>" },
        { question: "Can we work around my opening hours?", answer: "<p>Share your business hours and any access restrictions. The team can then discuss a schedule that suits the proposed work.</p>" },
        { question: "What information should I send with an enquiry?", answer: "<p>Include your location, a short description of the job and your preferred timeframe. Our usual service area is [service area].</p>" },
        { question: "When will the final price be confirmed?", answer: "<p>Once the scope is understood, request a written proposal covering the work, materials, timing and any applicable taxes before proceeding.</p>" },
      ],
      variant: "sidebar",
      design: shellDesign({ anchorId: "faq", animation: "fade" }),
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
