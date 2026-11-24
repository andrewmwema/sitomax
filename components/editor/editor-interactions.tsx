"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createUsePuck, useGetPuck, type Permissions } from "@puckeditor/core";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { z } from "zod";
import { canPlace, editorTree, insertAt, readClipboard, ROOT_ZONE, selectionPath, type EditorItem } from "@/lib/editor/tree";
import { buildDesignItem } from "@/lib/sections/library";
import { sanitizePuckData } from "@/lib/richtext";
import type { BlockDesign } from "@/lib/sections/design";
import { blankSection, ELEMENT_TYPES, type LayoutItem } from "@/lib/layout/structure";
import { useSectionLibrary } from "./section-library";
import { appPoint, useInteractions } from "./interaction-context";
import { useOptionalAiAgentPanel } from "./ai-agent-context";

const usePuck = createUsePuck();
const CLIPBOARD_KEY = "agency-editor-block";

export function SelectionMenuButton() {
  const { setMenu } = useInteractions();
  const id = usePuck((state) => state.selectedItem?.props.id);
  return id ? <button type="button" aria-label="More block actions" className="rounded p-1 hover:bg-zinc-100"
    onClick={(event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const point = appPoint(event.currentTarget.ownerDocument, rect.left, rect.bottom);
      setMenu({ id, ...point });
    }}><MoreHorizontal size={16} /></button> : null;
}

