"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode,
} from "react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { fetchLeadInbox } from "@/app/(dashboard)/dashboard/leads/actions";
import type { LeadInboxCounts, LeadInboxView } from "@/lib/forms/inbox";
import type { Lead, SubmissionSite } from "@/lib/forms/submissions";
import { LeadInboxShortcuts } from "@/components/dashboard/lead-inbox-shortcuts";
import { LeadList } from "./lead-list";
import { LeadToaster, leadToast, useStored, writeStored } from "./ui";
import { leadQueryString, parseLeadView } from "./views";

const PAGE_SIZE = 50;
const LIST_MIN = 320;
const LIST_MAX = 440;
const LIST_DEFAULT = 360;
const clampWidth = (value: number) => Math.min(LIST_MAX, Math.max(LIST_MIN, Math.round(value)));

export type LeadQuery = { view: LeadInboxView; q: string; site: string };
type InboxState = { key: string; rows: Lead[]; hasMore: boolean; counts: LeadInboxCounts | null; error: string | null };
export type LeadInbox = {
  userId: string; showSites: boolean; sites: SubmissionSite[];
  query: LeadQuery; queryString: string; setQuery: (patch: Partial<LeadQuery>) => void;
  /** Null while the first page of a view is loading. */
  rows: Lead[] | null;
  error: string | null; hasMore: boolean; loadingMore: boolean; counts: LeadInboxCounts | null;
  selectedLeadId: string | null;
  loadMore: () => void; reload: () => void;
  /** Applies a change locally right away; the next refresh confirms or reverts it. */
  patch: (ids: string[], changes: Partial<Lead>) => void;
};

const InboxContext = createContext<LeadInbox | null>(null);

export const LeadInboxProvider = InboxContext.Provider;

/** The inbox around a conversation, or null when a lead is shown elsewhere. */
export function useLeadInbox() {
  return useContext(InboxContext);
}

