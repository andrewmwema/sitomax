"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CircleDollarSign, ClipboardCheck, Globe2, HandHelping, Inbox, LayoutDashboard, Link2, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, Settings, Users, X } from "lucide-react";
import { AgencyBrand } from "./agency-brand";

const groups = [
  { label: "Workspace", items: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard, color: "text-indigo-700" },
    { href: "/dashboard/sites", label: "Sites", icon: Globe2, color: "text-sky-700" },
    { href: "/dashboard/domains", label: "Domains", icon: Link2, color: "text-teal-700" },
    { href: "/dashboard/clients", label: "Clients", icon: Users, color: "text-violet-700", admin: true },
  ] },
  { label: "Operations", items: [
    { href: "/dashboard/domain-requests", label: "Domain requests", icon: HandHelping, color: "text-orange-700", admin: true },
    { href: "/dashboard/leads", label: "Leads", icon: Inbox, color: "text-rose-700" },
    { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3, color: "text-emerald-700" },
  ] },
  { label: "Management", items: [
    { href: "/dashboard/admin/grader", label: "Website grader", icon: ClipboardCheck, color: "text-indigo-700", admin: true },
    { href: "/dashboard/ai-usage", label: "AI costs", icon: CircleDollarSign, color: "text-amber-700", admin: true },
    { href: "/dashboard/settings", label: "Settings", icon: Settings, color: "text-fuchsia-700" },
  ] },
];

type SidebarProps = {
  agencyName: string; logoUrl: string | null; isSuperAdmin: boolean; userEmail: string; userName: string;
  signOutAction: () => Promise<void>; unreadCount: number | null;
};

