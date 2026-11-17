"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CircleDollarSign, Globe2, HandHelping, Inbox, LayoutDashboard, LogOut, Search, Settings, Users } from "lucide-react";

const groups = [
  { label: "Main", items: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard#sites", label: "Sites", icon: Globe2 },
    { href: "/dashboard/clients", label: "Clients", icon: Users, admin: true },
    { href: "/dashboard/domain-requests", label: "Domain requests", icon: HandHelping, admin: true },
    { href: "/dashboard/forms", label: "Forms", icon: Inbox },
    { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  ] },
  { label: "Workspace", items: [
    { href: "/dashboard/ai-usage", label: "AI costs", icon: CircleDollarSign, admin: true },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ] },
];

export function Sidebar({ agencyName, logoUrl, isSuperAdmin, userEmail, userName, signOutAction, unreadCount }: {
  agencyName: string; logoUrl: string | null; isSuperAdmin: boolean; userEmail: string; userName: string;
  signOutAction: () => Promise<void>; unreadCount: number | null;
}) {
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const items = groups.flatMap((group) => group.items).filter((item) => !("admin" in item) || isSuperAdmin);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setOpen(true);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return <aside className="platform-sidebar sticky top-0 flex h-dvh w-16 shrink-0 flex-col gap-6 overflow-y-auto border-r border-[#E8E7E3] px-2 py-5 md:w-[244px] md:px-4">
    <div className="flex min-h-10 items-center gap-3 px-1 md:px-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- branding host is user-configured */}
      {logoUrl ? <img src={logoUrl} alt="" className="size-8 shrink-0 rounded-lg object-contain" /> :
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#121212] text-sm font-semibold text-white shadow-[inset_0_1px_0_#ffffff26,0_3px_6px_#12121214]">{agencyName.charAt(0).toUpperCase()}</span>}
      <span className="hidden min-w-0 md:block"><strong className="block truncate text-[14px] font-semibold tracking-tight">{agencyName}</strong><span className="mt-0.5 block text-[11px] text-[#6B6A66]">Your digital workspace</span></span>
    </div>
    <button type="button" onClick={() => setOpen(true)} title="Search or jump to" aria-label="Search or jump to" className="flex min-h-10 shrink-0 items-center gap-2 rounded-[10px] border border-[#E8E7E3] bg-white px-3 text-left text-xs text-[#6B6A66] shadow-[0_1px_2px_#12121204] hover:border-[#CCC9C0]">
      <Search size={16} className="shrink-0" /><span className="hidden min-w-0 flex-1 truncate md:block">Search...</span><kbd className="hidden shrink-0 rounded-md border border-[#E8E7E3] bg-[#F7F7F5] px-1.5 py-0.5 text-[11px] md:block">Ctrl K</kbd>
    </button>
    <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-5">
      {groups.map((group) => <div key={group.label} className="flex flex-col gap-1">
        <p className="platform-eyebrow mb-2 hidden px-3 md:block">{group.label === "Main" ? "Manage" : group.label}</p>
        {group.items.filter((item) => !("admin" in item) || isSuperAdmin).map((item) => {
          const active = !item.href.includes("#") && (item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href));
          return <Link key={item.href} href={item.href} title={item.label} aria-current={active ? "page" : undefined}
            className={`platform-nav-link flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[13px] transition ${active ? "font-semibold text-[#121212]" : "text-[#5F5E5A] hover:bg-[#F0EFEA] hover:text-[#121212]"}`}>
            <item.icon size={17} strokeWidth={1.6} className={active ? "text-[#4B3FE0]" : undefined} /><span className="hidden md:block">{item.label}</span>
            {item.href === "/dashboard/forms" && unreadCount !== 0 ? <span
              aria-label={unreadCount === null ? "Unread count unavailable" : `${unreadCount} unread submissions`}
              className="ml-auto rounded-full bg-[#EFEDFF] px-1.5 py-0.5 text-xs font-semibold text-[#4B3FE0]">{unreadCount === null ? "!" : unreadCount}</span> : null}
          </Link>;
        })}
      </div>)}
    </nav>
    <div className="border-t border-[#E8E7E3] pt-4">
      <div className="flex items-center gap-2.5 px-1">
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#E8E7E3] bg-[#F0EFEA] text-xs font-medium text-[#55534E]">{(userName || userEmail || "U").charAt(0).toUpperCase()}</span>
        <div className="hidden min-w-0 md:block">
          <p className="truncate text-xs font-semibold">{userName || userEmail}</p>
          <p className="mt-0.5 truncate text-[11px] text-[#6B6A66]">{userName ? userEmail : isSuperAdmin ? "Agency admin" : "Team member"}</p>
        </div>
      </div>
      <form action={signOutAction}><button type="submit" aria-label="Sign out" className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-[#6B6A66] hover:bg-[#F0EFEA] hover:text-[#121212]"><LogOut size={14} /><span className="hidden md:block">Sign out</span></button></form>
    </div>
    <dialog ref={dialog} onClose={() => { setOpen(false); setSearch(""); }} aria-label="Search navigation" className="m-auto w-[min(520px,90vw)] rounded-2xl border border-[#E8E7E3] bg-white p-4 text-[#121212] shadow-xl backdrop:bg-black/30">
      <label className="flex items-center gap-3 rounded-lg border border-[#E8E7E3] px-3"><Search size={18} /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pages..." className="h-11 w-full outline-none" /></label>
      <div className="mt-2 max-h-80 overflow-y-auto">{items.filter((item) => item.label.toLowerCase().includes(search.toLowerCase().trim())).map((item) =>
        <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-[#F7F7F5]"><item.icon size={17} />{item.label}</Link>)}</div>
      <button type="button" className="mt-2 text-xs text-[#6B6A66] underline" onClick={() => setOpen(false)}>Close</button>
    </dialog>
  </aside>;
}
