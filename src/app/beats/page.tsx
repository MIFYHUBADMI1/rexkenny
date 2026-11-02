import type { Metadata } from "next";
import Link from "next/link";
import { getArtistProfile, getBeats } from "@/lib/content";
import { buildMetadata, CORE_KEYWORDS } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildGraph, musicGroupNode, breadcrumbNode } from "@/lib/seo/jsonld";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/DemoNotice";
import { SITE } from "@/lib/site";
import { Player } from "@/components/music/Player";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Beats — Instrumentals for Licence",
    description: `Instrumentals produced by ${SITE.shortName} — African Dancehall, Afrobeat and Hip-hop beats with BPM, key and authorised previews. Lease, premium and exclusive licences available.`,
    path: "/beats",
    keywords: [...CORE_KEYWORDS, "African Dancehall beats", "Ugandan beatmaker", "buy African beats"],
  });
}

export default async function BeatsPage() {
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
            { name: "Beats", path: "/beats" },
          ]),
        ])}
      />

      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Beats", path: "/beats" },
        ]}
        title="Beat catalogue"
        lede={`Instrumentals written and produced by ${SITE.shortName}. Previews play here; payment is arranged in writing until a verified gateway is connected.`}
      />

      <div className="container-page py-14">
        {beats.length === 0 ? (
          <EmptyState
            title="No beats on sale yet"
            body={
              source === "demo"
                ? `Supabase is not connected, so the catalogue is empty. Nothing is invented here — beats appear only once they are uploaded and marked published.`
                : `No beats are marked published yet.`
            }
            action={{ href: "/licensing", label: "Read the licensing terms" }}
          />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {beats.map((b) => (
              <li key={b.id} className="rounded-lg border border-charcoal bg-ink-raised p-4">
                <Link href={`/beats/${b.slug}`} className="group block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={b.artworkUrl ?? "/images/placeholder-cover-800.jpg"}
                    alt={`${b.title} artwork`}
                    loading="lazy"
                    className="aspect-square w-full rounded object-cover"
                  />
                  <span className="mt-3 block font-semibold group-hover:text-gold">{b.title}</span>
                  <span className="mt-1 block text-xs text-smoke">
                    {b.bpm ? `${b.bpm} BPM` : "BPM —"} · {b.musicalKey ?? "key —"} · {b.genre}
                  </span>
                </Link>
                <Player
                  tracks={[{ id: b.id, title: `${b.title} preview`, url: b.previewUrl, durationSeconds: null }]}
                />
                <Link href="/contact?kind=beat-licence" className="btn-ghost mt-4 w-full text-xs">
                  Enquire
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
