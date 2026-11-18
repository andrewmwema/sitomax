"use client";

import { createContext, useContext } from "react";
import type { DeviceId } from "@/lib/sections/design";

export type InspectorTab = "content" | "style" | "animation" | "spacing";
export type EditorPageLink = { id: string; slug: string; title: string | null; nav_label?: string | null };
export type InteractionUi = {
  pageId: string;
  accountId: string;
  userId: string;
  pages: EditorPageLink[];
  tab: InspectorTab;
  setTab: (tab: InspectorTab) => void;
  device: DeviceId;
  setDevice: (device: DeviceId) => void;
  menu: { id: string; x: number; y: number } | null;
  setMenu: (menu: InteractionUi["menu"]) => void;
};
export const InteractionContext = createContext<InteractionUi | null>(null);
export function useInteractions() {
  const context = useContext(InteractionContext);
  if (!context) throw new Error("Editor interaction context missing");
  return context;
}

/** Project coordinates from a scaled editor iframe into the app viewport. */
export function appPoint(doc: Document, x: number, y: number) {
  const frame = doc.defaultView?.frameElement;
  if (!(frame instanceof HTMLIFrameElement)) return { x, y };
  const rect = frame.getBoundingClientRect();
  return {
    x: rect.left + x * rect.width / (frame.offsetWidth || rect.width),
    y: rect.top + y * rect.height / (frame.offsetHeight || rect.height),
  };
}
