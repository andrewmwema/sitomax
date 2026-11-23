"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type Ref } from "react";
import Link from "next/link";
import {
  Archive, ArchiveRestore, Bell, ChevronDown, Clock, Inbox, ListChecks, Mail, MailOpen, RefreshCw, RotateCcw, Search, SlidersHorizontal, Star, Tag, Trash2, X,
} from "lucide-react";
import type { LeadInboxView } from "@/lib/forms/inbox";
import { leadStatuses, leadStatusLabels, type Lead } from "@/lib/forms/submissions";
import { leadDisplayName, leadIsUnread, leadPreview, relativeLeadTime } from "./format";
import { useLeadInbox } from "./inbox";
import { leadActionPatch, runLeadAction, setLeadStatus, type LeadInboxActionName } from "./lead-actions";
import { Avatar, IconButton, MenuItem, Popover, StatusPill, leadToast, useLeadMedia, useNow } from "./ui";
import { emptyViewCopy, moreViews, primaryViews } from "./views";

const panelId = "leads-list-panel";

export function LeadList() {
  const inbox = useLeadInbox()!;
  const { query, rows, counts, setQuery, loadMore, patch, reload } = inbox;
  const now = useNow();
  const mobile = useLeadMedia("(max-width: 767px)");
  const [searchOpen, setSearchOpen] = useState(Boolean(query.q));
  const searchInput = useRef<HTMLInputElement>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [pull, setPull] = useState(0);
  const pullStart = useRef<{ x: number; y: number } | null>(null);
  const [searchReset, setSearchReset] = useState(0);
  const [picked, setPicked] = useState<{ key: string; ids: string[] }>({ key: "", ids: [] });
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const viewKey = `${query.view}|${query.site}|${query.q}`;
  const visible = new Set(rows?.map((row) => row.id));
  const selection = picked.key === viewKey ? picked.ids.filter((id) => visible.has(id)) : [];
  const select = (ids: string[]) => setPicked({ key: viewKey, ids });

  useEffect(() => {
    const target = sentinel.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) loadMore(); },
      { root: scroller.current, rootMargin: "400px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore]);

  const act = async (action: LeadInboxActionName, ids: string[], done?: string, bulk = true) => {
    if (busy || !ids.length) return false;
    if (action === "delete_forever" && !window.confirm(ids.length === 1
      ? "Delete this lead forever? This cannot be undone." : `Delete ${ids.length} leads forever? This cannot be undone.`)) return false;
    setBusy(true);
    patch(ids, leadActionPatch(action));
    const error = await runLeadAction(action, ids);
    setBusy(false);
    if (error) {
      leadToast(error, "error");
      reload();
      return false;
    }
    if (done) leadToast(done);
    if (bulk) select([]);
    return true;
  };
  const swipe = async (lead: Lead, action: "archive" | "unarchive" | "read" | "unread") => {
    const reverse = action === "archive" ? "unarchive" : action === "unarchive" ? "archive" : action === "read" ? "unread" : "read";
    if (await act(action, [lead.id], undefined, false)) {
      leadToast(action === "archive" ? "Lead archived." : action === "unarchive" ? "Lead unarchived." : action === "read" ? "Lead marked read." : "Lead marked unread.", "info", {
        label: "Undo", run: () => { void act(reverse, [lead.id], "Action undone.", false); },
      });
    }
  };
  const changeStatus = async (status: Lead["status"]) => {
    if (busy) return;
    setBusy(true);
    patch(selection, { status });
    const error = await setLeadStatus(selection, status);
    setBusy(false);
    if (error) { leadToast(error, "error"); reload(); return; }
    leadToast(`${selection.length === 1 ? "Lead" : `${selection.length} leads`} marked ${leadStatusLabels[status]}.`);
    select([]);
  };
  const count = (view: LeadInboxView) => counts ? <span className="leads-view-count ml-1 text-xs font-normal tabular-nums text-[var(--lead-muted)]">{counts[view]}</span> : null;
  const moreActive = moreViews.find((view) => view.value === query.view);
  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]?.focus();
  };
  const noun = selection.length === 1 ? "Lead" : `${selection.length} leads`;
  const trash = query.view === "trash";

  return <>
    <div className="leads-list-heading flex items-center justify-between gap-3 px-4 pt-4">
      <h1 className="text-base font-semibold tracking-tight">Leads</h1>
      <div className="ml-auto flex items-center gap-0.5">
      <IconButton label={selectMode ? "Exit select mode" : "Select leads"} className="leads-touch-only" aria-pressed={selectMode}
        onClick={() => { setSelectMode(!selectMode); select([]); }}><ListChecks size={18} /></IconButton>
      {mobile ? <>
        <IconButton label="Search leads" aria-expanded={searchOpen} aria-controls="leads-search" onClick={() => {
          setSearchOpen(!searchOpen);
          if (!searchOpen) requestAnimationFrame(() => searchInput.current?.focus());
        }}><Search size={18} /></IconButton>
        <IconButton label="Refresh leads" disabled={inbox.refreshing} onClick={reload}>
          <RefreshCw size={17} className={inbox.refreshing ? "animate-spin" : ""} /></IconButton>
        {inbox.showSites ? <Popover label="Filter leads" role="dialog" align="end" trigger={(props) =>
          <IconButton label="Filter leads" active={Boolean(query.site)} {...props}><SlidersHorizontal size={18} /></IconButton>}>
          {(close) => <label className="block p-2 text-xs text-[var(--lead-muted)]">Website
            <select value={query.site} className="leads-input mt-2" onChange={(event) => { setQuery({ site: event.target.value }); close(); }}>
              <option value="">All sites</option>{inbox.sites.map((site) => <option key={site.id} value={site.id}>{site.name || site.subdomain}</option>)}
            </select>
          </label>}
        </Popover> : null}
      </> : inbox.showSites && inbox.sites.length > 1 ? <label className="flex min-w-0 items-center">
        <span className="sr-only">Filter by website</span>
        <select value={query.site} onChange={(event) => setQuery({ site: event.target.value })}
          className="leads-bare max-w-[170px] cursor-pointer truncate rounded-md px-1 py-0.5 text-xs font-medium text-[var(--lead-muted)] hover:text-[var(--lead-navy)]">
          <option value="">All sites</option>
          {inbox.sites.map((site) => <option key={site.id} value={site.id}>{site.name || site.subdomain}</option>)}
        </select>
      </label> : null}
      </div>
    </div>
    <div id="leads-search" className="leads-search" data-expanded={searchOpen}>
      <SearchBox key={searchReset} inputRef={searchInput} initial={query.q} onSearch={(q) => setQuery({ q })} />
    </div>

    {selection.length ? <div role="toolbar" aria-label="Selected leads" className="leads-bulk-toolbar flex min-h-11 flex-wrap items-center gap-0.5 border-b border-[var(--lead-line)] bg-[var(--lead-blue-soft)] px-2">
      <IconButton label="Clear selection" tipAlign="start" onClick={() => { select([]); setSelectMode(false); }}><X size={16} /></IconButton>
      <span className="mr-auto px-1 text-xs font-semibold text-[var(--lead-navy)]" aria-live="polite">{selection.length} selected</span>
      {trash ? <>
        <IconButton label="Restore" disabled={busy} onClick={() => act("restore", selection, `${noun} restored.`)}><RotateCcw size={16} /></IconButton>
        <IconButton label="Delete forever" tipAlign="end" disabled={busy} onClick={() => act("delete_forever", selection, `${noun} deleted.`)}><Trash2 size={16} /></IconButton>
      </> : <>
        <IconButton label="Mark read" disabled={busy} onClick={() => act("read", selection)}><MailOpen size={16} /></IconButton>
        <IconButton label="Mark unread" disabled={busy} onClick={() => act("unread", selection)}><Mail size={16} /></IconButton>
        <Popover label="Change status" align="end" trigger={(props) => <IconButton label="Change status" disabled={busy} {...props}><Tag size={16} /></IconButton>}>
          {(close) => leadStatuses.map((status) => <MenuItem key={status} onClick={() => { close(); void changeStatus(status); }}>
            <StatusPill status={status} /></MenuItem>)}
        </Popover>
        {query.view === "archived"
          ? <IconButton label="Unarchive" disabled={busy} onClick={() => act("unarchive", selection, `${noun} restored to the inbox.`)}><ArchiveRestore size={16} /></IconButton>
          : <IconButton label="Archive" disabled={busy} onClick={() => act("archive", selection, `${noun} archived.`)}><Archive size={16} /></IconButton>}
        <IconButton label="Star" disabled={busy} onClick={() => act("star", selection)}><Star size={16} /></IconButton>
        <IconButton label="Move to trash" tipAlign="end" disabled={busy} onClick={() => act("trash", selection, `${noun} moved to Trash.`)}><Trash2 size={16} /></IconButton>
      </>}
    </div> : <div className="leads-views flex h-11 items-end gap-1 border-b border-[var(--lead-line)] px-3">
      <div role="tablist" aria-label="Lead views" className="leads-view-tabs flex min-w-0 items-end gap-1" onKeyDown={onTabKey}>
        {(mobile ? [...primaryViews, ...moreViews] : primaryViews).map((view) => <button key={view.value} type="button" role="tab" aria-selected={query.view === view.value} aria-controls={panelId}
          tabIndex={query.view === view.value || (!mobile && moreActive && view.value === "needs_reply") ? 0 : -1} onClick={() => setQuery({ view: view.value })}
          className={`-mb-px whitespace-nowrap border-b-2 px-1.5 pb-2.5 pt-2 text-[13px] ${query.view === view.value
            ? "border-[var(--lead-blue)] font-semibold text-[var(--lead-navy)]" : "border-transparent font-medium text-[var(--lead-muted)] hover:text-[var(--lead-navy)]"}`}>
          {view.label}{count(view.value)}
        </button>)}
      </div>
      {!mobile ? <Popover label="More views" align="end" className="min-w-[190px]" trigger={(props) => <button type="button" {...props}
        className={`-mb-px ml-auto flex items-center gap-1 whitespace-nowrap border-b-2 px-1.5 pb-2.5 pt-2 text-[13px] ${moreActive
          ? "border-[var(--lead-blue)] font-semibold text-[var(--lead-navy)]" : "border-transparent font-medium text-[var(--lead-muted)] hover:text-[var(--lead-navy)]"}`}>
        {moreActive ? moreActive.label : "More"}{moreActive ? count(moreActive.value) : null}<ChevronDown size={14} aria-hidden />
      </button>}>
        {(close) => moreViews.map((view) => <MenuItem key={view.value} checked={query.view === view.value} onClick={() => { close(); setQuery({ view: view.value }); }}>
          <span className="flex-1">{view.label}</span><span className="text-xs tabular-nums text-[var(--lead-muted)]">{counts?.[view.value] ?? ""}</span>
        </MenuItem>)}
      </Popover> : null}
    </div>}

    <div ref={scroller} id={panelId} role="tabpanel" aria-label={`${[...primaryViews, ...moreViews].find((view) => view.value === query.view)?.label} leads`}
      aria-busy={rows === null || inbox.refreshing} className="leads-list-scroll leads-scroll flex-1"
      onTouchStart={(event) => {
        if (!mobile || scroller.current?.scrollTop || inbox.refreshing || event.touches.length !== 1) return;
        const touch = event.touches[0];
        pullStart.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchMove={(event) => {
        if (!pullStart.current || event.touches.length !== 1) return;
        const dx = event.touches[0].clientX - pullStart.current.x;
        const dy = event.touches[0].clientY - pullStart.current.y;
        if (dy < 0 || Math.abs(dx) > Math.abs(dy)) { pullStart.current = null; setPull(0); return; }
        setPull(Math.min(88, dy * 0.5));
      }}
      onTouchEnd={() => {
        if (pullStart.current && pull >= 64) reload();
        pullStart.current = null;
        setPull(0);
      }}
      onTouchCancel={() => { pullStart.current = null; setPull(0); }}>
      {mobile && (pull > 0 || inbox.refreshing) ? <div role="status" className="leads-pull-status" style={{ minHeight: inbox.refreshing ? 48 : pull }}>
        <RefreshCw size={16} className={inbox.refreshing ? "animate-spin" : ""} />
        {inbox.refreshing ? "Refreshing…" : pull >= 64 ? "Release to refresh" : "Pull to refresh"}
      </div> : null}
      {rows === null ? <ListSkeleton /> : inbox.error ? <div className="p-8 text-center">
        <p role="alert" className="text-sm text-[#96281f]">{inbox.error}</p>
        <button type="button" className="leads-button mt-3" onClick={reload}>Try again</button>
      </div> : rows.length ? <ul>
        {rows.map((lead) => <LeadRow key={lead.id} lead={lead} now={now} current={inbox.selectedLeadId === lead.id}
          href={`/dashboard/leads/${lead.id}${inbox.queryString}`} checked={selection.includes(lead.id)} selecting={selectMode || selection.length > 0}
          mobile={mobile} onSwipe={(action) => void swipe(lead, action)}
          site={inbox.showSites ? siteLabel(inbox.sites, lead.site_id) : null} trash={trash} busy={busy}
          onCheck={(checked) => select(checked ? [...selection, lead.id] : selection.filter((id) => id !== lead.id))}
          onAction={(action) => void act(action, [lead.id], action === "restore" ? "Lead restored." : action === "delete_forever" ? "Lead deleted." : undefined, false)} />)}
      </ul> : <EmptyView view={query.view} search={query.q} onClear={() => { setSearchReset((value) => value + 1); setQuery({ q: "" }); }} onAll={() => setQuery({ view: "all_open" })} />}
      {rows?.length ? <div ref={sentinel} className="flex min-h-10 items-center justify-center py-3 text-xs text-[var(--lead-muted)]">
        {inbox.loadingMore ? <span role="status">Loading more…</span>
          : inbox.hasMore ? <button type="button" className="leads-button" onClick={loadMore}>Load more</button>
          : rows.length > 12 ? "End of list" : null}
      </div> : null}
    </div>
  </>;
}

function siteLabel(sites: { id: string; name: string | null; subdomain: string }[], id: string) {
  const site = sites.find((item) => item.id === id);
  return site?.name || site?.subdomain || "Website";
}

/** Typing stays local to the field; the list only reloads once the search settles. */
function SearchBox({ initial, onSearch, inputRef }: { initial: string; onSearch: (value: string) => void; inputRef: Ref<HTMLInputElement> }) {
  const [text, setText] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <div className="px-3 pt-3">
    <label className="relative block">
      <span className="sr-only">Search leads</span>
      <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--lead-muted)]" />
      <input ref={inputRef} type="search" name="q" value={text} maxLength={200} placeholder="Search leads…" autoComplete="off" className="leads-input" style={{ paddingLeft: 34 }}
        onChange={(event) => {
          const value = event.target.value;
          setText(value);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => onSearch(value.trim()), 300);
        }} />
    </label>
  </div>;
}

