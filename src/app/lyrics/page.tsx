import type { Metadata } from "next";
import Link from "next/link";
import { getArtistProfile, getLyricEntries } from "@/lib/content";
import { buildMetadata, CORE_KEYWORDS } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { Faq } from "@/components/seo/Faq";
import { lyricIndexFaq } from "@/lib/seo/faq";
import { buildGraph, musicGroupNode, breadcrumbNode, collectionNode } from "@/lib/seo/jsonld";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/DemoNotice";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Lyrics",
    description: `Lyrics by ${SITE.shortName}, published with the rights holder's authorisation. Search song words with songwriter credits and copyright attribution.`,
    path: "/lyrics",
    keywords: [...CORE_KEYWORDS, "REX KENNY Lyrics"],
  });
}

export default async function LyricsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const [{ data: artist }, entries] = await Promise.all([
    getArtistProfile(),
    getLyricEntries(),
  ]);

  // getLyricEntries is the only source of lyric pages: it skips anything whose
  // publication rights are not recorded, so this list can never link to a page
  // that answers 404.
  const needle = q.trim().toLowerCase();
  const shown = entries.filter(
    (e) =>
      needle === "" ||
      e.trackTitle.toLowerCase().includes(needle) ||
      e.releaseTitle.toLowerCase().includes(needle) ||
      e.genre.toLowerCase().includes(needle),
  );

  return (
    <>
      <JsonLd
        data={buildGraph([
          musicGroupNode(artist),
          collectionNode({
            name: `Lyrics by ${SITE.shortName}`,
            description:
              "Song words published on this site with the rights holder's authorisation.",
            path: "/lyrics",
            items: shown.map((e) => ({
              name: e.trackTitle,
              path: `/lyrics/${e.slug}`,
            })),
          }),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Lyrics", path: "/lyrics" },
          ]),
        ])}
      />

      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Lyrics", path: "/lyrics" },
        ]}
        title="Lyrics"
        lede={`Song words published with permission from ${SITE.shortName}'s writing and catalogue.`}
      />

      <div className="container-page py-14">
        <form method="get" className="mb-8 flex max-w-md gap-2">
          <label htmlFor="lyrics-q" className="sr-only">
            Search lyrics
          </label>
          <input
            id="lyrics-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search a song title…"
            className="min-w-0 flex-1 rounded-full border border-ash bg-ink px-5 py-3 text-sm placeholder:text-smoke focus:border-gold"
          />
          <button type="submit" className="btn-gold">Search</button>
        </form>

        {shown.length === 0 ? (
          <EmptyState
            title={needle ? "No matching lyrics" : "No lyrics published yet"}
            body={
              needle
                ? `Nothing in the published lyrics matches “${q}”. Search by song or release title.`
                : `Lyrics only appear here once ${SITE.shortName} authorises publication for that song. Nothing is scraped from third-party lyric sites.`
            }
            action={{ href: "/music", label: "Browse the music" }}
          />
        ) : (
          <ul className="divide-y divide-charcoal rounded-lg border border-charcoal">
            {shown.map((e) => (
              <li key={e.slug}>
                <Link
                  href={`/lyrics/${e.slug}`}
                  className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-ink-raised"
                >
                  <span>
                    <span className="block font-semibold">{e.trackTitle}</span>
                    <span className="block text-xs text-smoke">
                      {e.releaseTitle} · {e.genre}
                    </span>
                  </span>
                  <span className="text-xs uppercase tracking-widest text-gold">Read</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Faq
          items={lyricIndexFaq(shown.length)}
          path="/lyrics"
          heading="How lyrics are published here"
        />
      </div>
    </>
  );
}
