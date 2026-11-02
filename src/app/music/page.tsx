import type { Metadata } from "next";
import Link from "next/link";
import { getReleases } from "@/lib/content";
import { buildMetadata, CORE_KEYWORDS } from "@/lib/seo/metadata";
import { recordedPlatforms, TYPE_LABEL } from "@/lib/seo/page-meta";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildGraph, musicGroupNode, personNode, breadcrumbNode, collectionNode } from "@/lib/seo/jsonld";
import { getArtistProfile } from "@/lib/content";
import { ReleaseGrid } from "@/components/music/ReleaseGrid";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [{ data: releases }, { data: artist }] = await Promise.all([
    getReleases(),
    getArtistProfile(),
  ]);
  const published = releases.filter((r) => r.status === "released");
  const platforms = recordedPlatforms(
    artist.streaming,
    ...published.map((r) => r.streaming),
  );
  const types = [...new Set(published.map((r) => TYPE_LABEL[r.releaseType] ?? r.releaseType))];

  return buildMetadata({
    title: "Music — Songs, Singles, EPs & Albums",
    description:
      published.length === 0
        ? `The ${SITE.shortName} catalogue: African Dancehall releases from ${SITE.city}, ${SITE.country}. Each record appears here once it is published.`
        : `${published.length} ${published.length === 1 ? "release" : "releases"} by ${SITE.shortName} — ${types.join(", ")}. ${
            platforms.length > 0
              ? `Linked on ${platforms.join(", ")}.`
              : "Store links are published on each release page as they are recorded."
          }`,
    path: "/music",
    keywords: [...CORE_KEYWORDS, "REX KENNY Songs", "REX KENNY Music"],
  });
}

type FilterKey = "type" | "genre";

const FILTERS: { key: FilterKey; label: string; values: string[] }[] = [
  { key: "type", label: "Type", values: ["single", "ep", "album", "instrumental"] },
  { key: "genre", label: "Genre", values: ["african dancehall", "afrobeat", "afropop", "hip-hop"] },
];

export default async function MusicPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; genre?: string }>;
}) {
  const filters = await searchParams;
  const [{ data: releases, source }, { data: artist }] = await Promise.all([
    getReleases(),
    getArtistProfile(),
  ]);

  const visible = releases.filter(
    (r) =>
      (!filters.type || r.releaseType === filters.type) &&
      (!filters.genre || r.genre.toLowerCase().includes(filters.genre)),
  );

  return (
    <>
      <JsonLd
        data={buildGraph([
          personNode(artist),
          musicGroupNode(artist),
          // Built from the same filtered list the grid renders, so the ItemList
          // can never contain a release the page does not show.
          collectionNode({
            name: `Music by ${SITE.shortName}`,
            description: `Releases published on ${SITE.shortName}'s official site.`,
            path: "/music",
            items: visible.map((r) => ({ name: r.title, path: `/music/${r.slug}` })),
          }),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Music", path: "/music" },
          ]),
        ])}
      />

      <div className="container-page py-14 md:py-20">
        <header className="mb-10">
          <nav aria-label="Breadcrumb" className="text-xs text-smoke">
            <Link href="/" className="hover:text-gold">Home</Link>
            <span className="mx-2">/</span>
            <span aria-current="page" className="text-gold">Music</span>
          </nav>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-black md:text-6xl">
            Music
          </h1>
          <p className="mt-4 max-w-2xl leading-relaxed text-smoke">
            Every published release by {SITE.shortName}. Each one links to its official
            streaming destinations and, where authorised, its lyrics and video.
          </p>
        </header>

        <div className="mb-8 flex flex-wrap gap-2">
          <FilterLink label="All" href="/music" active={!filters.type && !filters.genre} />
          {FILTERS.map((f) =>
            f.values.map((v) => (
              <FilterLink
                key={`${f.key}-${v}`}
                label={`${f.label}: ${v}`}
                href={`/music?${f.key}=${encodeURIComponent(v)}`}
                active={filters[f.key] === v}
              />
            )),
          )}
        </div>

        <ReleaseGrid releases={visible} source={source} />
      </div>
    </>
  );
}

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] transition-colors ${
        active ? "border-gold bg-gold text-ink" : "border-ash text-mist hover:border-gold hover:text-gold"
      }`}
    >
      {label}
    </Link>
  );
}
