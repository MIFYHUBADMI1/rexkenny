import type { Metadata } from "next";
import Link from "next/link";
import { getBeats } from "@/lib/content";
import { buildMetadata, CORE_KEYWORDS } from "@/lib/seo/metadata";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/DemoNotice";
import { SITE } from "@/lib/site";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildGraph, breadcrumbNode, musicGroupNode } from "@/lib/seo/jsonld";
import { getArtistProfile } from "@/lib/content";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Music & Beat Licensing",
    description: `Licence ${SITE.shortName}'s instrumentals, stems and catalogue for films, adverts, radio, sync, sampling and releases. Tier options, terms and how to request a quote.`,
    path: "/licensing",
    keywords: [...CORE_KEYWORDS, "African Dancehall beat licensing", "Ugandan beat lease"],
  });
}

const TIERS = [
  {
    name: "Lease",
    use: "Non-exclusive recording use",
    includes: ["Tagless files", "Up to a agreed stream ceiling", "Credit required"],
    excludes: ["Re-selling the beat as-is", "Sync in film or advertising"],
  },
  {
    name: "Premium",
    use: "Commercial release with broader limits",
    includes: ["Trackout stems", "Higher usage ceiling", "Music video use"],
    excludes: ["Exclusive ownership transfer"],
  },
  {
    name: "Exclusive",
    use: "Full transfer of the recording rights",
    includes: ["Sole ownership of the master", "Removes the beat from the catalogue", "Signed assignment"],
    excludes: [],
  },
  {
    name: "Sync / custom",
    use: "Film, TV, adverts, games, radio",
    includes: ["Quoted per project", "Territory and term negotiated", "Stems on request"],
    excludes: [],
  },
];

export default async function LicensingPage() {
  const [{ data: beats, source }, { data: artist }] = await Promise.all([
    getBeats(),
    getArtistProfile(),
  ]);

  return (
    <>
      <JsonLd
        data={buildGraph([
          musicGroupNode(artist),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Licensing", path: "/licensing" },
          ]),
        ])}
      />

      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Licensing", path: "/licensing" },
        ]}
        title="Licensing"
        lede={`Clearing ${SITE.shortName}'s instrumentals and catalogue for your project. Prices are quoted per use — no automatic checkout is running until a payment provider is configured.`}
      />

      <div className="container-page py-14">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((t) => (
            <article key={t.name} className="rounded-lg border border-charcoal bg-ink-raised p-5">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-gold">
                {t.name}
              </h2>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-smoke">{t.use}</p>
              <ul className="mt-4 space-y-1.5 text-sm text-mist">
                {t.includes.map((i) => (
                  <li key={i}>+ {i}</li>
                ))}
                {t.excludes.map((i) => (
                  <li key={i} className="text-smoke">− {i}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="mt-14">
          <h2 className="eyebrow">Available instrumentals</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-smoke">
            Only beats the artist has marked as published appear below. Each one carries
            BPM, key and an authorised preview — nothing is listed before it is real.
          </p>

          <div className="mt-6">
            {beats.length === 0 ? (
              <EmptyState
                title="No beats published yet"
                body={
                  source === "demo"
                    ? "The beat catalogue is being updated — check back soon."
                    : "No instrumentals are available for licensing right now."
                }
                action={{ href: "/contact?kind=beat-licence", label: "Ask about a custom beat" }}
              />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {beats.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/beats/${b.slug}`}
                      className="group block overflow-hidden rounded-lg border border-charcoal bg-ink-raised"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={b.artworkUrl ?? "/images/placeholder-cover-800.jpg"}
                        alt={`${b.title} artwork`}
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                      <span className="block p-4">
                        <span className="block font-semibold group-hover:text-gold">{b.title}</span>
                        <span className="mt-1 block text-xs text-smoke">
                          {b.bpm ? `${b.bpm} BPM` : "BPM not listed"}
                          {b.musicalKey ? ` · ${b.musicalKey}` : ""} · {b.genre}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="mt-14 max-w-2xl">
          <h2 className="eyebrow">How clearing works</h2>
          <ol className="mt-4 space-y-3 text-sm leading-relaxed text-smoke">
            {[
              "Send the enquiry form with the track, the type of use, territory and term you need.",
              "We confirm in writing whether the work is ours to licence and quote accordingly.",
              "On acceptance, a written agreement is signed and files are delivered — stems, trackouts or masters as agreed.",
              "Credit appears as written in the agreement; sampling permissions are stated there, not assumed.",
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-bold text-gold">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <Link href="/contact?kind=beat-licence" className="btn-gold mt-8">
            Request a quote
          </Link>
        </section>
      </div>
    </>
  );
}
