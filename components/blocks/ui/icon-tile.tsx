import { BlockIcon } from "./icon";
import { readIcon, type IconValue } from "@/lib/icons";

/** Square accent tile holding a block icon. */
export function IconTile({ name, className = "", editPath }: { name: IconValue; className?: string; editPath?: string }) {
  const { size } = readIcon(name);
  return (
    <span
      className={`inline-flex size-12 shrink-0 items-center justify-center ${className}`}
      style={{
        ...(size ? { width: Math.max(48, size + 24), height: Math.max(48, size + 24) } : {}),
        backgroundColor: "color-mix(in srgb, var(--color-primary) 9%, var(--color-bg))",
        color: "var(--color-primary)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <BlockIcon name={name} editPath={editPath} />
    </span>
  );
}
