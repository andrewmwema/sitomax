import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { blogBlockSchema } from "@/lib/blog";
import { RESERVED_PAGE_SLUGS } from "@/lib/page-slugs";
import { headerEditSchema, headerSchema } from "@/lib/header";
import { themeSchema } from "@/lib/theme/schema";
import { customSectionSchema } from "./custom-layout";
import { designPatchSchema } from "./edit-design";
import { agentFieldSchemas } from "./site-schemas";

const jsonScalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const jsonValues: z.ZodType[] = [jsonScalar];
for (let depth = 1; depth <= 5; depth++) {
  const child = jsonValues[depth - 1];
  jsonValues.push(z.union([
    jsonScalar,
    z.array(child).max(80),
    z.record(z.string(), child),
  ]));
}
const jsonObject = z.record(z.string(), jsonValues[5]);
// A section is always addressed by the page it is on and its id there: ids repeat across pages.
const sectionRef = z.object({
  pageId: z.uuid().describe("The page the section is on, as listed in the site overview."),
  sectionId: z.string().min(1).max(200).describe("The section's id on that page, as listed in the site overview or returned by get_page."),
});
// The same rules as the Pages panel and the database, so staged page settings can always be applied.
const navLabel = z.string().trim().min(1).max(40).regex(/^\S+( \S+){0,2}$/, "Use at most three words for a menu label.");
const pageSlug = z.string().trim().min(1).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine((slug) => !RESERVED_PAGE_SLUGS.has(slug), "That page address is reserved. Choose another.");

const pageSections = z.array(z.object({
  designId: z.string().min(1).max(100).optional(),
  customSection: customSectionSchema.optional(),
  props: jsonObject.optional(),
}));
const BLOG_BLOCKS = 'Write the post as a list of blocks, each an object with a type: {"type":"paragraph","html":"<p>…</p>"} (p, strong, em and a tags), {"type":"heading","level":2,"text":"…"} (level is the number 2, 3 or 4), {"type":"list","ordered":false,"items":["…"]}, {"type":"quote","text":"…","attribution":"…"}, {"type":"callout","title":"…","text":"…"}, {"type":"divider"} or {"type":"table","rows":[["…","…"]]}. Images and videos cannot be added.';
const blogBlocks = z.array(blogBlockSchema).min(1).max(200);
const CUSTOM_LAYOUT = `A custom layout is rows of columns of elements, written as an object (never a JSON string). Text elements take plain text with blank lines between paragraphs and optional **bold** or *emphasis*, not HTML. An Image element's query is only a search hint: the image is inserted empty, then chosen with set_image. Gaps and spacing are numbers from this scale: 0, 4, 8, 12, 16, 24, 32, 48, 64, 80, 96, 128. Options that look like numbers are strings: Icon size "24"|"32"|"48"|"64", Divider thickness "1"|"2"|"4", Image and Divider width "25"|"50"|"75"|"100"; Heading level is "h1" to "h4". A row's layout has one part per column: "1", "1-1", "1-2", "2-1", "1-1-1" or "1-1-1-1". Example customSection: {"background":"soft","width":"contained","rowGap":32,"rows":[{"layout":"1-1","gap":32,"columns":[{"surface":"none","verticalAlign":"center","gap":16,"elements":[{"type":"Heading","text":"Why choose us","level":"h2","align":"left"},{"type":"IconList","items":[{"icon":"clock","text":"On time"},{"icon":"sparkles","text":"Tidy"}],"iconColor":"primary","size":"base","gap":12},{"type":"Button","label":"Contact us","href":"/contact","variant":"primary","size":"md","align":"left"}]},{"surface":"card","verticalAlign":"center","gap":16,"elements":[{"type":"Icon","icon":"shield-check","size":"48","style":"soft","color":"primary","align":"center"},{"type":"Text","text":"Fully insured.","align":"center"}]}]}]}`;
const DESIGN = `design keys, all optional, send only what changes: background {"type":"none"} | {"type":"color","color":"#rrggbb"} | {"type":"gradient","from":"#rrggbb","to":"#rrggbb","angle":0-360}; spacing per device (desktop, tablet, mobile) with paddingTop, paddingBottom, paddingLeft, paddingRight, marginTop, marginBottom, marginLeft, marginRight as numbers 0-240; appearance per device with textColor and backgroundColor ("#rrggbb"), borderRadius (0-48) and align ("left"|"center"|"right"); border {width 0-8, color, radius 0-48}; shadow "none"|"soft"|"medium"|"strong"; animation {trigger "none"|"entrance"|"scroll", type "fade"|"fade-up"|"fade-down"|"slide-left"|"slide-right"|"zoom-in", duration, delay}; settings {hideOnDesktop, hideOnTablet, hideOnMobile, fullBleed}. Text colour is appearance.desktop.textColor; there is no textColor or padding at the top. Example design: {"background":{"type":"color","color":"#0b2545"},"appearance":{"desktop":{"textColor":"#ffffff","align":"center"}},"spacing":{"desktop":{"paddingTop":96,"paddingBottom":96}},"shadow":"soft","border":{"radius":16}}`;

