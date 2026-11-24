import { THEME_PRESETS, type SiteTheme } from "@/lib/theme/presets";
import { block, designed, type TemplateData } from "./shared";

export type PremiumTemplatePage = {
  title: string;
  slug: string;
  nav_label: string;
  data: TemplateData;
};

export type PremiumWebsiteTemplate = {
  key: string;
  name: string;
  description: string;
  bestFor: string[];
  previewImage: string;
  theme: SiteTheme;
  business: {
    businessName: string;
    businessType: string;
    city: string;
    services: string[];
    difference: string;
    tone: string;
    phone: string;
    email: string;
    address: string;
    openingHours: string;
    socialLinks: { label: string; url: string }[];
  };
  pages: PremiumTemplatePage[];
};

type PageDefinition = {
  title: string;
  slug: string;
  description: string;
  content: TemplateData["content"][number][];
};

type TemplateOptions = Omit<PremiumWebsiteTemplate, "pages"> & {
  navigation: { label: string; href: string }[];
  primaryAction: string;
  secondaryAction: string;
  pages: PageDefinition[];
};

function themePreset(id: string): SiteTheme {
  const preset = THEME_PRESETS.find((entry) => entry.id === id);
  if (!preset) throw new Error(`Unknown premium template theme: ${id}`);
  return structuredClone(preset.theme);
}

function createPremiumTemplate(options: TemplateOptions): PremiumWebsiteTemplate {
  const footerNavigation = [
    ...options.navigation,
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ];
  return {
    ...options,
    pages: options.pages.map((page) => {
      const pageKey = page.slug.replaceAll("/", "-") || "home";
      const navigation = block("Navigation", `${options.key}-${pageKey}-navigation`, {
        businessName: options.business.businessName,
        brandLink: "/",
        links: options.navigation,
        buttonText: options.primaryAction,
        buttonLink: "/contact",
        variant: options.theme.style === "classic" ? "dark" : "light",
      });
      const footer = designed(
        "Footer",
        options.theme.style === "classic" ? "footer-columns" : "footer-light-compact",
        `${options.key}-${pageKey}-footer`,
        {
          businessName: options.business.businessName,
          phone: options.business.phone,
          email: options.business.email,
          address: options.business.address,
          hours: options.business.openingHours,
          tagline: options.business.difference,
          socialLinks: [
            { platform: "instagram", url: options.business.socialLinks[0]?.url ?? "" },
            { platform: "linkedin", url: options.business.socialLinks[1]?.url ?? "" },
          ],
          navigation: footerNavigation,
        },
      );
      return {
        title: page.title,
        slug: page.slug,
        nav_label: page.title,
        data: {
          root: {
            props: {
              title: `${page.title} | ${options.business.businessName}`,
              description: page.description,
            },
          },
          content: [navigation, ...page.content, footer],
        },
      };
    }),
  };
}

function legalPages(businessName: string): PageDefinition[] {
  return [
    {
      title: "Privacy",
      slug: "privacy",
      description: `How ${businessName} handles information sent through this website.`,
      content: [
        designed("TextSection", "text-article", "privacy-notice", {
          eyebrow: "Privacy",
          heading: "Your information, handled with care",
          text: `<p>This sample notice is a starting point for ${businessName}. Review it with a qualified adviser and update it to reflect your actual business and practices before publishing.</p><h3>Information you share</h3><p>When you use a contact form, we receive the details you choose to provide so we can respond to your enquiry. Please do not send payment details or other sensitive information through this form.</p><h3>How we use it</h3><p>We use enquiry information to answer your questions and discuss the services you requested. We do not sell enquiry details.</p><h3>Questions</h3><p>Contact us if you would like to ask about information you have sent through this website.</p>`,
          variant: "article",
        }),
      ],
    },
    {
      title: "Terms",
      slug: "terms",
      description: `Website terms and service information for ${businessName}.`,
      content: [
        designed("TextSection", "text-article", "terms-of-use", {
          eyebrow: "Terms",
          heading: "Clear expectations from the start",
          text: `<p>This sample page is a practical starting point, not legal advice. ${businessName} should review and customize it before publishing.</p><h3>Website information</h3><p>We aim to keep the information on this website useful and up to date. A website description is not a substitute for a written service scope or individual advice.</p><h3>Services and agreements</h3><p>Any services, fees, dates and deliverables will be confirmed directly with you before work begins.</p><h3>Contact</h3><p>Please get in touch if you have a question about these terms or the services described here.</p>`,
          variant: "article",
        }),
      ],
    },
  ];
}

const showcaseBusiness = {
  businessName: "Northline Inspections",
  businessType: "Property inspection company",
  city: "Portland",
  services: ["Pre-purchase inspections", "Seller readiness", "Property maintenance reviews"],
  difference: "Clear findings, considered next steps, and a report you can return to.",
  tone: "Confident, calm and precise",
  phone: "+1 555 010 0142",
  email: "hello@northline.example",
  address: "Serving Portland and nearby communities",
  openingHours: "Monday–Friday, 8:00 am–5:00 pm",
  socialLinks: [
    { label: "Instagram", url: "https://instagram.com/northline.inspections" },
    { label: "LinkedIn", url: "https://linkedin.com/company/northline-inspections" },
  ],
};

const clarityBusiness = {
  businessName: "Harbor & Pine Advisors",
  businessType: "Financial and bookkeeping firm",
  city: "Portland",
  services: ["Small business bookkeeping", "Family financial organization", "Monthly reporting"],
  difference: "Straightforward financial guidance, with room for real life.",
  tone: "Warm, clear and reassuring",
  phone: "+1 555 010 0143",
  email: "hello@harborpine.example",
  address: "Serving Portland and clients remotely",
  openingHours: "Monday–Friday, 9:00 am–4:00 pm",
  socialLinks: [
    { label: "Instagram", url: "https://instagram.com/harborandpine.advisors" },
    { label: "LinkedIn", url: "https://linkedin.com/company/harbor-pine-advisors" },
  ],
};

const studioBusiness = {
  businessName: "Forma Studio",
  businessType: "Brand and web design studio",
  city: "Portland",
  services: ["Brand strategy", "Visual identity", "Web design and development"],
  difference: "Distinctive identities and useful digital experiences, made to work together.",
  tone: "Expressive, thoughtful and direct",
  phone: "+1 555 010 0144",
  email: "hello@formastudio.example",
  address: "Working with ambitious teams everywhere",
  openingHours: "Monday–Friday, 10:00 am–5:00 pm",
  socialLinks: [
    { label: "Instagram", url: "https://instagram.com/forma.studio.design" },
    { label: "LinkedIn", url: "https://linkedin.com/company/forma-studio-design" },
  ],
};

