"use client";

import { useState } from "react";
import { useGetPuck } from "@puckeditor/core";
import {
  SECTION_CATEGORIES,
  type SectionCategory,
} from "@/lib/sections/catalog";
import { saveSectionDesign } from "@/lib/sections/actions";
import { useSectionLibrary } from "@/components/editor/section-library";

/** Best-guess category per block type, editable in the dialog. */
const DEFAULT_CATEGORY: Record<string, SectionCategory> = {
  Hero: "Hero",
  Services: "Services",
  Stats: "Stats",
  TextSection: "Text blocks",
  ImageWithText: "About",
  Testimonials: "Testimonials",
  Logos: "Logos",
  Team: "Team",
  Process: "Services",
  Pricing: "Pricing",
  Gallery: "Gallery",
  Faq: "FAQ",
  CallToAction: "Call to action",
  ContactForm: "Contact",
  Map: "Contact",
  Footer: "Footer",
  Navigation: "Hero",
};

/**
 * Names and categorizes a reusable section. Thumbnails render live.
 */
export function SaveDesignDialog() {
  const { saveDialogOpen } = useSectionLibrary();
  // Remount on every open so the selected section is snapshotted fresh.
  if (!saveDialogOpen) return null;
  return <SaveDesignDialogContent />;
}

function SaveDesignDialogContent() {
  const { closeSaveDesign, isSuperAdmin } = useSectionLibrary();
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
  const [isGlobal, setIsGlobal] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    if (!item || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await saveSectionDesign({
        name, category, blockType: item.type, props: item.props, isGlobal,
      });
      if (result.status === "success") closeSaveDesign();
      else if (result.status === "error") setMessage(result.message);
    } catch (error) {
      console.error("Unable to save design", error);
      setMessage("Could not save the design. Please try again.");
    } finally {
      setBusy(false);
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
            {isSuperAdmin ? (
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input type="checkbox" checked={isGlobal} onChange={(event) => setIsGlobal(event.target.checked)} />
                Share globally with all clients
              </label>
            ) : null}
            <p className="text-xs text-zinc-500">
              {isGlobal ? "Available to every client in Designed." : "Only you can see this design in Saved."}
              {" "}Previews use the current site&apos;s theme.
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
