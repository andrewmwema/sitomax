"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createUsePuck, useGetPuck } from "@puckeditor/core";
import { HEADER_LAYOUTS, COMPACT_LAYOUTS, headerSchema, headerDesign, headerColors, editHeader, type SiteHeaderData, type HeaderRoot } from "@/lib/header";
import { CURATED_FONT_NAMES } from "@/lib/theme/fonts";
import { ImageUploadField } from "./image-upload-field";
import { LinkFieldControl } from "./link-picker";
import { useAskAi } from "./ask-ai";
import { useInteractions } from "./interaction-context";
import { HexColorInput } from "./hex-color-input";

const usePuck = createUsePuck();
const control = "mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm";
type Tab = "content" | "design" | "layout";

function HeaderSettings({ tab, onTab, close }: { tab: Tab; onTab: (tab: Tab) => void; close: () => void }) {
  const getPuck = useGetPuck();
  const { pages } = useInteractions();
  const props = usePuck(state => state.appState.data.root.props);
  const width = usePuck(state => state.appState.ui.viewports.current.width);
  const device = width === "100%" || width >= 1024 ? "desktop" : width >= 768 ? "tablet" : "mobile";
  const header = headerSchema.parse(props?.__editorHeader);
  const design = headerDesign(header, device);
  const colors = headerColors(design);
  const [error, setError] = useState("");
  function change(next: SiteHeaderData) {
    const parsed = headerSchema.safeParse(next);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your header settings."); return; }
    setError("");
    const { appState, dispatch } = getPuck();
    const rootProps: HeaderRoot = { ...appState.data.root.props, __editorHeader: parsed.data };
    dispatch({ type: "setData", data: { ...appState.data, root: {
      ...appState.data.root, props: rootProps,
    } }, recordHistory: true });
  }
  function style(settings: Record<string, unknown>) {
    const next = { ...header, [device]: { ...header[device], ...settings } };
    change(next);
  }
  const choices = device === "desktop" || (device === "tablet" && header.tablet.follow === "desktop") ? HEADER_LAYOUTS : COMPACT_LAYOUTS;
  return <section className="platform-ui flex h-full flex-col bg-white text-zinc-900">
    <header className="border-b p-5">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Site header</h2><button type="button" className="platform-button" onClick={close}>Close</button></div>
      <span className="mt-2 inline-flex rounded-full bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">{device[0].toUpperCase() + device.slice(1)} settings</span>
      <p className="mt-2 text-xs text-zinc-500">Shared across every page. Save as a draft; select Header in the Publish panel to make it live site-wide.</p>
    </header>
    <div className="flex border-b" role="group" aria-label="Header settings">
      {(["content", "design", "layout"] as const).map(item => <button key={item} type="button"
        aria-pressed={tab === item} onClick={() => onTab(item)} className={`flex-1 px-3 py-3 text-xs font-medium capitalize ${tab === item ? "border-b-2 border-indigo-600 text-indigo-700" : ""}`}>{item}</button>)}
    </div>
    <div className="space-y-5 overflow-y-auto p-5">
      {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
      {device === "tablet" ? <label className="block text-xs font-medium">Tablet layout follows
        <select className={control} value={header.tablet.follow} onChange={event => {
          const follow = event.target.value as "desktop" | "mobile";
          const { layout: _layout, ...settings } = header.tablet;
          void _layout;
          change({ ...header, tablet: { ...settings, follow } });
        }}><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select>
      </label> : null}
      {tab === "layout" ? <div className="grid grid-cols-2 gap-3">
        {choices.map(layout => <button type="button" key={layout.id} aria-pressed={design.layout === layout.id}
          disabled={device === "tablet" && header.tablet.follow === "desktop"}
          className={`rounded-xl border p-3 text-left text-xs ${design.layout === layout.id ? "border-indigo-500 ring-1 ring-indigo-500" : "border-zinc-200 hover:border-zinc-400"}`}
          onClick={() => {
            style({ layout: layout.id });
          }}>
          <LayoutThumbnail layout={layout.id} /><span className="mt-2 block">{layout.label}</span>
        </button>)}
        <p className="col-span-2 text-xs text-zinc-500">Switching layouts keeps your logo, links, colors and content.</p>
        {device === "tablet" && header.tablet.follow === "desktop" ? <p className="col-span-2 text-xs text-zinc-500">This layout follows desktop. Change it on the desktop canvas, or follow mobile for a compact layout.</p> : null}
      </div> : null}
      {tab === "content" ? <>
        <label className="block text-xs font-medium">Logo type<select className={control} value={header.logo.mode}
          onChange={event => change({ ...header, logo: { ...header.logo, mode: event.target.value as "text" | "image" } })}>
          <option value="text">Text</option><option value="image">Image</option>
        </select></label>
        <label className="block text-xs font-medium">Business / logo text<input className={control} maxLength={100} value={header.logo.text}
          onChange={event => change({ ...header, logo: { ...header.logo, text: event.target.value } })} /></label>
        {header.logo.mode === "image" ? <ImageUploadField value={header.logo.image}
          onChange={image => change({ ...header, logo: { ...header.logo, image } })} /> : null}
        <div className="space-y-2"><p className="text-xs font-medium">Logo link</p><LinkFieldControl value={header.logo.href}
          onChange={href => change({ ...header, logo: { ...header.logo, href } })} /></div>
        <label className="block text-xs font-medium">Menu links<select className={control} value={header.menu.source}
          onChange={event => change({ ...header, menu: { ...header.menu, source: event.target.value as "pages" | "custom" } })}>
          <option value="pages">Automatic from Pages</option><option value="custom">Custom links & dropdowns</option>
        </select></label>
        {header.menu.source === "pages" ? <>
          <p className="text-xs text-zinc-500">Use Pages to change menu labels, order and hidden pages.</p>
          {pages.some((page) => page.published === false && !page.hide_from_menu && !page.ai_pending_build) ? <p role="status" className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
            Not published yet — hidden on your live site: {pages.filter((page) => page.published === false && !page.hide_from_menu && !page.ai_pending_build)
              .map((page) => page.title?.trim() || page.nav_label || page.slug || "Home").join(", ")}.
          </p> : null}
        </> :
          <div className="space-y-3">
            {header.menu.items.map((item, index) => <fieldset key={index} className="space-y-2 rounded-lg border p-3">
              <legend className="px-1 text-xs font-medium">Menu item {index + 1}</legend>
              <input aria-label={`Menu label ${index + 1}`} className={control} maxLength={80} value={item.label}
                onChange={event => change({ ...header, menu: { ...header.menu, items: header.menu.items.map((entry, i) => i === index ? { ...entry, label: event.target.value } : entry) } })} />
              <LinkFieldControl value={item.href} onChange={href => change({ ...header, menu: { ...header.menu,
                items: header.menu.items.map((entry, i) => i === index ? { ...entry, href } : entry) } })} />
              {item.children.map((child, childIndex) => <div key={childIndex} className="space-y-2 border-l-2 pl-3">
                <input aria-label={`Submenu label ${index + 1}.${childIndex + 1}`} className={control} value={child.label} maxLength={80}
                  onChange={event => change({ ...header, menu: { ...header.menu, items: header.menu.items.map((entry, i) => i === index
                    ? { ...entry, children: entry.children.map((value, j) => j === childIndex ? { ...value, label: event.target.value } : value) } : entry) } })} />
                <LinkFieldControl value={child.href} onChange={href => change({ ...header, menu: { ...header.menu,
                  items: header.menu.items.map((entry, i) => i === index ? { ...entry,
                    children: entry.children.map((value, j) => j === childIndex ? { ...value, href } : value) } : entry) } })} />
                <button type="button" className="text-xs text-red-700" onClick={() => change({ ...header, menu: { ...header.menu,
                  items: header.menu.items.map((entry, i) => i === index ? { ...entry, children: entry.children.filter((_, j) => j !== childIndex) } : entry) } })}>Remove sub-item</button>
              </div>)}
              <div className="flex flex-wrap gap-3 text-xs">
                <button type="button" disabled={item.children.length >= 12} onClick={() => change({ ...header, menu: { ...header.menu,
                  items: header.menu.items.map((entry, i) => i === index ? { ...entry, children: [...entry.children, { label: "New link", href: "" }] } : entry) } })}>Add sub-item</button>
                <button type="button" disabled={index === 0} onClick={() => {
                  const items = [...header.menu.items]; [items[index - 1], items[index]] = [items[index], items[index - 1]];
                  change({ ...header, menu: { ...header.menu, items } });
                }}>Move up</button>
                <button type="button" className="text-red-700" onClick={() => change({ ...header, menu: { ...header.menu,
                  items: header.menu.items.filter((_, i) => i !== index) } })}>Remove</button>
              </div>
            </fieldset>)}
            <button type="button" className="platform-button" disabled={header.menu.items.length >= 24}
              onClick={() => change({ ...header, menu: { ...header.menu, items: [...header.menu.items, { label: "New link", href: "", children: [] }] } })}>Add menu item</button>
          </div>}
        <label className="block text-xs font-medium">Button text (empty to hide)<input className={control} value={header.cta.text} maxLength={80}
          onChange={event => change({ ...header, cta: { ...header.cta, text: event.target.value } })} /></label>
        <LinkFieldControl value={header.cta.href} onChange={href => change({ ...header, cta: { ...header.cta, href } })} />
        <label className="block text-xs font-medium">Theme button style<select className={control} value={header.cta.style}
          onChange={event => change({ ...header, cta: { ...header.cta, style: event.target.value as SiteHeaderData["cta"]["style"] } })}>
          {["primary", "secondary", "outline"].map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={header.contactsInMenu}
          onChange={event => change({ ...header, contactsInMenu: event.target.checked })} />Contact details in menu</label>
        <p className="text-xs text-zinc-500">Contact details and social links come from Business info.</p>
      </> : null}
      {tab === "design" ? <>
        {([
          ["background", "Background", ["color", "gradient", "image", "transparent"]],
          ["container", "Container", ["boxed", "full"]],
          ["font", "Menu font", CURATED_FONT_NAMES],
          ["weight", "Menu weight", ["400", "500", "600", "700"]],
          ["indicator", "Active link indicator", ["underline", "pill", "dot", "none"]],
          ["iconPosition", "Menu icon position", ["left", "right"]],
          ["iconStyle", "Menu icon style", ["lines", "dots", "text"]],
          ["panel", "Menu panel", ["drawer-left", "drawer-right", "fullscreen", "dropdown"]],
          ["action", "Compact action", ["none", "phone", "cta"]],
        ] as const).map(([key, label, options]) => <label key={key} className="block text-xs font-medium">{label}
          <select className={control} value={String(design[key])} onChange={event => style({ [key]: event.target.value })}>
            {options.map(value => <option key={value} value={value}>{value}</option>)}
          </select></label>)}
        {design.background === "image" ? <ImageUploadField value={design.image} onChange={image => style({ image })} /> : null}
        <div className="grid grid-cols-2 gap-3">
          {([["color", "Background"], ["gradientTo", "Gradient end"], ["textColor", "Menu text"], ["hoverColor", "Hover"],
            ["scrollColor", "After scroll"], ["panelColor", "Panel background"], ["panelTextColor", "Panel text"], ["borderColor", "Border"]] as const)
            .map(([key, label]) => <div className="min-w-0 text-xs font-medium" key={key}><span>{label}</span>
              <div className="mt-1 flex flex-wrap items-start gap-1">
                <input aria-label={`${label} color`} type="color" className="h-9 w-10" value={design[key]} onChange={event => style({ [key]: event.target.value })} />
                <HexColorInput label={`${label} color`} value={design[key]} onChange={value => style({ [key]: value })} />
              </div></div>)}
        </div>
        {colors.foreground.toLowerCase() !== design.textColor.toLowerCase() || colors.panel.toLowerCase() !== design.panelTextColor.toLowerCase() ||
          colors.hover.toLowerCase() !== design.hoverColor.toLowerCase() || colors.scrolled.toLowerCase() !== design.textColor.toLowerCase() ||
          colors.scrollHover.toLowerCase() !== design.hoverColor.toLowerCase() ?
          <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Text colors are automatically adjusted for WCAG AA readability. Transparent, gradient and image headers use a text backing for predictable contrast.</p> : null}
        <div className="grid grid-cols-2 gap-3">
          {([["height", "Minimum height", 48, 200], ["padding", "Side padding", 0, 80], ["paddingY", "Vertical padding", 0, 40], ["logoHeight", "Logo height", 16, 120],
            ["fontSize", "Font size", 12, 24], ["letterSpacing", "Letter spacing", 0, 6]] as const).map(([key, label, min, max]) =>
            <label key={key} className="text-xs font-medium">{label}<input className={control} type="number" min={min} max={max}
              value={design[key]} onChange={event => style({ [key]: event.target.valueAsNumber })} /></label>)}
        </div>
        {([["sticky", "Sticky header"], ["shrink", "Shrink on scroll"], ["blur", "Glass blur"], ["shadow", "Shadow"],
          ["border", "Bottom border"], ["uppercase", "Uppercase links"]] as const).map(([key, label]) =>
          <label key={key} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={design[key]} onChange={event => style({ [key]: event.target.checked })} />{label}</label>)}
      </> : null}
    </div>
  </section>;
}
function LayoutThumbnail({ layout }: { layout: string }) {
  const centered = ["stacked", "split", "center-logo", "left-toggle"].includes(layout);
  return <div aria-hidden="true" className="flex h-16 flex-col justify-center gap-2 rounded-md border bg-zinc-50 p-2">
    {layout === "topbar" ? <div className="h-1 w-full rounded bg-zinc-200" /> : null}
    <div className={`flex items-center gap-2 ${centered ? "justify-center" : "justify-between"}`}>
      {layout === "split" || layout === "left-toggle" ? <div className="h-1 w-6 rounded bg-zinc-300" /> : null}
      <div className="h-3 w-7 rounded-sm bg-indigo-300" />
      {layout !== "stacked" ? <div className={`h-1 rounded bg-zinc-300 ${["minimal", "right-toggle", "center-logo"].includes(layout) ? "w-3" : "w-10"}`} /> : null}
      {["balanced", "right", "overlay"].includes(layout) ? <div className="h-3 w-4 rounded-sm bg-indigo-200" /> : null}
    </div>
    {["stacked", "contact"].includes(layout) ? <div className="mx-auto h-1 w-16 rounded bg-zinc-300" /> : null}
  </div>;
}

export function HeaderCanvas({ children }: { children: ReactNode }) {
  const getPuck = useGetPuck();
  const askAi = useAskAi();
  const [selected, setSelected] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null);
  const [canvas, setCanvas] = useState<HTMLElement | null>(null);
  const attach = useCallback((node: HTMLDivElement | null) => {
    setCanvas(node?.querySelector<HTMLElement>("[data-site-header]") ?? null);
  }, []);
  const dialog = useRef<HTMLDialogElement>(null);
  const selection = usePuck(state => state.appState.ui.itemSelector);
  const legacy = usePuck(state => state.appState.data.root.props?.__legacyNavigation === true);
  const hidden = usePuck(state => state.appState.data.root.props?.hideHeader === true || state.appState.data.root.props?.__legacyNavigation === true);
  const width = usePuck(state => state.appState.ui.viewports.current.width);
  const device = width === "100%" || width >= 1024 ? "desktop" : width >= 768 ? "tablet" : "mobile";
  useEffect(() => {
    if (tab && !dialog.current?.open) dialog.current?.showModal();
  }, [tab]);
  function hide() {
    const { appState, dispatch } = getPuck();
    const props: HeaderRoot = { ...appState.data.root.props, hideHeader: !hidden, ...(legacy ? { __legacyNavigation: false } : {}) };
    dispatch({ type: "setData", data: { ...appState.data,
      content: legacy ? appState.data.content.filter(item => item.type !== "Navigation") : appState.data.content, root: {
      ...appState.data.root, props,
    } }, recordHistory: true });
  }
  return <div key={hidden ? "hidden" : "visible"} ref={attach} className="contents" data-header-editor="" onContextMenu={event => {
    event.preventDefault(); event.stopPropagation(); setSelected(true);
    getPuck().dispatch({ type: "setUi", ui: { itemSelector: null } });
  }}>
    {children}
    {hidden ? <button type="button" className="m-2 rounded border bg-white px-3 py-2 text-xs text-zinc-700" onClick={hide}>{legacy ? "Use site-wide header again" : "Show site header on this page"}</button> : null}
    {canvas && !hidden ? createPortal(<>
    <button type="button" aria-label="Edit site-wide header" className="absolute inset-0 z-10 cursor-pointer bg-transparent focus-visible:outline-2 focus-visible:outline-indigo-500"
      onClick={event => { event.stopPropagation(); setSelected(true); getPuck().dispatch({ type: "setUi", ui: { itemSelector: null } }); }} />
    {selected && !selection ? <div role="toolbar" aria-label="Header actions" className="platform-ui absolute right-2 top-2 z-20 flex flex-wrap gap-1 rounded-lg border bg-white p-1 text-xs text-zinc-800 shadow-lg">
      <button type="button" className="rounded px-2 py-2 hover:bg-zinc-100" onClick={() => askAi?.open(undefined, "header")}>Ask AI</button>
      {(["content", "design", "layout"] as const).map(value => <button key={value} type="button" className="rounded px-2 py-2 hover:bg-zinc-100"
        onClick={() => setTab(value)}>{value === "layout" ? "Change layout" : `Edit ${value}`}</button>)}
      <button type="button" className="rounded px-2 py-2 hover:bg-zinc-100" onClick={hide}>Hide on this page</button>
      <button type="button" className="rounded px-2 py-2 hover:bg-zinc-100" onClick={() => {
        const { appState, dispatch } = getPuck();
        const header = headerSchema.parse(appState.data.root.props?.__editorHeader);
        const props: HeaderRoot = { ...appState.data.root.props, __editorHeader: editHeader(header, { device, settings: { padding: 0, paddingY: 0 } }) };
        dispatch({ type: "setData", data: { ...appState.data, root: { ...appState.data.root,
          props,
        } }, recordHistory: true });
      }}>Clear padding</button>
      <button type="button" aria-label="Close header actions" className="px-2" onClick={() => setSelected(false)}>Close</button>
    </div> : null}
    </>, canvas) : null}
    {tab && typeof document !== "undefined" ? createPortal(<dialog ref={dialog} aria-label="Site header settings"
      onClose={() => setTab(null)} className="editor-modal fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-[min(420px,96vw)] max-w-none border-0 p-0 shadow-2xl backdrop:bg-zinc-950/25">
      <HeaderSettings tab={tab} onTab={setTab} close={() => dialog.current?.close()} />
    </dialog>, document.body) : null}
  </div>;
}
export function renderHeaderEditor(children: ReactNode) { return <HeaderCanvas>{children}</HeaderCanvas>; }
