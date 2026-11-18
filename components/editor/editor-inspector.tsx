"use client";

import { useEffect, type ReactNode } from "react";
import { createUsePuck, useGetPuck } from "@puckeditor/core";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import type { BlockDesign, DesignLevel } from "@/lib/sections/design";
import { ELEMENT_TYPES } from "@/lib/layout/structure";
import { hasPlaceholder } from "@/lib/sections/placeholders";
import { DesignField } from "./design-field";
import { useInteractions } from "./interaction-context";
import { cleanPhotoCredits } from "@/lib/editor/media";

const usePuck = createUsePuck();
export function EditorInspector({ fields, isLoading }: { fields: Partial<Record<string, ReactNode>>; isLoading: boolean }) {
  const ui = useInteractions();
  const selected = usePuck((state) => state.selectedItem);
  const rootProps = usePuck((state) => state.appState.data.root.props);
  const getPuck = useGetPuck();
  const width = usePuck((state) => state.appState.ui.viewports.current.width);
  const device = width === "100%" || width >= 1024 ? "desktop" : width >= 768 ? "tablet" : "mobile";
  const { setDevice } = ui;
  useEffect(() => { setDevice(device); }, [device, setDevice]);
  const design = (selected?.props.design ?? {}) as BlockDesign;
  const locked = usePuck((state) => state.getPermissions({ item: state.selectedItem }).edit === false);
  const level: DesignLevel = selected?.type === "Row" ? "row" : selected?.type === "Column" ? "column" :
    selected?.type === "Section" || !(ELEMENT_TYPES as readonly string[]).includes(selected?.type ?? "") ? "section" : "element";
  const change = (next: BlockDesign) => {
    const { selectedItem, appState, dispatch } = getPuck();
    if (!selectedItem || !appState.ui.itemSelector || locked) return;
    dispatch({ type: "replace", destinationIndex: appState.ui.itemSelector.index,
      destinationZone: appState.ui.itemSelector.zone ?? "root:default-zone",
      data: { ...selectedItem, props: cleanPhotoCredits({ ...selectedItem.props, design: next }) }, recordHistory: true });
  };
  const appearance = design.appearance?.[device] ?? {};
  const base = design.appearance?.desktop ?? {};
  const mobileIndicator = (key: keyof typeof appearance) =>
    design.appearance?.mobile?.[key] !== undefined && design.appearance.mobile[key] !== base[key]
      ? <Smartphone className="inline" size={12} aria-label="Mobile override" /> : null;
  const patchAppearance = (patch: typeof appearance) => change({
    ...design, appearance: { ...design.appearance, [device]: { ...appearance, ...patch } },
  });
  return <section aria-label="Inspector" className="editor-panel flex flex-col gap-4">
    <header className="editor-panel-header"><p className="platform-eyebrow mb-1">Inspector</p><h2 className="font-semibold">{selected ? selected.type.replace(/([a-z])([A-Z])/g, "$1 $2") : "Page settings"}</h2><p className="mt-1 text-[11px] text-[#6B6A66]">{selected ? "Refine the details of your selection." : "Page content and search appearance."}</p></header>
    <div className="editor-device-picker flex items-center justify-between gap-1" role="group" aria-label="Editing device">
      {([{ id: "desktop", width: 1280, Icon: Monitor }, { id: "tablet", width: 768, Icon: Tablet }, { id: "mobile", width: 390, Icon: Smartphone }] as const).map(({ id, width: target, Icon }) =>
        <button key={id} type="button" aria-label={`Edit ${id}`} aria-pressed={device === id}
          className={`flex items-center gap-1 rounded px-2 py-2 text-xs ${device === id ? "bg-zinc-900 text-white" : "bg-zinc-100"}`}
          onClick={() => {
            ui.setDevice(id);
            const { appState, dispatch } = getPuck();
            dispatch({ type: "setUi", ui: { viewports: { ...appState.ui.viewports, current: { width: target, height: "auto" } } } });
          }}><Icon size={13} />{id}</button>)}
    </div>
    <div role="tablist" aria-label="Inspector tabs" className="grid grid-cols-3 border-b border-[#E8E7E3]">
      {([
        { id: "content", label: "Content" },
        { id: "style", label: "Design" },
        { id: "animation", label: "Motion" },
      ] as const).map(({ id, label }) =>
        <button key={id} type="button" role="tab" aria-selected={ui.tab === id || (id === "style" && ui.tab === "spacing")}
          onClick={() => ui.setTab(id)} className={`border-b-2 py-2 text-xs font-medium ${ui.tab === id || (id === "style" && ui.tab === "spacing") ? "border-[#4B3FE0] text-[#4B3FE0]" : "border-transparent text-zinc-500"}`}>{label}</button>)}
    </div>
    {isLoading ? <p role="status" className="text-xs">Loading controls...</p> : null}
    {ui.tab === "content" || !selected ? <>
      {Object.entries(fields).filter(([key]) => key !== "design").map(([key, field]) => {
        const value = (selected?.props ?? rootProps)?.[key];
        const placeholder = hasPlaceholder(value);
        return <div key={key} className={placeholder ? "editor-placeholder-field" : undefined}>
          {field}
          {placeholder ? <p className="px-1 text-[11px] text-amber-700">Replace placeholder text before publishing.</p> : null}
        </div>;
      })}
      {selected && !locked ? <DesignField value={design} onChange={change} level={level} panelTab="settings" /> : null}
    </> : locked ? <p className="text-xs text-zinc-500">Only the agency can edit this block.</p> : <>
      {ui.tab === "style" || ui.tab === "spacing" ? <div role="group" aria-label="Design controls" className="flex gap-1 rounded-lg bg-[#F7F7F5] p-1">
        {(["style", "spacing"] as const).map((tab) => <button key={tab} type="button" aria-pressed={ui.tab === tab}
          onClick={() => ui.setTab(tab)} className={`flex-1 rounded-md px-2 py-1.5 text-xs capitalize ${ui.tab === tab ? "bg-white font-medium shadow-sm" : "text-zinc-500"}`}>{tab}</button>)}
      </div> : null}
      {ui.tab === "style" ? <fieldset className="flex flex-col gap-3 rounded-lg border p-3 text-xs">
        <legend className="px-1 capitalize">{device} appearance</legend>
        {(["backgroundColor", "textColor"] as const).map((key) => <label key={key} className="flex items-center justify-between gap-2">
          {key === "backgroundColor" ? "Background" : "Text color"}
          {mobileIndicator(key)}
          <input type="color" aria-label={`${device} ${key}`} value={appearance[key] ?? base[key] ?? (key === "backgroundColor" ? "#ffffff" : "#1c2b3a")}
            onChange={(event) => patchAppearance({ [key]: event.target.value })} />
        </label>)}
        <label>Corner radius {mobileIndicator("borderRadius")} <input aria-label="Corner radius" type="range" min={0} max={48} value={appearance.borderRadius ?? base.borderRadius ?? 0}
          onChange={(event) => patchAppearance({ borderRadius: Number(event.target.value) })} /></label>
        <label>Alignment {mobileIndicator("align")} <select aria-label="Block alignment" value={appearance.align ?? base.align ?? "left"}
          onChange={(event) => patchAppearance({ align: event.target.value as "left" | "center" | "right" })}>
          <option>left</option><option>center</option><option>right</option>
        </select></label>
        <button type="button" className="text-left underline" onClick={() => {
          const next = { ...design.appearance }; delete next[device]; change({ ...design, appearance: next });
        }}>Reset {device} appearance</button>
      </fieldset> : null}
      {ui.tab !== "style" || device === "desktop" ? <DesignField value={design} onChange={change} level={level} panelTab={ui.tab} /> :
        <p className="text-xs text-zinc-500">Other style controls use the desktop design.</p>}
    </>}
  </section>;
}
