import type { Metadata } from "next";
import { getArtistProfile } from "@/lib/content";
import { buildMetadata, CORE_KEYWORDS } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildGraph, personNode, musicGroupNode, breadcrumbNode } from "@/lib/seo/jsonld";
import { PageHeader } from "@/components/ui/PageHeader";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { SITE } from "@/lib/site";
import Link from "next/link";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "About — Biography & Artist Story",
    description: `Who is ${SITE.shortName}? Biography of the African Dancehall artist, singer, songwriter and producer from ${SITE.city}, ${SITE.country} — influences, mission and press-ready text.`,
    path: "/about",
    keywords: [...CORE_KEYWORDS, "REX KENNY biography", "REX KENNY Uganda"],
    type: "profile",
    image: SITE.ogImage,
  });
}

export default async function AboutPage() {
  const { data: artist, source } = await getArtistProfile();

  return (
    <>
      <JsonLd
        data={buildGraph([
          personNode(artist),
          musicGroupNode(artist),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "About", path: "/about" },
          ]),
        ])}
      />

      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "About", path: "/about" },
        ]}
        title={`About ${SITE.shortName}`}
        lede={artist.bioShort}
      />

      {source === "demo" && <DemoNotice />}

      <div className="container-page grid gap-14 py-16 lg:grid-cols-[1.6fr_1fr]">
        <article className="space-y-10">
          <section>
            <h2 className="eyebrow">The story</h2>
            <p className="mt-4 text-lg leading-relaxed text-mist">{artist.bioMedium}</p>
            <p className="mt-4 leading-relaxed text-smoke">{artist.bioLong}</p>
          </section>

          <section>
            <h2 className="eyebrow">Sound</h2>
            <p className="mt-4 leading-relaxed text-smoke">
              Working primarily in {artist.genres[0] ?? "African Dancehall"}, with
              {" "}{artist.genres.slice(1).join(", ")} in the catalogue.
            </p>
            {artist.instruments.length > 0 && (
              <p className="mt-3 text-sm text-smoke">
                <span className="text-mist">Writes, records and produces:</span>{" "}
                {artist.instruments.join(", ")}
              </p>
            )}
            {artist.influences.length > 0 && (
              <p className="mt-3 text-sm text-smoke">
                <span className="text-mist">Influences:</span>{" "}
                {artist.influences.join(", ")}
              </p>
            )}
          </section>

          <section>
            <h2 className="eyebrow">Mission</h2>
            <blockquote className="mt-4 border-l-2 border-gold pl-5 font-[family-name:var(--font-display)] text-2xl leading-snug">
              {artist.mission || SITE.tagline}
            </blockquote>
          </section>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/music" className="btn-gold">Hear the music</Link>
            <Link href="/epk" className="btn-ghost">Press kit (EPK)</Link>
            <Link href="/contact" className="btn-ghost">Bookings &amp; enquiries</Link>
          </div>
        </article>

        <aside className="space-y-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artist.photoUrl ?? "/images/rex-kenny-press-1-1600.jpg"}
            alt={`${SITE.shortName} — press photograph`}
            width={1143}
            height={1600}
            decoding="async"
            className="w-full rounded-lg border border-charcoal object-cover"
          />
          <dl className="rounded-lg border border-charcoal bg-ink-raised p-5 text-sm">
            {[
              ["Based in", `${artist.city}, ${artist.country}`],
              ["Genres", artist.genres.join(", ")],
              ["Roles", SITE.roles.join(", ")],
              ["Works", "Independent — self-released"],
            ].map(([k, v]) => (
              <div key={k} className="border-b border-charcoal py-2.5 last:border-0">
                <dt className="text-xs uppercase tracking-[0.16em] text-smoke">{k}</dt>
                <dd className="mt-1 text-mist">{v}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </>
  );
}