const showcase = createPremiumTemplate({
  key: "showcase",
  name: "Showcase",
  description: "A confident, product-led website for services that need to make their process tangible.",
  bestFor: ["Property services", "Inspection teams", "Product-led businesses"],
  previewImage: "/template-assets/showcase-thumbnail-78c37dd57c490761.png",
  theme: themePreset("showcase-inspections"),
  business: showcaseBusiness,
  navigation: [
    { label: "Home", href: "/" },
    { label: "Services", href: "/services" },
    { label: "Sample report", href: "/sample-report" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  primaryAction: "Book an inspection",
  secondaryAction: "See how it works",
  pages: [
    {
      title: "Home",
      slug: "",
      description: "Understand the property before you decide. Book a clear, practical inspection with Northline.",
      content: [
        designed("Hero", "hero-product-demo", "showcase-home-hero", {
          eyebrow: "Property inspections, made clearer",
          heading: "Know what you're buying. Move forward with a clear picture.",
          subheading: "<p>Northline turns a careful inspection into a practical digital report, with findings explained and next steps easy to understand.</p>",
          backgroundImage: "/template-assets/report-preview.svg",
          backgroundImageAlt: "Northline property inspection report displayed on a laptop and phone",
          buttonText: "Book an inspection",
          buttonLink: "/contact",
          secondaryButtonText: "See a sample report",
          secondaryButtonLink: "/sample-report",
          trustLine: "Clear findings · Digital report · Practical next steps",
          variant: "product-demo",
        }),
        designed("Logos", "logos-wordmark-strip", "showcase-home-trust", {
          eyebrow: "Built around your decision",
          heading: "Useful at every stage of a property's life",
          text: "A considered inspection for the people responsible for what happens next.",
          logos: [
            { name: "HOME BUYERS", image: "" },
            { name: "PROPERTY OWNERS", image: "" },
            { name: "SELLERS", image: "" },
            { name: "PROPERTY TEAMS", image: "" },
          ],
          variant: "strip",
        }),
        designed("Process", "process-horizontal-visual", "showcase-home-process", {
          eyebrow: "How it works",
          heading: "A clear process from visit to report",
          text: "<p>Know what to expect before the inspection begins and what to do when the report arrives.</p>",
          steps: [
            { title: "Tell us about the property", text: "<p>Share the address, your timing and the questions you want the inspection to answer.</p>", icon: "message-circle", image: "/samples/home-exterior.jpg", imageAlt: "Home exterior" },
            { title: "We inspect with care", text: "<p>Northline reviews the accessible areas and records findings with clear supporting notes and photos.</p>", icon: "search", image: "/samples/tools.jpg", imageAlt: "Inspection tools" },
            { title: "Use your report", text: "<p>Receive a digital report organized by priority, with a summary and practical next steps.</p>", icon: "file-text", image: "/template-assets/report-preview.svg", imageAlt: "Illustrated inspection report" },
          ],
          variant: "horizontal",
          buttonText: "Book an inspection",
          buttonLink: "/contact",
          trustLine: "A straightforward appointment, with time for your questions.",
        }),
        designed("Services", "services-image-cards", "showcase-home-services", {
          eyebrow: "Choose the right inspection",
          heading: "The information you need, for the property you have",
          text: "<p>Start with the decision in front of you. We will help shape the right inspection around it.</p>",
          services: [
            { icon: "key-round", title: "Pre-purchase", text: "<p>Understand visible condition and maintenance considerations before you commit.</p>", image: "/samples/home-interior.jpg", imageAlt: "Bright residential interior prepared for a property review", actionText: "View services", actionLink: "/services" },
            { icon: "house", title: "Seller readiness", text: "<p>Review the home before listing and organize known maintenance items for a clearer handover.</p>", image: "/samples/home-exterior.jpg", imageAlt: "Well-kept home exterior", actionText: "View services", actionLink: "/services" },
            { icon: "clipboard-check", title: "Maintenance review", text: "<p>Build a more useful picture of visible upkeep needs and questions to prioritize.</p>", image: "/samples/tools.jpg", imageAlt: "Tools arranged for property maintenance", actionText: "View services", actionLink: "/services" },
          ],
          variant: "image-cards",
        }),
        designed("ImageWithText", "about-report-preview", "showcase-home-report", {
          eyebrow: "The Northline report",
          heading: "A useful report is easy to return to",
          text: "<p>See the overall picture, find the details behind each observation, and keep your next questions in one organized place.</p><ul><li>Summary written in plain language</li><li>Findings grouped by priority</li><li>Photos and practical follow-up notes</li></ul>",
          image: "/template-assets/report-preview.svg",
          imageAlt: "Original digital report mockup with a property summary and findings",
          reportLabel: "Inspection report",
          reportTitle: "Property inspection summary",
          reportReference: "ILLUSTRATIVE SAMPLE",
          reportHighlights: [
            { label: "Overview", value: "Plain-language summary" },
            { label: "Findings", value: "Grouped by priority" },
            { label: "Evidence", value: "Photos and notes" },
          ],
          buttonText: "See a sample report",
          buttonLink: "/sample-report",
          variant: "report-preview",
        }),
        designed("Faq", "faq-accordion", "showcase-home-faq", {
          eyebrow: "Before you book",
          heading: "A few useful details",
          text: "<p>Have another question? Send it along with your inspection enquiry.</p>",
          items: [
            { question: "What should I share before the visit?", answer: "<p>The property address, access details, your preferred timing and any particular concerns are a helpful start.</p>" },
            { question: "When will I receive the report?", answer: "<p>We will confirm the expected delivery time when your inspection is arranged, so you know what to plan around.</p>" },
            { question: "Can I ask questions about a finding?", answer: "<p>Yes. The report is designed to support a clear follow-up conversation about the observations and possible next steps.</p>" },
          ],
          openFirst: true,
          contactButtonText: "Book an inspection",
          contactButtonLink: "/contact",
        }),
        designed("CallToAction", "cta-dark-band", "showcase-home-close", {
          eyebrow: "Your next step",
          heading: "Make the next property decision with more clarity",
          text: "Tell us about the property and what you need to understand. We will help you arrange the right inspection.",
          buttonText: "Book an inspection",
          buttonLink: "/contact",
          secondaryButtonText: "Explore services",
          secondaryButtonLink: "/services",
          trustLine: "A clear conversation before anything is booked.",
          variant: "dark",
        }),
      ],
    },
    {
      title: "Services",
      slug: "services",
      description: "Explore Northline's property inspection services and find the right starting point.",
      content: [
        designed("TextSection", "text-centered-intro", "showcase-services-intro", {
          eyebrow: "Services",
          heading: "A better view of the property, before your next decision",
          text: "<p>Every inspection starts with the property, your plans and the questions you need answered.</p>",
          variant: "intro",
        }),
        designed("Services", "services-alternating-rows", "showcase-services-list", {
          eyebrow: "Choose your inspection",
          heading: "Practical support for buyers, owners and sellers",
          services: [
            { icon: "key-round", title: "Pre-purchase inspection", text: "<p>Review visible condition, document observations and identify areas that may need closer professional attention.</p><ul><li>Visual review of accessible areas</li><li>Photographic notes</li><li>Clear summary and priorities</li></ul>", image: "/samples/home-interior.jpg", imageAlt: "Light-filled home interior" },
            { icon: "house", title: "Seller readiness review", text: "<p>Understand the visible maintenance picture before listing and organize questions to address with the right specialists.</p><ul><li>Room-by-room observations</li><li>Maintenance items to consider</li><li>Useful notes for planning next steps</li></ul>", image: "/samples/home-exterior.jpg", imageAlt: "Residential exterior in a leafy neighborhood" },
            { icon: "clipboard-check", title: "Property maintenance review", text: "<p>Get a structured view of visible upkeep needs and the details to keep in mind over time.</p><ul><li>Observations grouped by area</li><li>Photos for easier reference</li><li>Practical follow-up suggestions</li></ul>", image: "/samples/tools.jpg", imageAlt: "Hand tools for property maintenance" },
          ],
          variant: "image-rows",
        }),
        designed("CallToAction", "cta-primary-band", "showcase-services-close", {
          heading: "Not sure which inspection fits?",
          text: "Share what you are planning and we can talk through the options.",
          buttonText: "Book an inspection",
          buttonLink: "/contact",
          variant: "primary",
        }),
      ],
    },
    {
      title: "Sample report",
      slug: "sample-report",
      description: "Explore a sample Northline inspection report, from summary to findings and photos.",
      content: [
        designed("Hero", "hero-centered-badge", "showcase-report-hero", {
          eyebrow: "A closer look",
          badgeText: "A sample Northline report",
          heading: "The details, organized for a real decision",
          subheading: "<p>See how an overview, priority findings and supporting photos can work together in one digital report.</p>",
          buttonText: "Book an inspection",
          buttonLink: "/contact",
          secondaryButtonText: "Explore services",
          secondaryButtonLink: "/services",
          variant: "centered",
        }),
        designed("ImageWithText", "about-report-preview", "showcase-report-preview", {
          eyebrow: "Report overview",
          heading: "Start with the summary. Find the detail when you need it.",
          text: "<p>A concise overview helps you understand the inspection at a glance. Each finding then includes a location, observation, photo and suggested next step.</p><ul><li><strong>Summary:</strong> the main themes in plain language</li><li><strong>Findings:</strong> observations grouped by priority</li><li><strong>Photos:</strong> visual context attached to the relevant note</li></ul>",
          image: "/template-assets/report-preview.svg",
          imageAlt: "Illustration of the report summary and photo findings on a laptop and phone",
          reportLabel: "Sample inspection report",
          reportTitle: "Property condition overview",
          reportReference: "ILLUSTRATIVE SAMPLE",
          reportHighlights: [
            { label: "Exterior", value: "Review drainage" },
            { label: "Interior", value: "Monitor sealant" },
            { label: "Next step", value: "Discuss findings" },
          ],
          buttonText: "Book an inspection",
          buttonLink: "/contact",
          variant: "report-preview",
        }),
        designed("Stats", "stats-editorial-row", "showcase-report-structure", {
          eyebrow: "A consistent format",
          heading: "Three useful ways to read the report",
          text: "<p>The sample is illustrative; the final report reflects the property and agreed inspection scope.</p>",
          stats: [
            { value: "01", label: "Understand", detail: "Read the summary before exploring the details.", icon: "book-open" },
            { value: "02", label: "Review", detail: "Find the location and supporting photo for each note.", icon: "search" },
            { value: "03", label: "Plan", detail: "Use the next-step notes to guide follow-up questions.", icon: "list-checks" },
          ],
          variant: "row",
        }),
        designed("TextSection", "text-pull-quote", "showcase-report-note", {
          eyebrow: "A note on scope",
          heading: "Clear information supports better questions",
          text: "<p>An inspection report records observations from the agreed visit. It is not a guarantee or a substitute for specialist advice where further evaluation is recommended.</p>",
          variant: "pull-quote",
          pullQuote: "Know what was observed, where it was found, and what to ask next.",
        }),
        designed("CallToAction", "cta-dark-band", "showcase-report-close", {
          heading: "See what a clear report can do for your next decision",
          text: "Tell us about the property and the timing you have in mind.",
          buttonText: "Book an inspection",
          buttonLink: "/contact",
          variant: "dark",
        }),
      ],
    },
    {
      title: "About",
      slug: "about",
      description: "Meet Northline Inspections and learn about its careful, plain-language approach.",
      content: [
        designed("ImageWithText", "about-image-right", "showcase-about-story", {
          eyebrow: "About Northline",
          heading: "Careful observation. Clear communication.",
          text: "<p>Northline Inspections was built around a simple idea: property information should be easier to understand and use.</p><p>Our work is methodical and our reports are designed for people who need a clear record, not another layer of jargon.</p>",
          image: "/samples/team-at-work.jpg",
          imageAlt: "Inspection team reviewing property notes together",
          variant: "image-right",
        }),
        designed("Process", "process-editorial-timeline", "showcase-about-values", {
          eyebrow: "How we work",
          heading: "Good inspection work is careful at every step",
          text: "<p>From the first questions to the final report, we aim to make the process considered and easy to follow.</p>",
          steps: [
            { title: "Listen first", text: "<p>Understand the property, the decision ahead and the concerns you want addressed.</p>", icon: "ear" },
            { title: "Record clearly", text: "<p>Document visible findings with useful context, photos and practical language.</p>", icon: "clipboard-list" },
            { title: "Explain next steps", text: "<p>Make it easier to decide what to ask, monitor or discuss with a specialist.</p>", icon: "messages-square" },
          ],
          variant: "timeline",
        }),
        designed("CallToAction", "cta-primary-band", "showcase-about-close", {
          heading: "Start with a conversation about the property",
          text: "We will help you work out which service best fits your plans.",
          buttonText: "Book an inspection",
          buttonLink: "/contact",
          variant: "primary",
        }),
      ],
    },
    {
      title: "Contact",
      slug: "contact",
      description: "Book a Northline property inspection or ask a question about the service.",
      content: [
        designed("ContactForm", "contact-form-split", "showcase-contact-form", {
          eyebrow: "Book an inspection",
          heading: "Tell us about the property",
          text: "<p>Share the address, your preferred timing and what you would like the inspection to help you understand.</p>",
          formName: "inspection-booking",
          submitText: "Request an inspection",
          formFields: [
            { label: "Name", fieldType: "text", required: true },
            { label: "Email", fieldType: "email", required: true },
            { label: "Phone", fieldType: "tel", required: false },
            { label: "Property address", fieldType: "text", required: true },
            { label: "Preferred date or timing", fieldType: "text", required: false },
            { label: "Questions for Northline", fieldType: "textarea", required: true },
          ],
          note: "Please do not include payment details or sensitive personal information.",
          details: [
            { icon: "phone", label: "Call", value: showcaseBusiness.phone },
            { icon: "mail", label: "Email", value: showcaseBusiness.email },
            { icon: "map-pin", label: "Service area", value: showcaseBusiness.address },
          ],
          variant: "split",
        }),
      ],
    },
    ...legalPages(showcaseBusiness.businessName),
  ],
});

const clarity = createPremiumTemplate({
  key: "clarity",
  name: "Clarity",
  description: "A spacious, editorial foundation for advisors serving different people and business needs.",
  bestFor: ["Financial advisors", "Bookkeepers", "Professional services"],
  previewImage: "/template-assets/clarity-thumbnail-c8fcd5ee289551a4.png",
  theme: themePreset("clarity-advisors"),
  business: clarityBusiness,
  navigation: [
    { label: "Home", href: "/" },
    { label: "Services", href: "/services" },
    { label: "For families", href: "/families" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  primaryAction: "Book a consultation",
  secondaryAction: "Explore services",
  pages: [
    {
      title: "Home",
      slug: "",
      description: "Financial and bookkeeping guidance for individuals, families and small businesses.",
      content: [
        designed("Hero", "hero-editorial-centered", "clarity-home-hero", {
          eyebrow: "A steadier view of your finances",
          heading: "Make room for clearer financial decisions",
          subheading: "<p>Harbor & Pine helps individuals, families and small businesses organize the details and see a more useful way forward.</p>",
          badgeText: "Financial guidance, with real life in mind",
          buttonText: "Book a consultation",
          buttonLink: "/contact",
          secondaryButtonText: "Explore services",
          secondaryButtonLink: "/services",
          trustLine: "Clear conversations · Thoughtful organization · Practical next steps",
          variant: "editorial",
        }),
        designed("Services", "services-audience-paths", "clarity-home-paths", {
          eyebrow: "Find your path",
          heading: "The right support starts with what matters to you",
          text: "<p>Choose the conversation that feels closest to your situation. We can shape the details together.</p>",
          services: [
            { icon: "briefcase-business", title: "For small businesses", text: "<p>Build a calmer monthly rhythm around records, bookkeeping and useful reporting.</p>", image: "/samples/team-at-work.jpg", imageAlt: "Small business team working through plans", actionText: "Small business bookkeeping", actionLink: "/services/small-business-bookkeeping" },
            { icon: "house", title: "For families", text: "<p>Bring day-to-day finances, shared plans and important documents into a clearer view.</p>", image: "/samples/home-interior.jpg", imageAlt: "Warm family home interior", actionText: "Explore family support", actionLink: "/families" },
            { icon: "user-round", title: "For individuals", text: "<p>Get organized, understand the moving parts and decide what to focus on next.</p>", image: "/samples/happy-customer.jpg", imageAlt: "Person considering their next steps", actionText: "Talk with an advisor", actionLink: "/contact" },
          ],
          variant: "audience-paths",
        }),
        designed("ImageWithText", "about-image-right", "clarity-home-approach", {
          eyebrow: "A thoughtful approach",
          heading: "Clarity comes from understanding the whole picture",
          text: "<p>We start with your questions, organize the information you already have and make the options easier to discuss.</p><ul><li>Plain-language explanations</li><li>Steady, organized follow-through</li><li>Advice shaped around your priorities</li></ul>",
          image: "/samples/team-at-work.jpg",
          imageAlt: "Advisors discussing a financial plan together",
          variant: "image-right",
        }),
        designed("Team", "team-editorial-profiles", "clarity-home-team", {
          eyebrow: "Meet your guides",
          heading: "People who make room for your questions",
          text: "<p>Get to know the thoughtful team behind Harbor & Pine.</p>",
          members: [
            { name: "Mara Ellis", role: "Client advisor", bio: "<p>Mara helps clients turn a long list of financial questions into a clear, manageable conversation.</p>", image: "/samples/happy-customer.jpg", imageAlt: "Portrait representing Harbor & Pine advisor Mara Ellis", imagePosition: "center" },
            { name: "Theo Bennett", role: "Bookkeeping lead", bio: "<p>Theo brings a careful, organized approach to records, reporting and the everyday details behind a business.</p>", image: "/samples/team-at-work.jpg", imageAlt: "Portrait representing Harbor & Pine bookkeeping lead Theo Bennett", imagePosition: "center" },
          ],
          variant: "profiles",
        }),
        designed("CallToAction", "cta-dark-band", "clarity-home-close", {
          eyebrow: "A good place to begin",
          heading: "Let's make the next decision feel more manageable",
          text: "Bring your questions. We will listen, understand the context and talk about a sensible next step.",
          buttonText: "Book a consultation",
          buttonLink: "/contact",
          secondaryButtonText: "Explore services",
          secondaryButtonLink: "/services",
          trustLine: "A first conversation is a chance to see if the fit feels right.",
          variant: "dark",
        }),
      ],
    },
    {
      title: "Services",
      slug: "services",
      description: "Explore Harbor & Pine bookkeeping and financial organization services.",
      content: [
        designed("TextSection", "text-centered-intro", "clarity-services-intro", {
          eyebrow: "Services",
          heading: "Useful support for the details behind your plans",
          text: "<p>Whether you are managing a business or bringing household finances into focus, start with the question you need answered.</p>",
          variant: "intro",
        }),
        designed("Services", "services-alternating-rows", "clarity-services-list", {
          eyebrow: "How we can help",
          heading: "A thoughtful foundation for everyday decisions",
          services: [
            { icon: "calculator", title: "Bookkeeping and monthly reporting", text: "<p>Keep records organized and make regular reporting more useful to the people making decisions.</p>", image: "/samples/team-at-work.jpg", imageAlt: "Small business team reviewing organized records", actionText: "Explore bookkeeping", actionLink: "/services/small-business-bookkeeping" },
            { icon: "folders", title: "Financial organization", text: "<p>Bring important information together and identify what would make day-to-day decisions easier.</p>", image: "/samples/home-interior.jpg", imageAlt: "Calm and organized home workspace", actionText: "For families", actionLink: "/families" },
            { icon: "messages-square", title: "Planning conversations", text: "<p>Talk through upcoming changes, priorities and questions with a clear view of your circumstances.</p>", image: "/samples/happy-customer.jpg", imageAlt: "Client in a planning conversation", actionText: "Book a conversation", actionLink: "/contact" },
          ],
          variant: "image-rows",
        }),
        designed("Faq", "faq-two-column", "clarity-services-faq", {
          eyebrow: "A few practical details",
          heading: "Questions about working together",
          items: [
            { question: "What happens in a first consultation?", answer: "<p>We listen to what you are trying to organize, ask a few questions about context and agree whether a next step makes sense.</p>" },
            { question: "Do I need to have everything ready?", answer: "<p>No. A short list of questions or a rough picture of what feels difficult is enough to start the conversation.</p>" },
            { question: "Can services be tailored?", answer: "<p>Yes. Scope, timing and responsibilities are discussed before any ongoing work begins.</p>" },
            { question: "Do you work remotely?", answer: "<p>Yes. Harbor & Pine can work with clients locally and remotely, depending on the service and your needs.</p>" },
          ],
          variant: "two-column",
        }),
        designed("CallToAction", "cta-primary-band", "clarity-services-close", {
          heading: "Find the support that fits your situation",
          text: "Tell us what you are working through and we will help you choose a useful starting point.",
          buttonText: "Book a consultation",
          buttonLink: "/contact",
          variant: "primary",
        }),
      ],
    },
    {
      title: "Small business bookkeeping",
      slug: "services/small-business-bookkeeping",
      description: "Bookkeeping and monthly reporting support for small businesses.",
      content: [
        designed("Hero", "hero-split-image", "clarity-bookkeeping-hero", {
          eyebrow: "For small business",
          heading: "A steadier month starts with clearer books",
          subheading: "<p>Make bookkeeping less of a last-minute scramble and more of a useful rhythm for your business.</p>",
          backgroundImage: "/samples/team-at-work.jpg",
          backgroundImageAlt: "Small business owners reviewing a monthly report",
          buttonText: "Book a consultation",
          buttonLink: "/contact",
          secondaryButtonText: "See the process",
          secondaryButtonLink: "#process",
          trustLine: "Organized records · Regular reporting · Clear responsibilities",
          variant: "split",
        }),
        designed("Services", "services-icon-list", "clarity-bookkeeping-includes", {
          eyebrow: "What's included",
          heading: "A practical monthly bookkeeping foundation",
          services: [
            { icon: "folder-check", title: "Record organization", text: "<p>Keep transactions and supporting information organized in a way that is easier to review.</p>", image: "", imageAlt: "" },
            { icon: "calendar-check", title: "Monthly reconciliation", text: "<p>Build a consistent review rhythm around accounts and the records that matter to your business.</p>", image: "", imageAlt: "" },
            { icon: "chart-no-axes-combined", title: "Useful reporting", text: "<p>Receive clear summaries that help you understand what changed and what questions to consider.</p>", image: "", imageAlt: "" },
          ],
          variant: "list",
          buttonText: "Book a consultation",
          buttonLink: "/contact",
          trustLine: "Scope and responsibilities agreed before work begins.",
        }),
        designed("Process", "process-step-cards", "clarity-bookkeeping-process", {
          eyebrow: "Our process",
          heading: "A simple rhythm, agreed together",
          text: "<p>We make the handoffs and expectations clear so the work fits the way your business operates.</p>",
          steps: [
            { title: "Understand your setup", text: "<p>Talk through your records, tools, reporting needs and current routines.</p>", icon: "messages-square" },
            { title: "Agree the scope", text: "<p>Set out responsibilities, timing and what information is needed each month.</p>", icon: "list-checks" },
            { title: "Review and refine", text: "<p>Use regular check-ins to answer questions and keep the process useful as your business changes.</p>", icon: "refresh-cw" },
          ],
          variant: "steps",
          design: { settings: { anchorId: "process" } },
        }),
        designed("Faq", "faq-accordion", "clarity-bookkeeping-faq", {
          eyebrow: "Small business bookkeeping",
          heading: "Common questions",
          items: [
            { question: "Which businesses do you work with?", answer: "<p>Harbor & Pine works with small teams and independent businesses. We can discuss your setup and needs before deciding whether the fit is right.</p>" },
            { question: "Will you work with my existing software?", answer: "<p>We will review your current tools during the first conversation and confirm what is practical for the agreed scope.</p>" },
            { question: "Do you prepare tax returns?", answer: "<p>Tax preparation is not included in this sample service. Ask us about your needs and we can clarify the appropriate next step.</p>" },
          ],
          variant: "accordion",
        }),
        designed("CallToAction", "cta-dark-band", "clarity-bookkeeping-close", {
          heading: "Make room for a calmer month-end",
          text: "Tell us about your business and what you want bookkeeping to do better.",
          buttonText: "Book a consultation",
          buttonLink: "/contact",
          variant: "dark",
        }),
      ],
    },
    {
      title: "For families",
      slug: "families",
      description: "Financial organization and planning conversations for families.",
      content: [
        designed("Hero", "hero-centered-badge", "clarity-families-hero", {
          eyebrow: "For families",
          heading: "Bring the important pieces into a clearer view",
          subheading: "<p>Organize household finances, talk through shared priorities and make the next step easier to see.</p>",
          badgeText: "A thoughtful place to start",
          buttonText: "Book a consultation",
          buttonLink: "/contact",
          secondaryButtonText: "Explore services",
          secondaryButtonLink: "/services",
          variant: "centered",
        }),
        designed("ImageWithText", "about-centered-statement", "clarity-families-story", {
          eyebrow: "A whole-household view",
          heading: "Financial organization that makes sense for your life",
          text: "<p>Every family has its own routines, responsibilities and plans. Harbor & Pine helps bring the details together so your conversations can start from a clearer place.</p><p>We can help organize information, set a regular review rhythm and identify questions for the right specialist.</p>",
          image: "/samples/home-interior.jpg",
          imageAlt: "Warm, light-filled family home",
          variant: "stacked",
        }),
        designed("Services", "services-icon-grid", "clarity-families-support", {
          eyebrow: "Ways we can help",
          heading: "Small steps toward a more organized picture",
          services: [
            { icon: "folders", title: "Bring records together", text: "<p>Organize important documents and recurring household information.</p>", image: "/samples/home-interior.jpg", imageAlt: "Organized home office" },
            { icon: "calendar-days", title: "Create a review rhythm", text: "<p>Choose a regular moment to check in on the details that matter to your household.</p>", image: "/samples/team-at-work.jpg", imageAlt: "Family advisor discussing a plan" },
            { icon: "messages-square", title: "Make space for questions", text: "<p>Talk through what is changing and identify when specialist advice may be helpful.</p>", image: "/samples/happy-customer.jpg", imageAlt: "Person planning a financial conversation" },
          ],
          variant: "grid",
        }),
        designed("CallToAction", "cta-primary-band", "clarity-families-close", {
          heading: "Start with the questions on your mind",
          text: "We will listen first, then help you decide whether and how to move forward.",
          buttonText: "Book a consultation",
          buttonLink: "/contact",
          variant: "primary",
        }),
      ],
    },
    {
      title: "About & team",
      slug: "about",
      description: "Meet Harbor & Pine Advisors and learn about its clear, collaborative approach.",
      content: [
        designed("ImageWithText", "about-image-right", "clarity-about-story", {
          eyebrow: "About Harbor & Pine",
          heading: "Good guidance begins with a better conversation",
          text: "<p>Harbor & Pine Advisors brings bookkeeping and financial organization into one calm, collaborative experience.</p><p>We believe clear explanations and steady follow-through help people feel more prepared to make their own decisions.</p>",
          image: "/samples/team-at-work.jpg",
          imageAlt: "Harbor & Pine team reviewing notes together",
          variant: "image-right",
        }),
        designed("Team", "team-editorial-profiles", "clarity-about-team", {
          eyebrow: "The people behind the work",
          heading: "Meet Mara and Theo",
          text: "<p>Two thoughtful guides, with different strengths and a shared respect for the details.</p>",
          members: [
            { name: "Mara Ellis", role: "Client advisor", bio: "<p>Mara makes room for questions and helps clients organize the choices in front of them.</p>", image: "/samples/happy-customer.jpg", imageAlt: "Mara Ellis, client advisor", imagePosition: "center" },
            { name: "Theo Bennett", role: "Bookkeeping lead", bio: "<p>Theo brings a careful eye to monthly records, reporting and the routines that keep them useful.</p>", image: "/samples/team-at-work.jpg", imageAlt: "Theo Bennett, bookkeeping lead", imagePosition: "center" },
          ],
          variant: "profiles",
        }),
        designed("TextSection", "text-mission", "clarity-about-principles", {
          eyebrow: "What guides us",
          heading: "Clarity, care and good questions",
          text: "<p>We explain what we can, say when a question belongs with another specialist and keep the next step grounded in your situation.</p>",
          attribution: "Harbor & Pine Advisors · Portland",
          variant: "mission",
        }),
        designed("CallToAction", "cta-dark-band", "clarity-about-close", {
          heading: "See if Harbor & Pine is the right fit",
          text: "A short conversation can help you decide where to begin.",
          buttonText: "Book a consultation",
          buttonLink: "/contact",
          variant: "dark",
        }),
      ],
    },
    {
      title: "Contact",
      slug: "contact",
      description: "Start a financial or bookkeeping conversation with Harbor & Pine Advisors.",
      content: [
        designed("ContactForm", "contact-form-split", "clarity-contact-form", {
          eyebrow: "Let's talk",
          heading: "What would you like to make clearer?",
          text: "<p>Tell us a little about your situation and the kind of support you are looking for.</p>",
          formName: "consultation-request",
          submitText: "Request a consultation",
          formFields: [
            { label: "Name", fieldType: "text", required: true },
            { label: "Email", fieldType: "email", required: true },
            { label: "Phone", fieldType: "tel", required: false },
            { label: "I am looking for support with", fieldType: "select", required: true, options: ["Small business bookkeeping", "Family financial organization", "Monthly reporting", "I'm not sure yet"] },
            { label: "What would you like to discuss?", fieldType: "textarea", required: true },
          ],
          note: "Please do not include account numbers or other sensitive financial information.",
          details: [
            { icon: "phone", label: "Call", value: clarityBusiness.phone },
            { icon: "mail", label: "Email", value: clarityBusiness.email },
            { icon: "map-pin", label: "Service area", value: clarityBusiness.address },
          ],
          variant: "split",
        }),
      ],
    },
    ...legalPages(clarityBusiness.businessName),
  ],
});

const studio = createPremiumTemplate({
  key: "studio",
  name: "Studio",
  description: "A bold, portfolio-led foundation for independent agencies and creative practices.",
  bestFor: ["Brand studios", "Creative agencies", "Independent designers"],
  previewImage: "/template-assets/studio-thumbnail-77a9a4cdcff6bab0.png",
  theme: themePreset("studio-forma"),
  business: studioBusiness,
  navigation: [
    { label: "Home", href: "/" },
    { label: "Work", href: "/work" },
    { label: "Studio", href: "/studio" },
    { label: "Contact", href: "/contact" },
  ],
  primaryAction: "Start a project",
  secondaryAction: "See selected work",
  pages: [
    {
      title: "Home",
      slug: "",
      description: "Forma Studio creates distinctive brand identities and useful digital experiences.",
      content: [
        designed("Hero", "hero-oversized-statement", "studio-home-hero", {
          eyebrow: "Independent brand and web studio",
          heading: "Make your next move unmistakable.",
          subheading: "<p>Forma builds identities and digital experiences for teams ready to grow into what comes next.</p>",
          badgeText: "Strategy / Identity / Digital",
          buttonText: "Start a project",
          buttonLink: "/contact",
          secondaryButtonText: "See selected work",
          secondaryButtonLink: "/work",
          trustLine: "Independent studio · Clear scope · Made to work in the real world",
          variant: "oversized",
        }),
        designed("Gallery", "portfolio-asymmetric-grid", "studio-home-work", {
          eyebrow: "Selected work",
          heading: "Different challenges. Distinctive outcomes.",
          text: "<p>A selection of identity and digital concepts from the Forma portfolio.</p>",
          images: [
            { url: "/template-assets/studio-digital.svg", alt: "Common Ground digital marketplace design concept", caption: "Common Ground · Digital experience" },
            { url: "/template-assets/studio-identity.svg", alt: "Fieldwork Botanical identity and packaging concept", caption: "Fieldwork Botanical · Visual identity" },
            { url: "/template-assets/studio-packaging.svg", alt: "Common Table packaging and campaign concept", caption: "Common Table · Packaging system" },
            { url: "/samples/home-interior.jpg", alt: "Warm interior used as visual direction for a hospitality concept", caption: "Westward House · Art direction" },
            { url: "/samples/kitchen.jpg", alt: "Kitchen scene used as visual direction for a home brand", caption: "Room to Gather · Campaign imagery" },
          ],
          columns: "3",
          variant: "portfolio-asymmetric",
        }),
        designed("Services", "services-icon-grid", "studio-home-capabilities", {
          eyebrow: "Capabilities",
          heading: "A connected set of creative tools",
          text: "<p>Bring us in for a focused challenge or build a complete system from the ground up.</p>",
          services: [
            { icon: "compass", title: "Brand strategy", text: "<p>Clarify your position, audience and the story your brand needs to tell.</p>", image: "/template-assets/studio-identity.svg", imageAlt: "Brand strategy and identity concept" },
            { icon: "shapes", title: "Visual identity", text: "<p>Create a distinctive visual language that stays recognizable across every touchpoint.</p>", image: "/template-assets/studio-packaging.svg", imageAlt: "Packaging and visual identity concept" },
            { icon: "panels-top-left", title: "Digital experiences", text: "<p>Make your website a useful, considered part of how people understand and choose you.</p>", image: "/template-assets/studio-digital.svg", imageAlt: "Responsive digital product and website concept" },
          ],
          variant: "grid",
          buttonText: "Start a project",
          buttonLink: "/contact",
        }),
        designed("Logos", "logos-wordmark-strip", "studio-home-clients", {
          eyebrow: "Selected collaborations",
          heading: "Good work is a shared effort",
          text: "Fictional client concepts shown to illustrate a range of project types.",
          logos: [
            { name: "COMMON GROUND", image: "" },
            { name: "FIELDWORK", image: "" },
            { name: "COMMON TABLE", image: "" },
            { name: "WESTWARD HOUSE", image: "" },
          ],
          variant: "strip",
        }),
        designed("TextSection", "text-editorial-split", "studio-home-philosophy", {
          eyebrow: "Studio philosophy",
          heading: "Make it meaningful. Make it work.",
          text: "<p>We believe good design is more than a polished first impression. It gives people a clearer reason to care, a better way to choose and a consistent experience after the first click.</p>",
          variant: "editorial",
        }),
        designed("CallToAction", "cta-dark-band", "studio-home-close", {
          eyebrow: "Have a good one in mind?",
          heading: "Let's make something that moves your business forward",
          text: "Tell us where you are going and what is getting in the way.",
          buttonText: "Start a project",
          buttonLink: "/contact",
          secondaryButtonText: "See selected work",
          secondaryButtonLink: "/work",
          trustLine: "A focused first conversation. No obligation to proceed.",
          variant: "dark",
        }),
      ],
    },
    {
      title: "Work",
      slug: "work",
      description: "A collection of Forma Studio brand, packaging and digital design concepts.",
      content: [
        designed("TextSection", "text-centered-intro", "studio-work-intro", {
          eyebrow: "Portfolio",
          heading: "Work built around a clear idea",
          text: "<p>Explore a handful of fictional project concepts across identity, packaging and digital experience.</p>",
          variant: "intro",
        }),
        designed("Gallery", "gallery-masonry", "studio-work-grid", {
          eyebrow: "Selected projects",
          heading: "A range of ways to make an idea tangible",
          images: [
            { url: "/template-assets/studio-digital.svg", alt: "Common Ground marketplace website concept", caption: "Common Ground · Digital experience" },
            { url: "/template-assets/studio-identity.svg", alt: "Fieldwork Botanical logo and identity concept", caption: "Fieldwork Botanical · Identity" },
            { url: "/template-assets/studio-packaging.svg", alt: "Common Table packaging concept", caption: "Common Table · Packaging" },
            { url: "/samples/home-interior.jpg", alt: "Interior art direction concept", caption: "Westward House · Art direction" },
            { url: "/samples/kitchen.jpg", alt: "Kitchen imagery concept for a home brand", caption: "Room to Gather · Campaign" },
          ],
          columns: "3",
          variant: "masonry",
          text: "<p>These are original concept visuals created for this sample site. Replace them with approved client work before publishing.</p>",
        }),
        designed("CallToAction", "cta-primary-band", "studio-work-close", {
          heading: "Have a challenge that needs a fresh perspective?",
          text: "Tell us what you are building and where you want it to go.",
          buttonText: "Start a project",
          buttonLink: "/contact",
          variant: "primary",
        }),
      ],
    },
    {
      title: "Common Ground case study",
      slug: "work/common-ground",
      description: "A sample brand and digital case study for the fictional Common Ground marketplace.",
      content: [
        designed("Hero", "hero-split-image", "studio-case-hero", {
          eyebrow: "Case study · Digital experience",
          heading: "A local marketplace with room to grow",
          subheading: "<p>How a clear brand idea can bring a neighborhood food marketplace and its makers together.</p>",
          backgroundImage: "/template-assets/studio-digital.svg",
          backgroundImageAlt: "Common Ground marketplace website concept",
          buttonText: "Start a project",
          buttonLink: "/contact",
          secondaryButtonText: "More selected work",
          secondaryButtonLink: "/work",
          variant: "split",
        }),
        designed("TextSection", "text-side-heading", "studio-case-challenge", {
          eyebrow: "The challenge",
          heading: "Make the local choice easier to find",
          text: "<p>Common Ground is a fictional neighborhood marketplace concept. The brief was to bring independent makers into one easy-to-understand digital experience without losing the character of each seller.</p>",
          variant: "two-column",
        }),
        designed("ImageWithText", "about-centered-statement", "studio-case-approach", {
          eyebrow: "The approach",
          heading: "Build a system that gives every maker a place",
          text: "<p>We paired an inviting identity with a flexible page system, consistent product cards and a simple route from discovery to local pickup details.</p><ul><li>A warm, recognizable visual language</li><li>Flexible layouts for different maker stories</li><li>Clear next steps from browsing to buying</li></ul>",
          image: "/template-assets/studio-identity.svg",
          imageAlt: "Identity system created for a fictional local marketplace",
          variant: "image-right",
        }),
        designed("Gallery", "gallery-featured-project", "studio-case-visuals", {
          eyebrow: "In the details",
          heading: "One idea, across the experience",
          images: [
            { url: "/template-assets/studio-digital.svg", alt: "Marketplace home page and product cards", caption: "Digital storefront" },
            { url: "/template-assets/studio-identity.svg", alt: "Marketplace identity concept", caption: "Visual identity" },
            { url: "/template-assets/studio-packaging.svg", alt: "Maker packaging concept", caption: "Maker touchpoints" },
          ],
          columns: "3",
          variant: "featured",
        }),
        designed("Stats", "stats-editorial-row", "studio-case-outcomes", {
          eyebrow: "Project outcomes",
          heading: "A system designed to make the next step clearer",
          text: "<p>This concept case study describes design outputs, not measured business results.</p>",
          stats: [
            { value: "01", label: "Shared identity", detail: "A consistent first impression across makers.", icon: "shapes" },
            { value: "02", label: "Flexible pages", detail: "A repeatable structure for different stories.", icon: "panels-top-left" },
            { value: "03", label: "Clear routes", detail: "A more direct path from discovery to details.", icon: "arrow-up-right" },
          ],
          variant: "row",
        }),
        designed("CallToAction", "cta-dark-band", "studio-case-close", {
          heading: "Have a project that could use a clear system?",
          text: "Let's talk through the challenge, the audience and what success should look like.",
          buttonText: "Start a project",
          buttonLink: "/contact",
          variant: "dark",
        }),
      ],
    },
    {
      title: "Studio",
      slug: "studio",
      description: "Learn about Forma Studio's collaborative, strategy-led design process.",
      content: [
        designed("ImageWithText", "about-image-right", "studio-about-story", {
          eyebrow: "About Forma",
          heading: "Small studio. Big-picture thinking.",
          text: "<p>Forma Studio is an independent brand and web design practice for teams building something worth noticing.</p><p>We combine strategic questions, careful craft and practical collaboration to make identities and digital experiences that work as hard as they look.</p>",
          image: "/template-assets/studio-identity.svg",
          imageAlt: "Original visual identity concept for a fictional botanical brand",
          variant: "image-right",
        }),
        designed("Process", "process-editorial-timeline", "studio-about-process", {
          eyebrow: "How we work",
          heading: "A clear path from first thought to launch",
          text: "<p>Bring the challenge. We will build the right team and process around it.</p>",
          steps: [
            { title: "Find the signal", text: "<p>Understand your audience, ambition and the practical constraints around the project.</p>", icon: "scan-search" },
            { title: "Make the system", text: "<p>Explore a clear creative direction and develop the parts that make it work.</p>", icon: "shapes" },
            { title: "Put it to work", text: "<p>Prepare the identity or experience for handoff, launch and what comes next.</p>", icon: "rocket" },
          ],
          variant: "timeline",
        }),
        designed("CallToAction", "cta-primary-band", "studio-about-close", {
          heading: "Looking for a creative partner?",
          text: "Tell us where you are headed and what you need help making real.",
          buttonText: "Start a project",
          buttonLink: "/contact",
          variant: "primary",
        }),
      ],
    },
    {
      title: "Contact",
      slug: "contact",
      description: "Tell Forma Studio about your brand, digital or creative project.",
      content: [
        designed("ContactForm", "contact-form-split", "studio-contact-form", {
          eyebrow: "Project inquiry",
          heading: "Tell us what you are building",
          text: "<p>A little context helps us make the first conversation useful. Share what you are planning and what a good outcome looks like.</p>",
          formName: "project-inquiry",
          submitText: "Send project inquiry",
          formFields: [
            { label: "Name", fieldType: "text", required: true },
            { label: "Email", fieldType: "email", required: true },
            { label: "Company", fieldType: "text", required: false },
            { label: "Budget range", fieldType: "select", required: true, options: ["Under $5,000", "$5,000–$10,000", "$10,000–$25,000", "$25,000+", "Still exploring"] },
            { label: "Timeline", fieldType: "select", required: true, options: ["As soon as possible", "Within 1–3 months", "Within 3–6 months", "Flexible"] },
            { label: "Services", fieldType: "checkboxes", required: false, options: ["Brand strategy", "Visual identity", "Website design", "Website development", "Campaign or art direction"] },
            { label: "Project details", fieldType: "textarea", required: true },
          ],
          note: "This form is a starting point for a conversation; scope and timing are confirmed together.",
          details: [
            { icon: "mail", label: "Email", value: studioBusiness.email },
            { icon: "map-pin", label: "Studio", value: studioBusiness.address },
          ],
          variant: "split",
        }),
      ],
    },
    ...legalPages(studioBusiness.businessName),
  ],
});

export const premiumTemplates: Record<string, PremiumWebsiteTemplate> = {
  [showcase.key]: showcase,
  [clarity.key]: clarity,
  [studio.key]: studio,
};