export function LeadsInbox({ userId, sites, agency, refreshKey, children }: {
  userId: string; sites: SubmissionSite[]; agency: boolean;
  /** Changes whenever the server re-renders after a lead action, which reloads the list. */
  refreshKey: string;
  children: ReactNode;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const { leadId } = useParams<{ leadId?: string }>();
  const view = parseLeadView(params.get("view"));
  const q = (params.get("q") ?? "").trim().slice(0, 200);
  const site = sites.some((item) => item.id === params.get("site")) ? params.get("site")! : "";
  const key = `${view}|${site}|${q}`;

  const [state, setState] = useState<InboxState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nonce, setNonce] = useState(0);
  const loaded = useRef({ key: "", count: 0 });
  const generation = useRef(0);

  useEffect(() => {
    let active = true;
    const run = ++generation.current;
    // A refresh keeps as many rows as were already loaded, so the list never jumps while scrolled.
    const target = loaded.current.key === key ? Math.max(PAGE_SIZE, loaded.current.count) : PAGE_SIZE;
    (async () => {
      let rows: Lead[] = [];
      let hasMore = true;
      let counts: LeadInboxCounts | null = null;
      let error: string | null = null;
      for (let page = 0; page < 4 && hasMore && rows.length < target; page++) {
        const last = rows.at(-1);
        const result = await fetchLeadInbox({
          view, q, site, counts: page === 0, limit: Math.min(100, Math.max(PAGE_SIZE, target - rows.length)),
          cursor: last ? { at: last.last_activity_at, id: last.id } : null,
        }).catch(() => ({ error: "Could not load leads. Check your connection and try again." }));
        if (!active || run !== generation.current) return;
        if (result.error !== undefined) { error = result.error; break; }
        if (page === 0) counts = result.counts;
        rows = [...rows, ...result.rows];
        hasMore = result.hasMore;
      }
      if (error && loaded.current.key === key && loaded.current.count) {
        leadToast(error, "error");
        return;
      }
      setState({ key, rows, hasMore: error ? false : hasMore, counts, error });
    })();
    return () => { active = false; };
  }, [key, view, q, site, refreshKey, nonce]);

  const current = state?.key === key ? state : null;
  useEffect(() => {
    if (current) loaded.current = { key: current.key, count: current.rows.length };
  }, [current]);
  const loadMore = useCallback(() => {
    const last = current?.rows.at(-1);
    if (!current?.hasMore || !last || loadingMore) return;
    const run = generation.current;
    setLoadingMore(true);
    fetchLeadInbox({ view, q, site, limit: PAGE_SIZE, cursor: { at: last.last_activity_at, id: last.id } })
      .catch(() => ({ error: "Could not load more leads. Check your connection and try again." }))
      .then((result) => {
        if (run !== generation.current) return;
        if (result.error !== undefined) { leadToast(result.error, "error"); return; }
        setState((previous) => {
          if (!previous || previous.key !== key) return previous;
          const known = new Set(previous.rows.map((row) => row.id));
          return { ...previous, rows: [...previous.rows, ...result.rows.filter((row) => !known.has(row.id))], hasMore: result.hasMore };
        });
      })
      .finally(() => setLoadingMore(false));
  }, [current, key, loadingMore, q, site, view]);

  const setQuery = useCallback((patch: Partial<LeadQuery>) => {
    // The list is loaded in the browser, so a new view or search only needs the address updated.
    window.history.replaceState(null, "", `${pathname}${leadQueryString({ view, q, site, ...patch })}`);
  }, [pathname, q, site, view]);
  const patch = useCallback((ids: string[], changes: Partial<Lead>) => {
    setState((previous) => previous && {
      ...previous, rows: previous.rows.map((row) => ids.includes(row.id) ? { ...row, ...changes } : row),
    });
  }, []);
  const reload = useCallback(() => setNonce((value) => value + 1), []);

  const inbox = useMemo<LeadInbox>(() => ({
    userId, sites, showSites: agency || sites.length > 1,
    query: { view, q, site }, queryString: leadQueryString({ view, q, site }), setQuery,
    rows: current?.rows ?? null, error: current?.error ?? null, hasMore: current?.hasMore ?? false, loadingMore,
    // Counts describe the whole inbox, so they stay visible while another view loads.
    counts: current?.counts ?? state?.counts ?? null,
    selectedLeadId: leadId ?? null, loadMore, reload, patch,
  }), [agency, current, leadId, loadMore, loadingMore, patch, q, reload, setQuery, site, sites, state?.counts, userId, view]);

  const widthKey = `sitomax:leads:list-width:${userId}`;
  const storedWidth = Number(useStored(widthKey));
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = dragWidth ?? (storedWidth ? clampWidth(storedWidth) : LIST_DEFAULT);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width };
    setDragWidth(width);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current) setDragWidth(clampWidth(drag.current.width + event.clientX - drag.current.x));
  };
  const onPointerEnd = () => {
    if (!drag.current) return;
    drag.current = null;
    if (dragWidth !== null) writeStored(widthKey, String(dragWidth));
    setDragWidth(null);
  };
  const onResizeKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = event.key === "ArrowLeft" ? width - 16 : event.key === "ArrowRight" ? width + 16
      : event.key === "Home" ? LIST_MIN : event.key === "End" ? LIST_MAX : null;
    if (next === null) return;
    event.preventDefault();
    writeStored(widthKey, String(clampWidth(next)));
  };

  return <InboxContext.Provider value={inbox}>
    <div className="leads-ui leads-inbox" data-open={leadId ? "true" : "false"} style={{ "--leads-list-width": `${width}px` } as CSSProperties}>
      <LeadInboxShortcuts />
      <section className="leads-list-pane" aria-label="Leads"><LeadList /></section>
      <div role="separator" tabIndex={0} aria-orientation="vertical" aria-label="Resize the lead list"
        aria-valuemin={LIST_MIN} aria-valuemax={LIST_MAX} aria-valuenow={width} className="leads-resizer" data-dragging={dragWidth !== null}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onKeyDown={onResizeKey} />
      <section className="leads-conversation-pane" aria-label="Conversation">{children}</section>
      <LeadToaster />
    </div>
  </InboxContext.Provider>;
}

export function LeadsInboxSkeleton() {
  return <div className="leads-ui leads-inbox" role="status" aria-label="Loading leads">
    <div className="leads-list-pane gap-3 p-4">
      <div className="leads-skeleton h-5 w-24" /><div className="leads-skeleton h-9 w-full" />
      {Array.from({ length: 7 }, (_, index) => <div key={index} className="flex gap-3 py-2">
        <div className="leads-skeleton size-9 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2"><div className="leads-skeleton h-3.5 w-2/5" /><div className="leads-skeleton h-3 w-4/5" /></div>
      </div>)}
    </div>
    <div className="leads-conversation-pane" />
  </div>;
}
