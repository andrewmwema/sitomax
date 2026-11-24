"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MoveVertical } from "lucide-react";
import { puckConfig } from "@/lib/puck/config";
import { sectionCatalog, sectionContentMetadata, type SectionDesign } from "@/lib/sections/catalog";
import type { SiteTheme } from "@/lib/theme/presets";
import { DesignThumbnail } from "./design-thumbnail";

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

  return (
    <div ref={ref} inert aria-hidden="true" className="pointer-events-none min-h-10 w-full select-none overflow-hidden bg-zinc-50" data-block-thumbnail={name}>
      {name === "Spacer" ? (
        <div className="flex h-16 items-center justify-center border-y border-dashed border-zinc-200 text-zinc-400">
          <MoveVertical size={24} aria-hidden="true" />
        </div>
      ) : visible ? <DesignThumbnail design={design} theme={theme} /> : null}
    </div>
  );
}