export function EditorInteractions() {
  const agent = useOptionalAiAgentPanel();
  const ui = useInteractions();
  const { setMenu, menu } = ui;
  const { isSuperAdmin, openLibrary, openSaveDesign } = useSectionLibrary();
  const data = usePuck((state) => state.appState.data);
  const selectedId = usePuck((state) => state.selectedItem?.props.id);
  const getPuck = useGetPuck();
  const entries = useMemo(() => editorTree(data), [data]);
  const path = selectionPath(entries, selectedId ?? "");
  const menuEntry = entries.find((entry) => entry.item.props.id === ui.menu?.id);
  const menuRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<{ text: string; restore?: { item: EditorItem; zone: string; index: number } } | null>(null);
  const [adding, setAdding] = useState(false);
  const [anchor, setAnchor] = useState("");
  const [anchorOpen, setAnchorOpen] = useState(false);

  const select = useCallback((id: string) => {
    const selector = getPuck().getSelectorForId(id);
    if (selector) getPuck().dispatch({ type: "setUi", ui: { itemSelector: selector, rightSideBarVisible: true } });
  }, [getPuck]);

  useEffect(() => {
    let activeDoc: Document | null = null;
    let unbind = () => {};
    const bind = () => {
      const doc = document.querySelector<HTMLIFrameElement>("#preview-frame")?.contentDocument;
      if (!doc || doc === activeDoc) return;
      unbind();
      activeDoc = doc;
      const onContext = (event: MouseEvent) => {
        const element = event.target instanceof doc.defaultView!.Element ? event.target as Element : null;
        const id = element?.closest("[data-puck-component]")?.getAttribute("data-puck-component");
        if (!id) return;
        event.preventDefault();
        select(id);
        setMenu({ id, ...appPoint(doc, event.clientX, event.clientY) });
      };
      const close = () => setMenu(null);
      doc.addEventListener("contextmenu", onContext);
      doc.addEventListener("pointerdown", close);
      unbind = () => { doc.removeEventListener("contextmenu", onContext); doc.removeEventListener("pointerdown", close); };
    };
    bind();
    const timer = setInterval(bind, 200);
    return () => { clearInterval(timer); unbind(); };
  }, [select, setMenu]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(null); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    const timer = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
    return () => { cancelAnimationFrame(timer); document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [menu, setMenu]);

  const finish = (text?: string, restore?: NonNullable<typeof notice>["restore"]) => {
    ui.setMenu(null); setAdding(false); setAnchorOpen(false);
    if (text) setNotice({ text, restore });
  };
  const patch = (props: Record<string, unknown>) => {
    if (!menuEntry) return;
    const { dispatch, getPermissions } = getPuck();
    if (getPermissions({ item: menuEntry.item }).edit === false) { finish("Only your agency can edit this block."); return; }
    dispatch({ type: "replace", destinationZone: menuEntry.selector.zone ?? ROOT_ZONE, destinationIndex: menuEntry.selector.index,
      data: { ...menuEntry.item, props: { ...menuEntry.item.props, ...props } }, recordHistory: true });
  };
  const design = (menuEntry?.item.props.design ?? {}) as BlockDesign;
  const target = () => {
    if (!menuEntry) return null;
    if (menuEntry.item.type === "Column") {
      return { zone: `${menuEntry.item.props.id}:content`, parent: menuEntry,
        index: Array.isArray(menuEntry.item.props.content) ? menuEntry.item.props.content.length : 0, slot: "content" };
    }
    const parent = entries.find((entry) => entry.item.props.id === menuEntry.parentId);
    const zone = menuEntry.selector.zone ?? ROOT_ZONE;
    return { zone, parent, index: menuEntry.selector.index + 1, slot: zone.slice(zone.lastIndexOf(":") + 1) };
  };
  const insert = (item: EditorItem) => {
    const destination = target();
    if (!destination) return;
    if (!canPlace(item.type, destination.parent?.item.type, destination.slot)) {
      finish("This block cannot be placed here. Paste into the same layout level."); return;
    }
    const cloned = buildDesignItem({
      id: item.props.id, name: item.type, blockType: item.type, category: "Blank",
      props: item.props, description: `Copied ${item.type} section.`, bestFor: ["Custom section"],
      metadata: { editableFields: [], repeatableFields: [], limits: {}, imageSlots: [] },
      thumbnail: null, styles: ["classic", "modern"],
    });
    const clean = sanitizePuckData({ content: [{ ...cloned, props: { ...cloned.props, id: String(cloned.props.id) } }] }).content[0];
    const { dispatch } = getPuck();
    dispatch({ type: "setData", data: (previous) => insertAt(previous, destination.zone, destination.index, clean), recordHistory: true });
    dispatch({ type: "setUi", ui: { itemSelector: { index: destination.index, zone: destination.zone } } });
    finish();
  };
  const permission: Partial<Permissions> = menuEntry ? getPuck().getPermissions({ item: menuEntry.item }) : {};
  const action = (label: string, callback: () => void, disabled = false) => <button key={label} type="button" role="menuitem"
    disabled={disabled} onClick={callback} className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-zinc-100 focus:bg-zinc-100 disabled:opacity-35">{label}</button>;
  return <>
    <nav aria-label="Selection breadcrumb" className="fixed bottom-0 left-0 right-0 z-30 flex min-h-9 items-center gap-1 overflow-x-auto border-t border-zinc-200 bg-white px-4 py-2 text-xs text-zinc-600">
      <button type="button" onClick={() => getPuck().dispatch({ type: "setUi", ui: { itemSelector: null } })}>Page</button>
      {path.map((entry) => <span key={entry.item.props.id} className="flex items-center gap-1 whitespace-nowrap">
        <ChevronRight size={12} /><button type="button" aria-current={entry.item.props.id === selectedId ? "true" : undefined}
          onClick={() => select(entry.item.props.id)}>{getPuck().config.components[entry.item.type]?.label ?? entry.item.type}</button>
      </span>)}
    </nav>
    {ui.menu && menuEntry ? <div ref={menuRef} role="menu" aria-label="Block actions"
      style={{ position: "fixed", zIndex: 150, left: Math.max(8, Math.min(ui.menu.x, window.innerWidth - 260)), top: Math.max(8, Math.min(ui.menu.y, window.innerHeight - 560)), maxHeight: "calc(100vh - 16px)", width: 250 }}
      className="overflow-y-auto rounded-xl border border-zinc-200 bg-white p-2 text-zinc-800 shadow-xl"
      onKeyDown={(event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(i + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }}>
      <p className="px-3 py-1 text-[10px] font-semibold uppercase text-zinc-400">{menuEntry.item.type}</p>
      {action("Edit content", () => { select(menuEntry.item.props.id); ui.setTab("content"); finish(); })}
      {action("Edit design", () => { select(menuEntry.item.props.id); ui.setTab("style"); finish(); }, permission.edit === false)}
      {agent && !menuEntry.parentId ? action("Ask AI about this section", () => {
        agent.openWith({ sectionId: menuEntry.item.props.id }); finish();
      }, permission.edit === false) : null}
      {action(menuEntry.item.type === "Row" ? "Add row below" : menuEntry.item.type === "Column" ? "Add element" : "Add element below", () => {
        if (menuEntry.item.type === "Row") { insert((blankSection().props.rows as LayoutItem[])[0]); return; }
        if (!menuEntry.parentId) { openLibrary(menuEntry.selector.index + 1); finish(); }
        else setAdding(!adding);
      })}
      {adding ? <div className="grid grid-cols-2 border-y py-2">
        {ELEMENT_TYPES.filter((type) => isSuperAdmin || type !== "Embed").map((type) => action(type, () => {
          const defaults = getPuck().config.components[type]?.defaultProps ?? {};
          insert({ type, props: { ...defaults, id: `${type}-${crypto.randomUUID()}` } });
        }))}
      </div> : null}
      {action("Duplicate", () => {
        getPuck().dispatch({ type: "duplicate", sourceIndex: menuEntry.selector.index, sourceZone: menuEntry.selector.zone ?? ROOT_ZONE, recordHistory: true }); finish();
      }, permission.duplicate === false || menuEntry.item.type === "Column")}
      {action("Copy", () => {
        try {
          sessionStorage.setItem(CLIPBOARD_KEY, JSON.stringify({ accountId: ui.accountId, userId: ui.userId, item: menuEntry.item }));
          finish("Block copied. Paste on any page or site in this account.");
        } catch (error) { console.error("Unable to copy block", error); finish("Could not copy the block."); }
      }, menuEntry.item.type === "Column")}
      {action("Paste below", () => {
        try {
          const raw = sessionStorage.getItem(CLIPBOARD_KEY);
          if (!raw) { finish("Copy a block first."); return; }
          insert(readClipboard(raw, ui.accountId, ui.userId, isSuperAdmin));
        } catch (error) {
          console.error("Unable to paste block", error);
          finish(error instanceof z.ZodError ? "Only blocks copied by you from this account can be pasted." : error instanceof Error ? error.message : "Could not paste this block.");
        }
      })}
      {(["up", "down"] as const).map((direction) => action(`Move ${direction}`, () => {
        const index = menuEntry.selector.index + (direction === "up" ? -1 : 1);
        const siblings = entries.filter((entry) => entry.selector.zone === menuEntry.selector.zone);
        if (index < 0 || index >= siblings.length) { finish("Already at the edge of this layout."); return; }
        getPuck().dispatch({ type: "reorder", sourceIndex: menuEntry.selector.index, destinationIndex: index, destinationZone: menuEntry.selector.zone ?? ROOT_ZONE, recordHistory: true }); finish();
      }, permission.drag === false || menuEntry.item.type === "Column"))}
      <div className="my-1 border-t" />
      {(["left", "center", "right"] as const).map((align) => action(`Align ${align}`, () => {
        patch({ design: { ...design, appearance: { ...design.appearance, [ui.device]: { ...design.appearance?.[ui.device], align } } } }); finish();
      }, permission.edit === false))}
      {action("Animation", () => { select(menuEntry.item.props.id); ui.setTab("animation"); finish(); }, permission.edit === false)}
      {(["Desktop", "Tablet", "Mobile"] as const).map((device) => {
        const key = `hideOn${device}` as const;
        return action(`${design.settings?.[key] ? "Show" : "Hide"} on ${device.toLowerCase()}`, () => {
          patch({ design: { ...design, settings: { ...design.settings, [key]: !design.settings?.[key] } } }); finish();
        }, permission.edit === false);
      })}
      {action("Set as anchor", () => { setAnchor(design.settings?.anchorId ?? ""); setAnchorOpen(!anchorOpen); }, permission.edit === false)}
      {anchorOpen ? <form className="flex flex-col gap-2 p-2 text-xs" onSubmit={(event) => {
        event.preventDefault();
        if (anchor && !/^[a-zA-Z][\w-]{0,79}$/.test(anchor)) { setNotice({ text: "Use a letter, then letters, numbers, - or _ (up to 80)." }); return; }
        patch({ design: { ...design, settings: { ...design.settings, anchorId: anchor } } }); finish("Anchor saved.");
      }}>
        <input aria-label="Anchor ID" value={anchor} onChange={(event) => setAnchor(event.target.value)} className="rounded border p-1" />
        <button type="submit">Save anchor</button>
        <button type="button" disabled={!anchor} onClick={async () => {
          try { await navigator.clipboard.writeText(`#${anchor}`); setNotice({ text: "Anchor link copied." }); }
          catch (error) { console.error("Unable to copy anchor", error); setNotice({ text: "Could not copy the anchor link." }); }
        }}>Copy anchor link</button>
      </form> : null}
      {action("Select parent", () => { if (menuEntry.parentId) select(menuEntry.parentId); else getPuck().dispatch({ type: "setUi", ui: { itemSelector: null } }); finish(); })}
      {isSuperAdmin && !menuEntry.parentId ? action("Save as design", () => { select(menuEntry.item.props.id); openSaveDesign(); finish(); }) : null}
      {action("Delete", () => {
        getPuck().dispatch({ type: "remove", index: menuEntry.selector.index, zone: menuEntry.selector.zone ?? ROOT_ZONE, recordHistory: true });
        finish("Block deleted.", { item: structuredClone(menuEntry.item), zone: menuEntry.selector.zone ?? ROOT_ZONE, index: menuEntry.selector.index });
      }, permission.delete === false || menuEntry.item.type === "Column")}
    </div> : null}
    {notice ? <div role="status" className="fixed right-5 bottom-12 z-[170] flex max-w-sm items-center gap-3 rounded-xl bg-zinc-900 p-4 text-xs text-white shadow-xl">
      {notice.text}
      {notice.restore ? <button type="button" className="font-semibold underline" onClick={() => {
        const { item, zone, index } = notice.restore!;
        try {
          const { appState, dispatch } = getPuck();
          if (editorTree(appState.data).some((entry) => entry.item.props.id === item.props.id)) {
            setNotice({ text: "This block is already restored." }); return;
          }
          const restored = insertAt(appState.data, zone, index, item);
          dispatch({ type: "setData", data: restored, recordHistory: true });
          dispatch({ type: "setUi", ui: { itemSelector: { zone, index } } });
          setNotice(null);
        } catch (error) {
          console.error("Unable to undo block deletion", error);
          setNotice({ text: "The parent layout was removed. Use the editor's Undo to restore it first." });
        }
      }}>Undo</button> : null}
      <button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}>Close</button>
    </div> : null}
  </>;
}
