import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getBeats, getArtistProfile } from "@/lib/content";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildGraph, musicGroupNode, breadcrumbNode } from "@/lib/seo/jsonld";
import { Player } from "@/components/music/Player";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

async function find(slug: string) {
  const { data } = await getBeats();
  return data.find((b) => b.slug === slug) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const beat = await find(slug);
  if (!beat) return buildMetadata({ title: "Beat not found", path: `/beats/${slug}`, noindex: true });

  return buildMetadata({
    title: `${beat.title} — Beat by ${SITE.shortName} (${beat.bpm ?? ""} BPM)`,
    description: `${beat.title} — ${beat.genre} instrumental produced by ${SITE.shortName}. ${beat.bpm ? `${beat.bpm} BPM` : ""}${beat.musicalKey ? ` in ${beat.musicalKey}` : ""}. Lease, premium and exclusive licences available.`,
    path: `/beats/${beat.slug}`,
    image: beat.artworkUrl,
    keywords: ["African Dancehall beat", "Afrobeat instrumental", `${SITE.shortName} beats`],
  });
}

export default async function BeatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [beat, { data: artist }] = await Promise.all([find(slug), getArtistProfile()]);
  if (!beat) notFound();

  return (
    <>
      <JsonLd
        data={buildGraph([
          musicGroupNode(artist),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Beats", path: "/beats" },
            { name: beat.title, path: `/beats/${beat.slug}` },
          ]),
        ])}
      />

      <div className="container-page py-12 md:py-16">
        <nav aria-label="Breadcrumb" className="text-xs text-smoke">
          <Link href="/" className="hover:text-gold">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/beats" className="hover:text-gold">Beats</Link>
          <span className="mx-2">/</span>
          <span aria-current="page" className="text-gold">{beat.title}</span>
        </nav>

        <div className="mt-6 grid gap-10 md:grid-cols-[minmax(0,360px)_1fr]">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={beat.artworkUrl ?? "/images/placeholder-cover-800.jpg"}
              alt={`${beat.title} artwork`}
              className="aspect-square w-full rounded-lg border border-charcoal object-cover"
            />
            <Player tracks={[{ id: beat.id, title: `${beat.title} preview`, url: beat.previewUrl, durationSeconds: null }]} />
          </div>

          <article>
            <p className="eyebrow">Instrumental</p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black">
              {beat.title}
            </h1>
            <p className="mt-2 text-sm text-smoke">Produced by {SITE.shortName} · {beat.genre}</p>

            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              {[
                ["BPM", beat.bpm ? String(beat.bpm) : "Not listed"],
                ["Key", beat.musicalKey ?? "Not listed"],
                ["Genre", beat.genre],
              ].map(([k, v]) => (
                <div key={k} className="rounded border border-charcoal p-3">
                  <dt className="text-xs uppercase tracking-[0.14em] text-smoke">{k}</dt>
                  <dd className="mt-1 text-mist">{v}</dd>
                </div>
              ))}
            </dl>

            {beat.description && (
              <p className="mt-6 leading-relaxed text-mist">{beat.description}</p>
            )}

            <section className="mt-8">
              <h2 className="eyebrow">Licence options</h2>
              {beat.licensingOptions.length === 0 ? (
                <p className="mt-3 text-sm text-smoke">
                  No licence tiers are configured for this beat yet.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-charcoal rounded-lg border border-charcoal">
                  {beat.licensingOptions.map((o) => (
                    <li key={o.name} className="flex items-start justify-between gap-4 p-4">
                      <span>
                        <span className="block font-semibold">{o.name}</span>
                        <span className="mt-1 block text-sm text-smoke">{o.terms}</span>
                      </span>
                      <span className="shrink-0 text-sm text-gold">
                        {o.priceUsd === null ? "POA" : `$${o.priceUsd}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-xs leading-relaxed text-smoke">
                No card payment is taken on this site. Enquiries are confirmed in writing,
                and a payment gateway is only enabled once one is configured and verified.
              </p>
            </section>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/contact?kind=beat-licence&beat=${beat.slug}`} className="btn-gold">
                Enquire about this beat
              </Link>
              <Link href="/licensing" className="btn-ghost">Licensing terms</Link>
            </div>
          </article>
        </div>
      </div>
    </>
  );
}