/** The theme settings the agent may change. Logo and favicon are set in the editor. */
export const themePatchSchema = themeSchema.pick({
  style: true, headingFont: true, bodyFont: true, radius: true, buttonStyle: true,
}).extend({ colors: themeSchema.shape.colors.unwrap().strict().optional() }).strict();
// What the model is shown for inputs the tools read leniently: the exact keys and allowed values.
const headerDevice = headerEditSchema.shape.settings.optional();
const headerShown = z.object({
  logo: headerSchema.shape.logo.unwrap().partial().optional(),
  menu: z.object({ source: z.enum(["pages", "custom"]), items: z.array(z.object({
    label: z.string(), href: z.string(), children: z.array(z.object({ label: z.string(), href: z.string() })).optional(),
  })) }).partial().optional(),
  cta: headerSchema.shape.cta.unwrap().partial().optional(),
  contactsInMenu: z.boolean().optional(),
  desktop: headerDevice, tablet: headerDevice, mobile: headerDevice,
});
const footerShown = z.object({
  businessName: z.string(), tagline: z.string(), variant: agentFieldSchemas("Footer").variant,
  navigation: z.array(z.object({ label: z.string(), href: z.string() })), socialLinks: agentFieldSchemas("Footer").socialLinks,
}).partial();

const specs = [
  { name: "get_site_overview", description: "Read the site overview: every page with its pageId and the sectionId of each of its sections, plus theme, header, footer, business, blog and SEO. The latest overview is already at the end of the conversation, so this is rarely needed.", schema: z.object({}) },
  { name: "get_page", description: 'Read a page\'s sections in full. Pass sectionIds, a list, to read only the sections you are changing. Example: {"pageId":"<pageId>","sectionIds":["<sectionId>"]}', schema: z.object({
    pageId: z.uuid(), sectionIds: z.array(z.string().min(1).max(200)).min(1).max(30).optional(),
  }) },
  { name: "search_site", description: "Search text across pages and blog posts.", schema: z.object({ query: z.string().trim().min(1).max(200) }) },
  { name: "list_section_designs", description: "List curated section designs. With a blockType, also returns that block's editable props.", schema: z.object({ blockType: z.string().max(80).optional() }) },
  { name: "get_blog_posts", description: "List blog draft and published post summaries.", schema: z.object({
    query: z.string().max(200).optional(), status: z.enum(["draft", "scheduled", "published", "all"]).default("all"),
    limit: z.number().int().min(1).max(30).default(10),
  }) },
  { name: "get_post", description: "Read a blog post draft by ID.", schema: z.object({ postId: z.uuid() }) },
  { name: "plan", description: 'Present an ordered plan and wait for approval before broad changes. The user reads the steps: write them in plain words, name the page each step works on, and never include ids. Once approved, every step must be carried out or reported as skipped. Example: {"steps":["Home: rewrite the hero heading and button","About: add a section about our values"]}', schema: z.object({
    steps: z.array(z.string().trim().min(1).max(240)).min(1).max(12), rationale: z.string().max(1000).optional(),
  }) },
  { name: "report_progress", description: 'Record progress on the approved plan. Report a step as done once every change it needs is staged, or as skipped, with the reason in note, when it cannot be done. Several steps can be reported at once. Example: {"steps":[{"step":1,"status":"done"},{"step":3,"status":"skipped","note":"No prices are on file."}]}', schema: z.object({
    steps: z.array(z.object({
      step: z.number().int().min(1).max(12).describe("The step's number in the approved plan, starting at 1."),
      status: z.enum(["done", "skipped"]), note: z.string().trim().max(300).optional(),
    }).refine((entry) => entry.status === "done" || Boolean(entry.note), "Give the reason a step was skipped in note.")).min(1).max(12),
  }) },
  { name: "ask_user", description: "Ask one genuinely ambiguous question and optionally provide choices.", schema: z.object({
    question: z.string().trim().min(1).max(1000), options: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
  }) },
  { name: "update_theme", description: 'Stage site theme changes. patch holds only what changes; every key is optional: style ("classic"|"modern"), headingFont and bodyFont (a font name from the schema), radius (a number 0-48), buttonStyle ("rounded"|"square"|"pill"), colors {primary, secondary, accent, background, text} as "#rrggbb". Text is kept contrast-safe. Example: {"patch":{"colors":{"primary":"#0b2545","secondary":"#c9a227"},"headingFont":"Playfair Display","radius":8}}',
    schema: z.object({ patch: jsonObject }), shown: z.object({ patch: themePatchSchema }) },
  { name: "update_header", description: 'Stage global header settings. header holds only the settings to change; they are merged into the current header, which the overview shows. Its keys, all optional: logo, menu, cta, contactsInMenu, and desktop, tablet and mobile for the look on each screen size (colours as "#rrggbb"; sticky, shadow, border, blur, shrink and uppercase are true or false; height, padding, logoHeight and fontSize are numbers; weight is "400"|"500"|"600"|"700"). Example: {"header":{"desktop":{"sticky":true,"shadow":true,"color":"#0b2545","textColor":"#ffffff"},"cta":{"text":"Book a visit","href":"/contact","style":"primary"}}}',
    schema: z.object({ header: jsonObject }), shown: z.object({ header: headerShown }) },
  { name: "update_footer", description: 'Stage a footer change. The footer is a section repeated on every page, so the same change is applied to the footer of every page. Send props for content, design for the look, or both, each holding only what changes. props keys: businessName, tagline, variant ("columns"|"centered"|"compact"), navigation [{label, href}], socialLinks [{platform, url}]. Colours and spacing go in design, with the same keys as update_section_design. Phone, email, address and hours come from Business information and cannot be changed. Example: {"props":{"tagline":"Here whenever you need us."},"design":{"background":{"type":"color","color":"#0b2545"},"appearance":{"desktop":{"textColor":"#ffffff"}}}}',
    schema: z.object({
      props: jsonObject.optional(), design: jsonObject.optional(),
    }).refine((input) => input.props !== undefined || input.design !== undefined, "Send props or design to change."),
    shown: z.object({ props: footerShown.optional(), design: designPatchSchema.optional() }) },
  { name: "update_section_props", description: 'Stage content changes to a section or a nested layout element (use its id as sectionId). props is an object, never a JSON string, holding only the properties to change, named exactly as get_page shows them for that section; list_section_designs with a blockType lists a block\'s properties and allowed values. A list property is replaced whole, with every item complete. Images are changed with set_image, colours and spacing with update_section_design. Example: {"pageId":"<pageId>","sectionId":"<sectionId>","props":{"buttonText":"Book a visit","buttonLink":"/contact"}}', schema: sectionRef.extend({ props: jsonObject }) },
  { name: "update_section_design", description: `Stage design changes to a section or a nested layout element. ${DESIGN}`,
    schema: sectionRef.extend({ design: jsonObject }), shown: sectionRef.extend({ design: designPatchSchema }) },
  { name: "switch_section_design", description: 'Switch a section to a curated design while preserving compatible content. designId comes from list_section_designs. Example: {"pageId":"<pageId>","sectionId":"<sectionId>","designId":"<designId>"}', schema: sectionRef.extend({
    designId: z.string().min(1).max(100),
  }) },
  { name: "insert_section", description: `Insert a section into a page: either a curated designId from list_section_designs (optionally with props for its content, as in update_section_props) or a customSection, never both. position is a number, 0 for the top; leave it out to add at the end. Example with a curated design: {"pageId":"<pageId>","designId":"<designId>","position":2,"props":{"heading":"Questions we hear often"}}. ${CUSTOM_LAYOUT}`, schema: z.object({
    pageId: z.uuid(), designId: z.string().min(1).max(100).optional(), customSection: customSectionSchema.optional(),
    position: z.number().int().min(0).optional(), props: jsonObject.optional(),
  }) },
  { name: "move_section", description: 'Move a section to a zero-based position on its page. Example: {"pageId":"<pageId>","sectionId":"<sectionId>","position":0}', schema: sectionRef.extend({
    position: z.number().int().min(0),
  }) },
  { name: "duplicate_section", description: "Duplicate a section on its page.", schema: sectionRef.extend({
    position: z.number().int().min(0).optional(),
  }) },
  { name: "delete_section", description: "Remove a section from a page.", schema: sectionRef },
  { name: "create_page", description: 'Stage a new page. slug is the address without slashes (lowercase letters, digits and hyphens); navLabel is the menu label, at most three words. Each section is an object with either a curated designId (optionally with props for its content) or a customSection as in insert_section. The shared footer is added automatically. Example: {"title":"Careers","slug":"careers","navLabel":"Careers","sections":[{"designId":"<designId from list_section_designs>","props":{"heading":"Join our team"}}]}', schema: z.object({
    title: z.string().trim().min(1).max(200),
    slug: pageSlug,
    navLabel,
    sections: pageSections.max(20),
  }) },
  { name: "update_page_settings", description: 'Stage page settings. Send only what changes: title, navLabel (the menu label, at most three words), seoTitle, seoDescription, hidden (true hides the page from the menu). Example: {"pageId":"<pageId>","seoTitle":"Plumber in Example City | Harbour Plumbing","seoDescription":"Repairs, boiler servicing and bathroom fitting across Example City."}', schema: z.object({
    pageId: z.uuid(), title: z.string().trim().min(1).max(200).optional(), navLabel: navLabel.optional(),
    seoTitle: z.string().max(200).optional(), seoDescription: z.string().max(500).optional(), hidden: z.boolean().optional(),
  }) },
  { name: "set_image", description: 'Search stock photos, save one to site assets, and stage it into an image field of a section or nested element. field is the image property as get_page shows it: backgroundImage, services.0.image for the first item of a list, or src for an Image element. query is a few plain words to search for. Example: {"pageId":"<pageId>","sectionId":"<sectionId>","field":"backgroundImage","query":"plumber fixing a sink","alt":"A plumber fixing a kitchen sink"}', schema: sectionRef.extend({
    query: z.string().trim().min(1).max(100), field: z.string().min(1).max(120), alt: z.string().max(500).optional(),
  }) },
  { name: "create_blog_post_draft", description: `Stage a new unpublished blog post draft. slug is lowercase words joined by hyphens. ${BLOG_BLOCKS} Example: {"title":"Preventing frozen pipes","slug":"preventing-frozen-pipes","excerpt":"Simple steps before the cold arrives.","blocks":[{"type":"heading","level":2,"text":"Before the cold arrives"},{"type":"paragraph","html":"<p>Insulate pipes in unheated rooms.</p>"}]}`, schema: z.object({
    title: z.string().trim().min(1).max(200), subtitle: z.string().max(300).default(""),
    excerpt: z.string().max(500).default(""), slug: z.string().trim().min(1).max(1000),
    blocks: blogBlocks, seoTitle: z.string().max(200).default(""), seoDescription: z.string().max(500).default(""),
  }) },
  { name: "update_blog_post_draft", description: "Stage changes to an existing unpublished blog post draft. Send only the fields to change; blocks replaces the whole post body, so keep the blocks you do not change, including images, exactly as get_post returned them.", schema: z.strictObject({
    postId: z.uuid(), title: z.string().trim().min(1).max(200).optional(), subtitle: z.string().max(300).optional(),
    excerpt: z.string().max(500).optional(), slug: z.string().trim().min(1).max(1000).optional(),
    blocks: blogBlocks.optional(), seoTitle: z.string().max(200).optional(), seoDescription: z.string().max(500).optional(),
    coverAlt: z.string().max(500).optional(),
  }) },
] as const;

export const agentToolRegistry = specs.map((spec) => ({
  ...spec,
  write: ![
    "get_site_overview", "get_page", "search_site", "list_section_designs", "get_blog_posts", "get_post", "plan", "report_progress", "ask_user",
  ].includes(spec.name),
}));

export const agentToolSchemas = new Map<string, z.ZodType>(agentToolRegistry.map(({ name, schema }) => [name, schema]));
/** Each tool's own parameter names, for telling them from settings that belong inside one of them. */
export const agentToolParameters = new Map<string, ReadonlySet<string>>(agentToolRegistry.map(({ name, schema }) =>
  [name, new Set(Object.keys((schema as z.ZodObject).shape))]));

/**
 * `shown` is the schema the model sees when it is more exact than the one a
 * tool validates with: the tool reads such input leniently and checks it
 * against the real schema itself.
 */
export const agentTools: Anthropic.Tool[] = agentToolRegistry.map((tool) => {
  const { name, description } = tool;
  const { $schema: dialect, ...input_schema } = z.toJSONSchema("shown" in tool ? tool.shown : tool.schema, { io: "input", reused: "ref" });
  void dialect;
  return { name, description, strict: false, input_schema: { ...input_schema, type: "object" } };
});
