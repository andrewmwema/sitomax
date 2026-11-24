"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Code2, Image as ImageIcon, LayoutGrid, MapPin, MoveVertical, Rows3, Video, type LucideIcon } from "lucide-react";
import { puckConfig } from "@/lib/puck/config";
import { isLayoutOrElementType } from "@/lib/layout/structure";
import { sectionCatalog, sectionContentMetadata, type SectionDesign } from "@/lib/sections/catalog";
import type { SiteTheme } from "@/lib/theme/presets";
import { DesignThumbnail } from "./design-thumbnail";

const EMPTY_PREVIEWS: Record<string, { icon: LucideIcon; label: string }> = {
  Section: { icon: LayoutGrid, label: "Empty section" },
  Row: { icon: Rows3, label: "Empty row" },
  Image: { icon: ImageIcon, label: "Choose an image" },
  Video: { icon: Video, label: "Add a video" },
  MapEmbed: { icon: MapPin, label: "Add an address" },
  Embed: { icon: Code2, label: "Add embed code" },
};

export function BlockThumbnail({ name, theme }: { name: string; theme: SiteTheme }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const design = useMemo<SectionDesign>(() => sectionCatalog.find((entry) => entry.blockType === name) ?? {
    id: `element-${name}`,
    name: puckConfig.components[name as keyof typeof puckConfig.components]?.label ?? name,
    blockType: name,
    category: "Text blocks",
    props: {},
    description: `Preview of the ${name} section.`,
    bestFor: ["Custom section"],
    metadata: sectionContentMetadata(name),
    thumbnail: null,
    styles: ["classic", "modern"],
  }, [name]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "100px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const placeholder = EMPTY_PREVIEWS[name];
  const PlaceholderIcon = placeholder?.icon;
  const isCompact = isLayoutOrElementType(name);

  return (
    <div ref={ref} inert aria-hidden="true" className="pointer-events-none min-h-10 w-full select-none overflow-hidden bg-zinc-50" data-block-thumbnail={name}>
      {name === "Spacer" || name === "VerticalSpace" ? (
        <div className="flex h-16 items-center justify-center border-y border-dashed border-zinc-200 text-zinc-400">
          <MoveVertical size={24} aria-hidden="true" />
        </div>
      ) : placeholder && PlaceholderIcon ? (
        <div className="flex aspect-[16/10] flex-col items-center justify-center gap-2 bg-white text-zinc-400">
          <PlaceholderIcon size={28} strokeWidth={1.5} />
          <span className="text-xs">{placeholder.label}</span>
        </div>
      ) : visible ? <DesignThumbnail design={design} theme={theme} compact={isCompact} viewportWidth={isCompact ? 480 : undefined} /> : null}
    </div>
  );
}