function LeadRow({ lead, now, current, href, checked, selecting, site, trash, busy, mobile, onCheck, onAction, onSwipe }: {
  lead: Lead; now: number; current: boolean; href: string; checked: boolean; selecting: boolean; site: string | null; trash: boolean; busy: boolean;
  mobile: boolean; onSwipe: (action: "archive" | "unarchive" | "read" | "unread") => void;
  onCheck: (checked: boolean) => void; onAction: (action: LeadInboxActionName) => void;
}) {
  const name = leadDisplayName(lead.data);
  const unread = leadIsUnread(lead);
  const at = lead.last_message_at || lead.last_activity_at;
  const snoozed = Boolean(lead.snoozed_until && new Date(lead.snoozed_until).getTime() > now);
  const [offset, setOffset] = useState(0);
  const gesture = useRef<{ x: number; y: number; dx: number } | null>(null);
  const suppressClick = useRef(false);
  return <li className="leads-row" data-selected={current}
    onPointerDown={(event) => {
      suppressClick.current = false;
      gesture.current = null;
      if (!mobile || selecting || trash || busy || event.pointerType !== "touch" || event.isPrimary === false ||
        (event.target as HTMLElement).closest("button, input, label")) return;
      gesture.current = { x: event.clientX, y: event.clientY, dx: 0 };
    }}
    onPointerMove={(event) => {
      const start = gesture.current;
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { gesture.current = null; setOffset(0); return; }
      start.dx = dx;
      if (Math.abs(dx) < 16) { setOffset(0); return; }
      suppressClick.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setOffset(Math.max(-104, Math.min(104, dx)));
    }}
    onPointerUp={() => {
      const dx = gesture.current?.dx ?? 0;
      gesture.current = null;
      setOffset(0);
      if (Math.abs(dx) >= 72) onSwipe(dx < 0 ? lead.archived ? "unarchive" : "archive" : unread ? "read" : "unread");
    }}
    onPointerCancel={() => { gesture.current = null; setOffset(0); }}
    onClickCapture={(event) => {
      if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
      else if (selecting && !(event.target as HTMLElement).closest("button, input")) {
        event.preventDefault(); onCheck(!checked);
      }
    }}>
    {offset !== 0 ? <div aria-hidden className="leads-swipe-action" data-direction={offset > 0 ? "read" : "archive"}>
      {offset > 0 ? <>{unread ? <MailOpen size={20} /> : <Mail size={20} />}<span>{unread ? "Read" : "Unread"}</span></>
        : <>{lead.archived ? <ArchiveRestore size={20} /> : <Archive size={20} />}<span>{lead.archived ? "Unarchive" : "Archive"}</span></>}
    </div> : null}
    <div className="leads-row-content" style={offset ? { transform: `translateX(${offset}px)` } : undefined}>
    <Link href={href} data-lead-link aria-current={current ? "true" : undefined} className="block py-3 pl-[60px] pr-3 -outline-offset-2">
      <span className="flex items-center gap-2">
        {unread ? <span aria-hidden className="size-2 shrink-0 rounded-full bg-[var(--lead-blue)]" /> : null}
        <span className={`truncate text-sm text-[var(--lead-navy)] ${unread ? "font-bold" : "font-medium"}`}>{name}</span>
        {unread ? <span className="sr-only">Unread.</span> : null}
        {now ? <time dateTime={at} className={`ml-auto shrink-0 text-xs tabular-nums ${unread ? "font-semibold text-[var(--lead-blue)]" : "text-[var(--lead-muted)]"}`}>
          {relativeLeadTime(at, now)}</time> : null}
      </span>
      {site ? <span className="mt-0.5 block truncate text-xs text-[var(--lead-muted)]">{site}</span> : null}
      <span className={`mt-0.5 block truncate text-[13px] ${unread ? "text-[var(--lead-body)]" : "text-[var(--lead-muted)]"}`}>{leadPreview(lead)}</span>
      <span className="mt-1.5 flex h-5 items-center gap-1.5 pr-8">
        <StatusPill status={lead.status} />
        {snoozed ? <Clock size={13} aria-label="Snoozed" className="text-[var(--lead-muted)]" /> : null}
        {lead.remind_at ? <Bell size={13} aria-label="Reminder set" className="text-[var(--lead-muted)]" /> : null}
      </span>
    </Link>
    <span className="absolute left-3 top-3 flex size-9 items-center justify-center">
      <span className="leads-row-avatar" data-hidden={selecting}><Avatar name={name} /></span>
      <label className="leads-row-check absolute flex size-11 cursor-pointer items-center justify-center" data-on={selecting || checked}>
        <input type="checkbox" checked={checked} aria-label={`Select ${name}`} onChange={(event) => onCheck(event.target.checked)}
          className="size-4 cursor-pointer" />
      </label>
    </span>
    <span className="absolute bottom-1.5 right-1.5 flex">
      {trash ? <>
        <IconButton label="Restore" tipSide="top" tipAlign="end" className="size-7" disabled={busy} onClick={() => onAction("restore")}><RotateCcw size={14} /></IconButton>
        <IconButton label="Delete forever" tipSide="top" tipAlign="end" className="size-7" disabled={busy} onClick={() => onAction("delete_forever")}><Trash2 size={14} /></IconButton>
      </> : <IconButton label={lead.starred ? "Remove star" : "Star"} tipSide="top" tipAlign="end" aria-pressed={Boolean(lead.starred)}
        className="leads-row-star is-plain size-7" data-on={Boolean(lead.starred)} disabled={busy} onClick={() => onAction(lead.starred ? "unstar" : "star")}>
        <Star size={15} fill={lead.starred ? "#f5b301" : "none"} color={lead.starred ? "#c98f00" : "currentColor"} />
      </IconButton>}
    </span>
    </div>
  </li>;
}

