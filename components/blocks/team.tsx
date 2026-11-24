import type { ComponentConfig, RichText } from "@puckeditor/core";
import { designField, imageField, richTextField, richHeadingField } from "@/lib/puck/fields";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { RichHeading } from "./ui/heading";
import { RichTextContent } from "./ui/rich-text";

export type TeamProps = {
  design?: BlockDesign;
  eyebrow: string;
  heading: string;
  text: RichText;
  variant: "cards" | "profiles" | "featured";
  members: { name: string; role: string; bio: RichText; image: string; imageAlt: string; imagePosition?: "left" | "center" | "right" }[];
};

export const Team: ComponentConfig<TeamProps> = {
  label: "Team",
  fields: {
    design: designField(),
    eyebrow: { type: "text", label: "Eyebrow", contentEditable: true },
    heading: richHeadingField("Heading", 2),
    text: richTextField("Introduction"),
    variant: { type: "select", label: "Layout", options: [{ label: "Photo cards", value: "cards" }, { label: "Editorial profiles", value: "profiles" }, { label: "Featured team member", value: "featured" }] },
    members: {
      type: "array", label: "People", getItemSummary: (item) => item.name || "Team member",
      defaultItemProps: { name: "[Name]", role: "[Role]", bio: "<p>[A short introduction to this team member.]</p>", image: "/samples/team-at-work.jpg", imageAlt: "Sample team photograph" },
      arrayFields: {
        name: { type: "text", label: "Name" }, role: { type: "text", label: "Role" }, bio: richTextField("Biography"),
        image: imageField("Photo"), imageAlt: { type: "text", label: "Photo alt text" },
        imagePosition: { type: "select", label: "Photo focal point", options: [{ label: "Left", value: "left" }, { label: "Centre", value: "center" }, { label: "Right", value: "right" }] },
      },
    },
  },
  defaultProps: {
    design: {}, eyebrow: "The people behind the work", heading: "A familiar face. A thoughtful approach.",
    text: "<p>Meet the people who will help turn your ideas into a clear plan.</p>", variant: "cards",
    members: [
      { name: "[Jordan Morgan]", role: "[Founder & project lead]", bio: "<p>[Jordan] helps customers find a practical starting point and keeps the bigger picture in view.</p>", image: "/samples/team-at-work.jpg", imageAlt: "Sample team member at work", imagePosition: "left" },
      { name: "[Alex Taylor]", role: "[Customer care]", bio: "<p>From the first question to the final details, [Alex] helps keep the conversation moving.</p>", image: "/samples/happy-customer.jpg", imageAlt: "Sample portrait for a team profile", imagePosition: "left" },
      { name: "[Sam Reed]", role: "[Project specialist]", bio: "<p>[Sam] brings a careful eye to the details that make a space feel finished.</p>", image: "/samples/team-at-work.jpg", imageAlt: "Sample project specialist at work", imagePosition: "right" },
    ],
  },
  render: ({ eyebrow, heading, text, members, variant }) => (
    <Section background={variant === "featured" ? "soft" : "default"}>
      <div className="section-intro mb-[var(--section-gap)] flex max-w-2xl flex-col gap-4">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <RichHeading level={2}>{heading}</RichHeading>
        <RichTextContent value={text} />
      </div>
      <div className={variant === "profiles" ? "flex flex-col gap-8" : variant === "featured" ? "grid gap-8" : "grid gap-8 md:grid-cols-3"}>
        {members.map((member, i) => (
          <article key={i} className={`min-w-0 ${variant === "profiles" ? "grid items-center gap-6 border-t pt-8 md:grid-cols-[1fr_2fr]" : variant === "featured" ? `grid items-center gap-8 ${i === 0 ? "md:grid-cols-2" : "md:grid-cols-[1fr_2fr]"}` : "site-card overflow-hidden rounded-[var(--radius-lg)] border"}`} style={{ borderColor: "var(--color-border)" }}>
            {member.image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={member.image} alt={member.imageAlt} loading="lazy"
                className={`w-full object-cover ${variant === "profiles" ? "aspect-[4/3] max-h-80" : "aspect-[3/4]"}`}
                style={{ borderRadius: "var(--radius-lg)", objectPosition: member.imagePosition ?? "center" }} />
            ) : null}
            <div className={`flex min-w-0 flex-col gap-3 ${variant === "cards" ? "p-6" : "py-4"}`} style={{ borderColor: "var(--color-border)" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-muted)" }}>{member.role}</p>
              <h3 className={variant === "cards" ? "text-2xl" : "text-3xl sm:text-4xl"} style={{ fontFamily: "var(--font-heading)" }}>{member.name}</h3>
              <RichTextContent value={member.bio} className="max-w-[55ch]" />
            </div>
          </article>
        ))}
      </div>
    </Section>
  ),
};
