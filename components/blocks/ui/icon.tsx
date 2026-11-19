import { ICONS, readIcon, type IconValue } from "@/lib/icons";
import { colorCss } from "@/lib/layout/guardrails";

export { ICONS, ICON_NAMES } from "@/lib/icons";

/** Editor targets are emitted only for content icons, never navigation controls. */
export function BlockIcon({ name, size = 22, className, editPath }: {
  name: IconValue; size?: number; className?: string; editPath?: string;
}) {
  const icon = readIcon(name);
  const Icon = ICONS[icon.name];
  return <Icon size={icon.size ?? size}
    style={icon.color ? { color: colorCss(icon.color) } : undefined}
    className={`${className ?? ""}${editPath ? " cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-4" : ""}`}
    {...(editPath ? {
      "data-icon-path": editPath, "data-icon-name": icon.name, role: "button", tabIndex: 0,
      "aria-label": `Change ${icon.name.replaceAll("-", " ")} icon`, "aria-hidden": false,
    } : { "aria-hidden": true })} />;
}