function ListSkeleton() {
  return <div role="status" aria-label="Loading leads">
    {Array.from({ length: 8 }, (_, index) => <div key={index} className="flex gap-3 border-b border-[var(--lead-line)] px-3 py-3.5">
      <div className="leads-skeleton size-9 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2 pt-0.5">
        <div className="leads-skeleton h-3.5" style={{ width: `${38 + (index % 3) * 12}%` }} />
        <div className="leads-skeleton h-3 w-11/12" /><div className="leads-skeleton h-4 w-14 rounded-full" />
      </div>
    </div>)}
  </div>;
}

function EmptyView({ view, search, onClear, onAll }: { view: LeadInboxView; search: string; onClear: () => void; onAll: () => void }) {
  const copy = search ? { title: "No leads match your search", body: `Nothing in this view matches “${search}”.` } : emptyViewCopy[view];
  return <div className="flex flex-col items-center px-8 py-14 text-center">
    <span className="flex size-11 items-center justify-center rounded-full bg-[var(--lead-bg)] text-[var(--lead-muted)]"><Inbox size={20} aria-hidden /></span>
    <p className="mt-4 text-sm font-semibold text-[var(--lead-navy)]">{copy.title}</p>
    <p className="mt-1 text-[13px] text-[var(--lead-muted)]">{copy.body}</p>
    {search ? <button type="button" className="leads-button mt-4" onClick={onClear}>Clear search</button>
      : view === "needs_reply" ? <button type="button" className="mt-4 text-[13px] font-medium text-[var(--lead-blue)] hover:underline" onClick={onAll}>View all leads</button> : null}
  </div>;
}
