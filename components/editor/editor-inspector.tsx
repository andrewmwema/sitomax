"use client";

import { useEffect, type ReactNode } from "react";
import { createUsePuck, useGetPuck } from "@puckeditor/core";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import type { BlockDesign, DesignLevel } from "@/lib/sections/design";
import { ELEMENT_TYPES } from "@/lib/layout/structure";
import { DesignField } from "./design-field";
import { useInteractions } from "./interaction-context";

const usePuck = createUsePuck();
export function EditorInspector({ fields, isLoading }: { fields: Partial<Record<string, ReactNode>>; isLoading: boolean }) {
  const ui = useInteractions();
  const selected = usePuck((state) => state.selectedItem);
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
      data: { ...selectedItem, props: { ...selectedItem.props, design: next } }, recordHistory: true });
  };
  const appearance = design.appearance?.[device] ?? {};
  const base = design.appearance?.desktop ?? {};
  const mobileIndicator = (key: keyof typeof appearance) =>
    design.appearance?.mobile?.[key] !== undefined && design.appearance.mobile[key] !== base[key]
      ? <Smartphone className="inline" size={12} aria-label="Mobile override" /> : null;
  const patchAppearance = (patch: typeof appearance) => change({
    ...design, appearance: { ...design.appearance, [device]: { ...appearance, ...patch } },
  });
  return <section aria-label="Inspector" className="flex flex-col gap-3 p-3">
    <div className="flex items-center justify-between gap-1" role="group" aria-label="Editing device">
      {([{ id: "desktop", width: 1280, Icon: Monitor }, { id: "tablet", width: 768, Icon: Tablet }, { id: "mobile", width: 390, Icon: Smartphone }] as const).map(({ id, width: target, Icon }) =>
        <button key={id} type="button" aria-label={`Edit ${id}`} aria-pressed={device === id}
          className={`flex items-center gap-1 rounded px-2 py-2 text-xs ${device === id ? "bg-zinc-900 text-white" : "bg-zinc-100"}`}
          onClick={() => {
            ui.setDevice(id);
            const { appState, dispatch } = getPuck();
            dispatch({ type: "setUi", ui: { viewports: { ...appState.ui.viewports, current: { width: target, height: "auto" } } } });
          }}><Icon size={13} />{id}</button>)}
    </div>
    <div role="tablist" aria-label="Inspector tabs" className="grid grid-cols-4 border-b border-zinc-200">
      {(["content", "style", "animation", "spacing"] as const).map((tab) =>
        <button key={tab} type="button" role="tab" aria-selected={ui.tab === tab}
          onClick={() => ui.setTab(tab)} className={`border-b-2 py-2 text-[11px] capitalize ${ui.tab === tab ? "border-zinc-900" : "border-transparent text-zinc-500"}`}>{tab}</button>)}
    </div>
    {isLoading ? <p role="status" className="text-xs">Loading controls...</p> : null}
    {ui.tab === "content" || !selected ? <>
      {Object.entries(fields).filter(([key]) => key !== "design").map(([key, field]) => <div key={key}>{field}</div>)}
      {selected && !locked ? <DesignField value={design} onChange={change} level={level} panelTab="settings" /> : null}
    </> : locked ? <p className="text-xs text-zinc-500">Only the agency can edit this block.</p> : <>
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
