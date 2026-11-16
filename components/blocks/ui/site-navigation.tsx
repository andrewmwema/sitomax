"use client";

import { useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "./button";

export function SiteNavigation({ businessName, brandLink, links, buttonText, buttonLink }: {
  businessName: string;
  brandLink: string;
  links: { label: string; href: string }[];
  buttonText: string;
  buttonLink: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const toggle = useRef<HTMLButtonElement>(null);

  return (
    <header
      className="site-navigation flex flex-wrap items-center justify-between gap-x-6 gap-y-[var(--content-gap)]"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <a href={brandLink || "/"} className="max-w-[calc(100%-5rem)] text-xl leading-tight focus-visible:outline-2 focus-visible:outline-offset-4 md:max-w-[30%]" style={{ fontFamily: "var(--font-heading)", fontWeight: "var(--heading-weight)" as React.CSSProperties["fontWeight"] }}>{businessName}</a>
      <button ref={toggle} type="button" className="site-menu-toggle flex min-h-12 min-w-12 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] focus-visible:outline-2 focus-visible:outline-offset-2 md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
      </button>
      <nav id={id} aria-label="Main navigation" className={`site-nav-menu w-full flex-col gap-2 md:flex md:w-auto md:flex-1 md:flex-row md:flex-wrap md:items-center md:justify-end md:gap-x-5 ${open ? "flex" : "hidden"}`}>
        {links.map((link, i) => <a key={i} href={link.href || "#"} onClick={() => setOpen(false)} className="flex min-h-12 items-center text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">{link.label}</a>)}
        {buttonText ? <div className="site-actions"><Button href={buttonLink} onClick={() => setOpen(false)}>{buttonText}</Button></div> : null}
      </nav>
    </header>
  );
}
