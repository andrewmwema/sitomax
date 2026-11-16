"use client";

import { useState } from "react";
import { useGetPuck } from "@puckeditor/core";
import { toPng } from "html-to-image";
import {
  SECTION_CATEGORIES,
  type SectionCategory,
} from "@/lib/sections/catalog";
import { saveSectionDesign } from "@/lib/sections/actions";
import { useSectionLibrary } from "@/components/editor/section-library";

/** Best-guess category per block type, editable in the dialog. */
const DEFAULT_CATEGORY: Record<string, SectionCategory> = {
  Hero: "Hero",
  Services: "Features/Services",
  TextSection: "Text",
  ImageWithText: "About",
  Testimonials: "Testimonials",
  Pricing: "Pricing",
  Gallery: "Gallery",
  Faq: "FAQ",
  CallToAction: "Call to action",
  ContactForm: "Contact",
  Map: "Contact",
  Footer: "Footer",
};

/** Max PNG data-URL size accepted by the server action (see zod schema). */
const MAX_THUMBNAIL_BYTES = 1_900_000;

/** Finds the section's DOM node inside Puck's preview iframe. */
function findComponentNode(componentId: string): HTMLElement | null {
  const iframe = document.querySelector<HTMLIFrameElement>(
    "iframe#preview-frame",
  );
  return (
    iframe?.contentDocument?.querySelector<HTMLElement>(
      `[data-puck-component="${CSS.escape(componentId)}"]`,
    ) ?? null
  );
}

/** Screenshot the section; a failed capture never blocks the save. */
async function captureThumbnail(componentId: string): Promise<string | undefined> {
  const node = findComponentNode(componentId);
  if (!node || node.offsetWidth === 0) return undefined;
  try {
    const dataUrl = await toPng(node, {
      canvasWidth: 640,
      canvasHeight: Math.round((640 * node.offsetHeight) / node.offsetWidth),
      pixelRatio: 1,
      backgroundColor: "#ffffff",
    });
    return dataUrl.length <= MAX_THUMBNAIL_BYTES ? dataUrl : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Super-admin dialog behind the "Save as design" action: names and
 * categorizes the selected section, captures a screenshot thumbnail and
 * stores everything in section_designs for the shared gallery.
 */
export function SaveDesignDialog() {
  const { saveDialogOpen } = useSectionLibrary();
  // Remount on every open so the selected section is snapshotted fresh.
  if (!saveDialogOpen) return null;
  return <SaveDesignDialogContent />;
}

function SaveDesignDialogContent() {
  const { closeSaveDesign } = useSectionLibrary();
  const getPuck = useGetPuck();

  // Snapshot of the selected section, taken once when the dialog opens.
  const [item] = useState<{
    id: string;
    type: string;
    props: Record<string, unknown>;
    label: string;
  } | null>(() => {
    const { selectedItem, config } = getPuck();
    if (!selectedItem) return null;
    const type = selectedItem.type as string;
    return {
      id: selectedItem.props.id,
      type,
      props: selectedItem.props as Record<string, unknown>,
      label: config.components[type]?.label ?? type,
    };
  });
  const [name, setName] = useState(item?.label ?? "");
  const [category, setCategory] = useState<SectionCategory>(
    item ? (DEFAULT_CATEGORY[item.type] ?? "Hero") : "Hero",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    if (!item || busy) return;
    setBusy(true);
    setMessage(null);
    const thumbnail = await captureThumbnail(item.id);
    const result = await saveSectionDesign({
      name,
      category,
      blockType: item.type,
      props: item.props,
      thumbnail,
    });
    setBusy(false);
    if (result.status === "success") {
      closeSaveDesign();
    } else if (result.status === "error") {
      setMessage(result.message);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Save as design"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeSaveDesign();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-zinc-900">Save as design</h2>
        {item ? (
          <form
            className="mt-4 flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700">
              Design name
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={80}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus-visible:border-zinc-500"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700">
              Category
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as SectionCategory)
                }
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus-visible:border-zinc-500"
              >
                {SECTION_CATEGORIES.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-zinc-500">
              The section&apos;s content and a screenshot are saved to the shared
              design gallery for every client.
            </p>
            {message ? <p className="text-xs text-red-600">{message}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeSaveDesign}
                className="rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || name.trim().length === 0}
                className="rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save design"}
              </button>
            </div>
          </form>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">
            Select a section on the canvas first.
          </p>
        )}
      </div>
    </div>
  );
}
