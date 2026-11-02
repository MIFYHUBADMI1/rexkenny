import type { Metadata } from "next";
import Link from "next/link";
import { getArtistProfile, getReleases } from "@/lib/content";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildGraph, personNode, musicGroupNode, breadcrumbNode } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";
import { ReleaseGrid } from "@/components/music/ReleaseGrid";
import { DemoNotice } from "@/components/ui/DemoNotice";

export const dynamic = "force-dynamic";

/**
 * The artist identity page — the single URL we want encyclopaedias,
 * press and AI assistants to treat as authoritative.
 */
export function generateMetadata(): Metadata {
  return buildMetadata({
    title: `${SITE.shortName} — African Dancehall Artist from Kasese, Uganda`,
    description: `Official artist profile of ${SITE.shortName}: biography, discography, music videos, streaming links, licensing and booking contact. African Dancehall, singer, songwriter and producer from Kasese, Uganda.`,
    path: "/artist/rex-kenny",
    type: "profile",
    image: SITE.ogImage,
    keywords: [
      "REX KENNY",
      "REX KENNY Music",
      "REX KENNY Uganda",
      "REX KENNY Kasese",
      "African Dancehall Uganda",
      "Ugandan Dancehall Artist",
    ],
  });
}

export default async function ArtistProfilePage() {
  const [{ data: artist, source }, { data: releases, source: rSource }] =
    await Promise.all([getArtistProfile(), getReleases()]);

  return (
    <>
      <JsonLd
        data={buildGraph([
          personNode(artist),
          musicGroupNode(artist),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Artist", path: "/artist/rex-kenny" },
          ]),
        ])}
      />

      {source === "demo" && <DemoNotice />}

      <div className="container-page py-14 md:py-20">
        <div className="grid gap-10 md:grid-cols-[320px_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artist.photoUrl ?? "/images/rex-kenny-press-1-1600.jpg"}
            alt={`${SITE.shortName}, ${SITE.role.toLowerCase()} from ${SITE.city}, ${SITE.country}`}
            className="aspect-[4/5] w-full rounded-lg border border-charcoal object-cover"
          />

          <div>
            <p className="eyebrow">Official artist profile</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-black md:text-6xl">
              {SITE.shortName}
            </h1>
            <p className="mt-3 text-lg text-gold">{SITE.roles.join(" · ")}</p>
            <p className="mt-1 text-sm text-smoke">
              {artist.city}, {artist.country} · {artist.genres.join(" · ")}
            </p>
            <p className="mt-6 max-w-2xl leading-relaxed text-mist">{artist.bioMedium}</p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/music" className="btn-gold">Discography</Link>
              <Link href="/epk" className="btn-ghost">Press kit</Link>
              <Link href="/contact" className="btn-ghost">Booking enquiry</Link>
            </div>

            {artist.streaming.length > 0 ? (
              <div className="mt-8">
                <h2 className="eyebrow">Stream on</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {artist.streaming.map((s) => (
                    <li key={s.platform}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-ash px-4 py-1.5 text-sm text-mist hover:border-gold hover:text-gold"
                      >
                        {s.platform}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-8 text-sm text-smoke">
                Streaming profile links appear here once they are added in the admin —
                they are not guessed at.
              </p>
            )}
          </div>
        </div>

        <section className="mt-16">
          <h2 className="text-2xl font-bold">Discography</h2>
          <p className="mt-2 text-sm text-smoke">
            Published releases, newest first. See <Link href="/music" className="text-gold">/music</Link>{" "}
            for filters.
          </p>
          <div className="mt-6">
            <ReleaseGrid releases={releases.slice(0, 8)} source={rSource} />
          </div>
        </section>
      </div>
    </>
  );
}
