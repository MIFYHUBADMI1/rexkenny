import Link from "next/link";
import { ExternalLink, Disc3, Play } from "lucide-react";
import type { Release } from "@/lib/types";
import { SITE } from "@/lib/site";
import { EmptyState } from "@/components/ui/DemoNotice";

export function ReleaseGrid({
  releases,
  source,
  featured = false,
}: {
  releases: Release[];
  source: "supabase" | "demo";
  featured?: boolean;
}) {
  if (releases.length === 0) {
    return (
      <EmptyState
        title="No releases published yet"
        body="When the admin publishes a release it appears here, on /music and in the sitemap automatically."
        action={{ href: "/admin/setup", label: "Set up the catalogue" }}
      />
    );
  }

  return (
    <div
      className={
        featured
          ? "grid gap-6 md:grid-cols-[minmax(0,420px)_1fr]"
          : "grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
      }
    >
      {releases.map((r) => (
        <ReleaseCard key={r.id} release={r} featured={featured} source={source} />
      ))}
    </div>
  );
}

export function ReleaseCard({
  release: r,
  featured,
  source,
}: {
  release: Release;
  featured: boolean;
  source: "supabase" | "demo";
}) {
  const href = `/music/${r.slug}`;
  const artwork = r.artworkUrl ?? "/images/placeholder-cover-800.jpg";

  return (
    <article
      className={`rk-lift group relative overflow-hidden rounded-lg border border-charcoal bg-ink-raised ${
        featured ? "md:col-span-1" : ""
      }`}
    >
      <Link href={href} className="rk-zoom block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={artwork}
          alt={r.artworkAlt}
          className={`w-full object-cover ${featured ? "aspect-square" : "aspect-square"}`}
          loading="lazy"
        />
        {/* Affordance only: the same link already says where it goes. */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 top-3 flex h-9 w-9 translate-y-1 items-center justify-center rounded-full bg-gold text-ink opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
        >
          <Play size={14} fill="currentColor" />
        </span>
        <div className="p-4">
          <p className="text-[0.6875rem] uppercase tracking-[0.18em] text-gold">
            {r.releaseType}
            {r.releaseDate ? ` · ${r.releaseDate.slice(0, 4)}` : ""}
          </p>
          <h3
            className={`mt-1 font-semibold leading-snug group-hover:text-gold ${
              featured ? "text-2xl" : "text-base"
            }`}
          >
            {r.title}
          </h3>
          {featured && r.description && (
            <p className="mt-2 line-clamp-3 text-sm text-smoke">{r.description}</p>
          )}
          {!featured && <p className="mt-1 text-xs text-smoke">{r.genre}</p>}
        </div>
      </Link>

      {r.streaming.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {r.streaming.slice(0, featured ? 6 : 2).map((s) => (
            <a
              key={s.platform}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-ash px-2.5 py-1 text-[0.6875rem] font-semibold text-mist hover:border-gold hover:text-gold"
            >
              {s.platform} <ExternalLink size={11} />
            </a>
          ))}
        </div>
      )}

      {source === "demo" && (
        <p className="flex items-center gap-1.5 border-t border-charcoal px-4 py-2 text-[0.6875rem] text-smoke">
          <Disc3 size={11} /> Placeholder · {SITE.shortName} catalogue
        </p>
      )}
    </article>
  );
}
