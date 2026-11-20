"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Search } from "lucide-react";
import { NAV, SITE } from "@/lib/site";
import { AccountLink } from "@/components/layout/AccountLink";
import { NavItem } from "@/components/admin/AdminSidebar";
import { visibleModules } from "@/lib/admin/modules";
import { useAccountSession } from "@/lib/auth/useAccountSession";

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const account = useAccountSession();
  const inAdmin = pathname.startsWith("/admin");
  const adminModules =
    inAdmin && account?.signedIn ? visibleModules(account.roles) : [];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors duration-300 ${
        scrolled || open
          ? "border-ash bg-ink/95 backdrop-blur"
          : "border-transparent bg-gradient-to-b from-ink/90 to-transparent"
      }`}
    >
      <div className="container-page flex h-16 items-center justify-between gap-4 md:h-20">
        <Link
          href={inAdmin ? "/admin" : "/"}
          className="shrink-0 font-[family-name:var(--font-display)] text-lg font-black tracking-[0.18em] text-paper md:text-xl"
          aria-label={
            inAdmin ? `${SITE.shortName} — dashboard` : `${SITE.shortName} — home`
          }
        >
          REX KENNY
          <span className="ml-1.5 hidden text-[0.6rem] font-semibold tracking-[0.3em] text-gold sm:inline">
            {inAdmin ? "HQ" : "MUSIC"}
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`relative px-3 py-2 text-[0.8125rem] font-semibold uppercase tracking-[0.12em] transition-colors ${
                isActive(item.href)
                  ? "text-gold"
                  : "text-mist hover:text-paper"
              }`}
            >
              {item.label}
              {isActive(item.href) && (
                <span className="absolute inset-x-3 -bottom-px h-px bg-gold" />
              )}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/search"
            className="hidden h-10 w-10 items-center justify-center rounded-full border border-ash text-mist transition-colors hover:border-gold hover:text-gold md:flex"
            aria-label="Search the site"
          >
            <Search size={17} />
          </Link>
          <AccountLink variant="desktop" />
          <Link href="/listen" className="btn-gold hidden md:inline-flex" prefetch={false}>
            Listen Now
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-ash text-paper lg:hidden"
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-ash bg-ink lg:hidden"
        >
          {adminModules.length > 0 && (
            <div className="border-b border-ash">
              <p className="eyebrow container-page pb-1 pt-4">Workspace</p>
              <ul className="container-page pb-4">
                {adminModules.map((m) => (
                  <NavItem
                    key={m.href}
                    module={m}
                    active={pathname === m.href}
                  />
                ))}
              </ul>
            </div>
          )}

          <ul className="container-page flex flex-col py-2">
            {NAV.map((item) => (
              <li key={item.href} className="border-b border-charcoal last:border-0">
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={`block py-4 text-sm font-semibold uppercase tracking-[0.14em] ${
                    isActive(item.href) ? "text-gold" : "text-paper"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <AccountLink variant="mobile" onNavigate={() => setOpen(false)} />
            <li className="pb-4">
              <Link href="/listen" onClick={() => setOpen(false)} className="btn-gold w-full">
                Listen Now
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
