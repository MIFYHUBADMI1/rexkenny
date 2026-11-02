import type { Metadata } from "next";
import Link from "next/link";
import { getReleases, getVideos, getPosts, getLyricEntries } from "@/lib/content";
import { buildMetadata } from "@/lib/seo/metadata";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  // Search result pages are utility pages: indexable=noindex, but followed so
  // crawlers still reach the results themselves.
  return buildMetadata({
    title: "Search",
    description: `Search ${SITE.shortName}'s music, videos, lyrics and news across ${SITE.url}.`,
    path: "/search",
    noindex: true,
  });
}

type Hit = { href: string; title: string; kind: string; snippet: string };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const term = q.trim().toLowerCase();

  const [{ data: releases }, { data: videos }, { data: posts }, lyrics] =
    await Promise.all([
      getReleases(),
      getVideos(),
      getPosts(),
      getLyricEntries(),
    ]);

  const hits: Hit[] = [];
  const match = (hay: string | null | undefined) =>
    term.length > 0 && (hay ?? "").toLowerCase().includes(term);

  for (const r of releases) {
    if (match(r.title) || match(r.genre) || match(r.description) || r.tracks.some((t) => match(t.title))) {
      hits.push({
        href: `/music/${r.slug}`,
        title: r.title,
        kind: `${r.releaseType} · ${r.genre}`,
        snippet: r.description ?? `${r.tracks.length} track${r.tracks.length === 1 ? "" : "s"}`,
      });
    }
  }
  for (const v of videos) {
    if (match(v.title) || match(v.description)) {
      hits.push({
        href: `/videos/${v.slug}`,
        title: v.title,
        kind: v.category.replace(/-/g, " "),
        snippet: v.description ?? "",
      });
    }
  }
  for (const l of lyrics) {
    if (match(l.trackTitle)) {
      hits.push({
        href: `/lyrics/${l.slug}`,
        title: `${l.trackTitle} — lyrics`,
        kind: "Lyrics",
        snippet: l.lyrics.slice(0, 120),
      });
    }
  }
  for (const p of posts) {
    if (match(p.title) || match(p.excerpt)) {
      hits.push({ href: `/news/${p.slug}`, title: p.title, kind: p.category, snippet: p.excerpt });
    }
  }

  return (
    <div className="container-page max-w-3xl py-14">
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-black">Search</h1>
      <form method="get" className="mt-6 flex gap-2">
        <label htmlFor="q" className="sr-only">Search term</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Song, video, lyric or article…"
          className="min-w-0 flex-1 rounded-full border border-ash bg-ink px-5 py-3 text-sm placeholder:text-smoke focus:border-gold"
        />
        <button type="submit" className="btn-gold">Search</button>
      </form>

      {term.length === 0 ? (
        <p className="mt-8 text-sm text-smoke">Type something to search the catalogue.</p>
      ) : hits.length === 0 ? (
        <p className="mt-8 text-sm text-smoke">
          Nothing matches <span className="text-mist">“{q}”</span>. Try a song title, a genre
          such as <Link href="/music?genre=afrobeat" className="text-gold">afrobeat</Link>, or
          browse <Link href="/music" className="text-gold">the full catalogue</Link>.
        </p>
      ) : (
        <>
          <p className="mt-8 text-xs uppercase tracking-[0.16em] text-smoke">
            {hits.length} result{hits.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-4 divide-y divide-charcoal rounded-lg border border-charcoal">
            {hits.map((h) => (
              <li key={h.href}>
                <Link href={h.href} className="group block p-4 hover:bg-ink-raised">
                  <span className="text-[0.6875rem] uppercase tracking-[0.16em] text-gold">
                    {h.kind}
                  </span>
                  <span className="mt-1 block font-semibold group-hover:text-gold">{h.title}</span>
                  {h.snippet && (
                    <span className="mt-1 block line-clamp-2 text-sm text-smoke">{h.snippet}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
