"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CircleDollarSign, Globe2, HandHelping, Inbox, LayoutDashboard, Link2, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, Settings, Users, X } from "lucide-react";

const groups = [
  { label: "Workspace", items: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/sites", label: "Sites", icon: Globe2 },
    { href: "/dashboard/domains", label: "Domains", icon: Link2 },
    { href: "/dashboard/clients", label: "Clients", icon: Users, admin: true },
  ] },
  { label: "Operations", items: [
    { href: "/dashboard/domain-requests", label: "Domain requests", icon: HandHelping, admin: true },
    { href: "/dashboard/forms", label: "Forms", icon: Inbox },
    { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  ] },
  { label: "Management", items: [
    { href: "/dashboard/ai-usage", label: "AI costs", icon: CircleDollarSign, admin: true },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ] },
];

type SidebarProps = {
  agencyName: string; logoUrl: string | null; isSuperAdmin: boolean; userEmail: string; userName: string;
  signOutAction: () => Promise<void>; unreadCount: number | null;
};

export function Sidebar(props: SidebarProps) {
  const pathname = usePathname();
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
      if (window.innerWidth >= 768 && mobileDialog.current?.open) mobileDialog.current.close();
    };
    window.addEventListener("resize", closeOnDesktop);
    return () => window.removeEventListener("resize", closeOnDesktop);
  }, []);

  const openSearch = () => {
    if (mobileDialog.current?.open) mobileDialog.current.close();
    setSearchOpen(true);
  };
  const closeMobile = () => {
    if (mobileDialog.current?.open) mobileDialog.current.close();
  };
  const navigation = (compact: boolean, mobile: boolean) => <div className={`platform-sidebar flex h-full flex-col overflow-y-auto ${compact ? "w-[72px] px-2" : "w-[248px] max-w-[85vw] px-3"} py-4`}>
    <div className={`flex min-h-12 items-center gap-2 ${compact ? "justify-center" : "px-2"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- branding host is user-configured */}
      {props.logoUrl ? <img src={props.logoUrl} alt="" className="size-9 shrink-0 rounded-lg object-contain" /> :
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--platform-ink)] text-sm font-semibold text-white">{props.agencyName.charAt(0).toUpperCase()}</span>}
      {!compact ? <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-semibold tracking-tight">{props.agencyName}</strong><span className="block text-xs text-[var(--platform-muted)]">{props.isSuperAdmin ? "Agency workspace" : "Client workspace"}</span></span> : null}
      {mobile ? <button type="button" onClick={closeMobile} aria-label="Close navigation" className="platform-icon-button"><X size={17} /></button> : null}
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
            return <Link key={item.href} href={item.href} title={item.label} aria-label={compact ? item.label : undefined}
              aria-current={active ? "page" : undefined} onClick={mobile ? closeMobile : undefined}
              className={`platform-nav-link flex min-h-10 items-center gap-3 rounded-[10px] text-[13px] ${compact ? "justify-center px-0" : "px-3"} ${active ? "font-semibold text-[var(--platform-ink)]" : "text-[var(--platform-secondary)]"}`}>
              <item.icon size={17} strokeWidth={1.7} className={active ? "text-[var(--platform-accent)]" : undefined} />
              {!compact ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
              {item.href === "/dashboard/forms" && props.unreadCount !== 0 ? <span
                aria-label={props.unreadCount === null ? "Unread count unavailable" : `${props.unreadCount} unread submissions`}
                className={`platform-nav-count ${compact ? "sr-only" : ""}`}>{props.unreadCount === null ? "!" : props.unreadCount}</span> : null}
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
    <aside className="sticky top-0 hidden h-dvh shrink-0 border-r border-[var(--platform-line)] md:block">
      {navigation(collapsed, false)}
    </aside>
    <button type="button" onClick={() => { mobileDialog.current?.showModal(); setMobileOpen(true); }} aria-label="Open navigation" aria-haspopup="dialog" aria-controls={mobileId} aria-expanded={mobileOpen}
      className="platform-icon-button absolute left-4 top-3 z-10 md:hidden"><Menu size={19} /></button>
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