export function Sidebar(props: SidebarProps) {
  const pathname = usePathname();
  const leads = pathname === "/dashboard/leads" || pathname.startsWith("/dashboard/leads/");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileId = useId();
  const searchId = useId();
  const searchDialog = useRef<HTMLDialogElement>(null);
  const mobileDialog = useRef<HTMLDialogElement>(null);
  const items = groups.flatMap((group) => group.items).filter((item) => !("admin" in item) || props.isSuperAdmin);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (mobileDialog.current?.open) mobileDialog.current.close();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  useEffect(() => {
    if (searchOpen && !searchDialog.current?.open) searchDialog.current?.showModal();
    if (!searchOpen && searchDialog.current?.open) searchDialog.current.close();
  }, [searchOpen]);
  useEffect(() => {
    const closeOnDesktop = () => {
      if (window.innerWidth >= (leads ? 1200 : 768) && mobileDialog.current?.open) mobileDialog.current.close();
    };
    window.addEventListener("resize", closeOnDesktop);
    return () => window.removeEventListener("resize", closeOnDesktop);
  }, [leads]);

  const openSearch = () => {
    if (mobileDialog.current?.open) mobileDialog.current.close();
    setSearchOpen(true);
  };
  const closeMobile = () => {
    if (mobileDialog.current?.open) mobileDialog.current.close();
  };
  const navigation = (compact: boolean, mobile: boolean) => <div className={`platform-sidebar flex h-full flex-col overflow-y-auto ${compact ? "w-[72px] px-2" : "w-[248px] max-w-[85vw] px-3"} py-4`}>
    <div className={`flex min-h-12 items-center gap-2 ${compact ? "justify-center" : "px-2"}`}>
      <AgencyBrand name={props.agencyName} logoUrl={props.logoUrl} compact={compact}
        subtitle={props.isSuperAdmin ? "Agency workspace" : "Client workspace"} />
      {mobile ? <button type="button" onClick={closeMobile} aria-label="Close navigation" className="platform-icon-button shrink-0"><X size={17} /></button> : null}
    </div>
    <button type="button" onClick={openSearch} title="Search or jump to" aria-label="Search or jump to" aria-haspopup="dialog" aria-controls={searchId} className={`platform-search-trigger mt-5 ${compact ? "justify-center px-0" : "px-3"}`}>
      <Search size={16} className="shrink-0" />
      {!compact ? <><span className="min-w-0 flex-1 truncate text-left">Search or jump to...</span><kbd className="platform-keyboard">Ctrl K</kbd></> : null}
    </button>
    <nav aria-label="Main navigation" className="mt-6 flex flex-1 flex-col gap-5">
      {groups.map((group) => {
        const visible = group.items.filter((item) => !("admin" in item) || props.isSuperAdmin);
        if (!visible.length) return null;
        return <div key={group.label} className="flex flex-col gap-1">
          {!compact ? <p className="platform-eyebrow mb-1 px-3">{group.label}</p> : null}
          {visible.map((item) => {
            const active = !item.href.includes("#") && (item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(`${item.href}/`) || pathname === item.href);
            const unreadLabel = props.unreadCount === null ? "Unread count unavailable" : `${props.unreadCount} unread ${props.unreadCount === 1 ? "lead" : "leads"}`;
            return <Link key={item.href} href={item.href} title={item.label} aria-label={compact ? `${item.label}${item.href === "/dashboard/leads" && props.unreadCount !== 0 ? `, ${unreadLabel}` : ""}` : undefined}
              aria-current={active ? "page" : undefined} onClick={mobile ? closeMobile : undefined}
              className={`platform-nav-link relative flex min-h-10 items-center gap-3 rounded-[10px] text-[13px] ${compact ? "justify-center px-0" : "px-3"} ${active ? "font-semibold text-[var(--platform-ink)]" : "text-[var(--platform-secondary)]"}`}>
              <item.icon size={17} strokeWidth={1.7} className={props.isSuperAdmin ? item.color : active ? "text-[var(--platform-accent)]" : undefined} />
              {!compact ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
              {item.href === "/dashboard/leads" && props.unreadCount !== 0 ? <span
                aria-label={unreadLabel}
                className={`platform-nav-count ${compact ? "absolute right-0 top-0" : ""}`}>{props.unreadCount === null ? "!" : props.unreadCount}</span> : null}
            </Link>;
          })}
        </div>;
      })}
    </nav>
    <div className="mt-5 border-t border-[var(--platform-line)] pt-4">
      <div className={`flex items-center gap-2.5 ${compact ? "justify-center" : "px-1"}`}>
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--platform-line)] bg-[var(--platform-subtle)] text-xs font-medium text-[var(--platform-secondary)]">{(props.userName || props.userEmail || "U").charAt(0).toUpperCase()}</span>
        {!compact ? <div className="min-w-0"><p className="truncate text-xs font-semibold">{props.userName || props.userEmail}</p><p className="mt-0.5 truncate text-xs text-[var(--platform-muted)]">{props.userName ? props.userEmail : props.isSuperAdmin ? "Agency admin" : "Team member"}</p></div> : null}
      </div>
      <form action={props.signOutAction}><button type="submit" aria-label="Sign out" className={`platform-nav-link mt-3 flex min-h-10 w-full items-center gap-3 rounded-lg text-xs text-[var(--platform-secondary)] ${compact ? "justify-center" : "px-3"}`}><LogOut size={16} />{!compact ? <span>Sign out</span> : null}</button></form>
      {!mobile ? <button type="button" onClick={() => setCollapsed(!collapsed)} aria-label={compact ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!compact}
        className={`platform-nav-link mt-1 flex min-h-10 w-full items-center gap-3 rounded-lg text-xs text-[var(--platform-secondary)] ${compact ? "justify-center" : "px-3"}`}>
        {compact ? <PanelLeftOpen size={16} /> : <><PanelLeftClose size={16} /><span>Collapse sidebar</span></>}
      </button> : null}
    </div>
  </div>;

  return <>
    <aside className="platform-desktop-sidebar sticky top-0 hidden h-dvh shrink-0 border-r border-[var(--platform-line)] md:block">
      {navigation(collapsed, false)}
    </aside>
    <button type="button" onClick={() => { mobileDialog.current?.showModal(); setMobileOpen(true); }} aria-label="Open navigation" aria-haspopup="dialog" aria-controls={mobileId} aria-expanded={mobileOpen}
      className="platform-mobile-toggle platform-icon-button absolute left-4 top-3 z-10 md:hidden"><Menu size={19} />
      {props.unreadCount !== 0 ? <span aria-label={props.unreadCount === null ? "Unread count unavailable" : `${props.unreadCount} unread ${props.unreadCount === 1 ? "lead" : "leads"}`}
        className="platform-nav-count absolute -right-1 -top-1">{props.unreadCount === null ? "!" : props.unreadCount}</span> : null}
    </button>
    <dialog ref={mobileDialog} id={mobileId} onClose={() => setMobileOpen(false)} aria-label="Workspace navigation" className="platform-mobile-nav md:hidden">
      {navigation(false, true)}
    </dialog>
    <dialog ref={searchDialog} id={searchId} onClose={() => { setSearchOpen(false); setSearch(""); }} aria-label="Search navigation" className="platform-search-dialog">
      <label className="flex items-center gap-3 rounded-lg border border-[var(--platform-line)] px-3">
        <Search size={18} /><span className="sr-only">Search pages</span>
        <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pages..." className="h-11 w-full outline-none" />
      </label>
      <div className="mt-2 max-h-80 overflow-y-auto">{items.filter((item) => item.label.toLowerCase().includes(search.toLowerCase().trim())).map((item) =>
        <Link key={item.href} href={item.href} onClick={() => setSearchOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-[var(--platform-subtle)]"><item.icon size={17} />{item.label}</Link>)}
        {!items.some((item) => item.label.toLowerCase().includes(search.toLowerCase().trim())) ? <p className="px-3 py-4 text-sm text-[var(--platform-muted)]">No matching pages.</p> : null}
      </div>
      <button type="button" className="mt-2 text-xs text-[var(--platform-secondary)] underline" onClick={() => setSearchOpen(false)}>Close</button>
    </dialog>
  </>;
}
