import type { ComponentConfig } from "@puckeditor/core";
import { designField } from "@/lib/puck/fields";
import { alignField, dateTimeField } from "@/lib/puck/layout-fields";
import { JUSTIFY, oneOf, safeAlign, type Align } from "@/lib/layout/guardrails";
import type { BlockDesign } from "@/lib/sections/design";
import { CountdownTimer } from "../ui/countdown-timer";

export type CountdownElementProps = {
  design?: BlockDesign;
  endsAt: string;
  endMessage: string;
  style: "tiles" | "plain";
  align: Align;
};

function defaultEnd() {
  const date = new Date(Date.now() + 7 * 86_400_000);
  date.setUTCHours(17, 0, 0, 0);
  return date.toISOString();
}

export const CountdownElement: ComponentConfig<CountdownElementProps> = {
  label: "Countdown",
  inline: true,
  fields: {
    endsAt: dateTimeField("Counts down to"),
    endMessage: { type: "text", label: "Message when finished" },
    style: {
      type: "radio",
      label: "Style",
      options: [
        { label: "Tiles", value: "tiles" },
        { label: "Plain", value: "plain" },
      ],
    },
    align: alignField(),
    design: designField("element"),
  },
  defaultProps: {
    design: {},
    endsAt: "",
    endMessage: "This offer has ended.",
    style: "tiles",
    align: "left",
  },
  resolveData: (data, { trigger }) =>
    trigger === "insert" && !data.props.endsAt
      ? { ...data, props: { ...data.props, endsAt: defaultEnd() } }
      : data,
  render: ({ endsAt, endMessage, style, align }) => {
    const tiles = oneOf(style, ["tiles", "plain"], "tiles") === "tiles";
    return (
      <div className="flex" style={{ justifyContent: JUSTIFY[safeAlign(align)] }}>
        <CountdownTimer
          endsAt={typeof endsAt === "string" ? endsAt : ""}
          endMessage={endMessage ?? ""}
          numberStyle={{
            fontFamily: "var(--font-heading)",
            fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
            lineHeight: 1.1,
            color: "var(--color-text)",
          }}
          tileStyle={
            tiles
              ? {
                  backgroundColor: "var(--color-soft-bg)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                }
              : undefined
          }
        />
      </div>
    );
  },
};
