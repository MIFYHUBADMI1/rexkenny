import Link from "next/link";
import { SITE, NAV, SOCIALS } from "@/lib/site";

const legal = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms-of-service", label: "Terms of Service" },
  { href: "/cookie-policy", label: "Cookie Policy" },
  { href: "/copyright-policy", label: "Copyright" },
  { href: "/licensing", label: "Music Licensing" },
];

const published = SOCIALS.filter((s) => s.url.length > 0);
const configured = SITE.gscToken !== "";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-ash bg-ink-soft">
      <div className="container-page py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <p className="font-[family-name:var(--font-display)] text-xl font-black tracking-[0.16em]">
              {SITE.shortName}
            </p>
            <p className="mt-1 text-[0.6875rem] font-semibold uppercase tracking-[0.3em] text-gold">
              {SITE.role}
            </p>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-smoke">
              {SITE.tagline} {SITE.shortName} is an independent artist, songwriter
              and producer working out of {SITE.city}, {SITE.country}.
            </p>
            <p className="mt-4 text-xs text-smoke">
              {SITE.city}, {SITE.country}
            </p>
          </div>

          <nav aria-label="Footer — pages">
            <h2 className="eyebrow">Explore</h2>
            <ul className="mt-4 space-y-2.5">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    className="text-sm text-mist transition-colors hover:text-gold"
                  >
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Footer — follow">
            <h2 className="eyebrow">Follow</h2>
            {published.length > 0 ? (
              <ul className="mt-4 space-y-2.5">
                {published.map((s) => (
                  <li key={s.platform}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer me"
                      className="text-sm text-mist transition-colors hover:text-gold"
                    >
                      {s.platform}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-smoke">
                Social links are not published yet. Add them in the admin under
                Artist profile.
              </p>
            )}
          </nav>

          <nav aria-label="Footer — legal">
            <h2 className="eyebrow">Legal</h2>
            <ul className="mt-4 space-y-2.5">
              {legal.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-mist transition-colors hover:text-gold"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/sitemap.xml" className="text-sm text-mist hover:text-gold">
                  Sitemap
                </Link>
              </li>
              <li>
                <Link href="/auth/login" className="text-sm text-mist hover:text-gold">
                  Sign in
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-charcoal pt-6 text-xs text-smoke md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {SITE.legalName}. All rights reserved.
          </p>
          <p>
            {configured
              ? "Search Console verification active."
              : "Search Console not yet verified — set NEXT_PUBLIC_GSC_SITE_VERIFICATION."}
          </p>
        </div>
      </div>
    </footer>
  );
}
