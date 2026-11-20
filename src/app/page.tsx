import { getReleases, getArtistProfile, getVideos } from "@/lib/content";
import { buildMetadata, CORE_KEYWORDS } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  buildGraph,
  musicGroupNode,
  personNode,
  releaseNode,
} from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";
import { Hero } from "@/components/marketing/Hero";
import { ReleaseGrid } from "@/components/music/ReleaseGrid";
import { Section } from "@/components/ui/Section";
import { GenreStrip } from "@/components/marketing/GenreStrip";
import { TaglineBand } from "@/components/marketing/TaglineBand";
import { SubscribeCall } from "@/components/marketing/SubscribeCall";
import { DemoNotice } from "@/components/ui/DemoNotice";
import Link from "next/link";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return buildMetadata({
    path: "/",
    description: SITE.description,
    keywords: CORE_KEYWORDS,
    image: SITE.ogImage,
    imageAlt: `${SITE.shortName}, ${SITE.role.toLowerCase()} from ${SITE.city}, ${SITE.country}`,
  });
}

export default async function HomePage() {
  const [{ data: releases, source }, artistRes, videosRes] = await Promise.all([
    getReleases(),
    getArtistProfile(),
    getVideos(),
  ]);

  const artist = artistRes.data;
  const featured = releases[0] ?? null;
  const latest = releases.slice(0, 6);
  const videos = videosRes.data.slice(0, 3);

  return (
    <>
      <JsonLd
        data={buildGraph([
          personNode(artist),
          musicGroupNode(artist),
          featured ? releaseNode(featured)["@graph"] : null,
        ].filter(Boolean))}
      />

      <Hero artist={artist} featured={featured} />

      <TaglineBand
        words={[
          SITE.tagline,
          ...SITE.roles.slice(0, 3),
          `${SITE.city}, ${SITE.country}`,
        ]}
      />

      {source === "demo" && <DemoNotice />}

      {featured && (
        <Section
          eyebrow="Latest Release"
          title={featured.title}
          description={featured.description ?? undefined}
          action={{ href: `/music/${featured.slug}`, label: "Open release" }}
        >
          <ReleaseGrid releases={[featured]} source={source} featured />
        </Section>
      )}

      <Section
        eyebrow="Catalogue"
        title="Music from Kasese"
        description={`Singles, EPs, albums and collaborations by ${SITE.shortName}.`}
        action={{ href: "/music", label: "All music" }}
      >
        <ReleaseGrid releases={latest} source={source} />
      </Section>

      <Section eyebrow="Live" title="Latest videos" action={{ href: "/videos", label: "All videos" }}>
        {videos.length > 0 ? (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/videos/${v.slug}`}
                  className="rk-lift rk-zoom group block overflow-hidden rounded-lg border border-ash"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={v.thumbnailUrl ?? "/images/placeholder-cover-800.jpg"}
                    alt={v.title}
                    className="aspect-video w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="block p-4">
                    <span className="text-[0.6875rem] uppercase tracking-[0.18em] text-gold">
                      {v.category.replace(/-/g, " ")}
                    </span>
                    <span className="mt-1 block font-semibold group-hover:text-gold">
                      {v.title}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-smoke">
            Videos are not published yet. Once the admin adds one it appears here.
          </p>
        )}
      </Section>

      <GenreStrip genres={artist.genres} />

      <Section
        eyebrow="Story"
        title="Who is REX KENNY?"
        action={{ href: "/about", label: "Read the full story" }}
      >
        <div className="grid gap-8 md:grid-cols-[1.2fr_1fr]">
          <p className="text-base leading-relaxed text-mist">{artist.bioMedium}</p>
          <aside className="rounded-lg border border-charcoal bg-ink-raised p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-smoke">From</p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-2xl">{SITE.city}</p>
            <p className="text-smoke">{SITE.country}</p>
            <p className="mt-4 text-xs uppercase tracking-[0.2em] text-smoke">Genre</p>
            <p className="mt-1 text-mist">{artist.genres.join(" · ")}</p>
            <Link href="/contact" className="btn-ghost mt-6 w-full">
              Book REX KENNY
            </Link>
          </aside>
        </div>
      </Section>

      <SubscribeCall />
    </>
  );
}
