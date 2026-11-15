import { BlockIcon } from "./icon";

/** Square accent tile holding a block icon. */
export function IconTile({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span
      className={`inline-flex size-12 shrink-0 items-center justify-center ${className}`}
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-primary) 9%, var(--color-bg))",
        color: "var(--color-primary)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <BlockIcon name={name} />
    </span>
  );
}
