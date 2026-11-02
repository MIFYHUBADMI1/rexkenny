import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getReleaseBySlug, getReleases, getArtistProfile } from "@/lib/content";
import { buildMetadata, absoluteUrl } from "@/lib/seo/metadata";
import { releaseMeta } from "@/lib/seo/page-meta";
import { JsonLd } from "@/components/seo/JsonLd";
import { Faq } from "@/components/seo/Faq";
import { releaseFaq } from "@/lib/seo/faq";
import { buildGraph, releaseNode, musicGroupNode, breadcrumbNode } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { Player } from "@/components/music/Player";

export const dynamic = "force-dynamic";

/** Only released + indexable records reach search engines. */
function visible(r: { status: string; seo: { noindex: boolean } }) {
  return r.status === "released" && !r.seo.noindex;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { data: r } = await getReleaseBySlug(slug);
  if (!r) {
    return buildMetadata({ title: "Release not found", path: `/music/${slug}`, noindex: true });
  }

  // The fallback copy names only the platforms actually recorded for this
  // release, so a snippet can never promise a store the record is not on.
  return buildMetadata({
    ...releaseMeta(r),
    noindex: r.seo.noindex || !visible(r),
  });
}

export default async function ReleasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [{ data: release, source }, { data: all }, { data: artist }] = await Promise.all([
    getReleaseBySlug(slug),
    getReleases(),
    getArtistProfile(),
  ]);

  if (!release) notFound();
  const r = release;

  const related = all.filter((x) => x.slug !== r.slug).slice(0, 4);

  return (
    <>
      <JsonLd
        data={buildGraph([
          musicGroupNode(artist),
          releaseNode(r)["@graph"],
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Music", path: "/music" },
            { name: r.title, path: `/music/${r.slug}` },
          ]),
        ])}
      />

      {source === "demo" && <DemoNotice />}

      <div className="container-page py-14 md:py-20">
        <div className="grid gap-10 md:grid-cols-[minmax(0,380px)_1fr]">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={r.artworkUrl ?? "/images/placeholder-cover-800.jpg"}
              alt={r.artworkAlt}
              width={800}
              height={800}
              fetchPriority="high"
              decoding="async"
              className="aspect-square w-full rounded-lg border border-charcoal object-cover"
            />
            <Player
              tracks={r.tracks.map((t) => ({
                id: t.id,
                title: t.title,
                url: t.previewUrl,
                durationSeconds: t.durationSeconds,
              }))}
            />
          </div>

          <article>
            <nav aria-label="Breadcrumb" className="text-xs text-smoke">
              <Link href="/" className="hover:text-gold">Home</Link>
              <span className="mx-2">/</span>
              <Link href="/music" className="hover:text-gold">Music</Link>
              <span className="mx-2">/</span>
              <span aria-current="page" className="text-gold">{r.title}</span>
            </nav>

            <p className="eyebrow mt-5">{r.releaseType}</p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black md:text-5xl">
              {r.title}
            </h1>
            <p className="mt-3 text-mist">
              <Link href="/artist/rex-kenny" className="hover:text-gold">
                {SITE.shortName}
              </Link>
              {r.featuredArtists.length > 0 && (
                <> with {r.featuredArtists.join(", ")}</>
              )}
            </p>

            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              {[
                ["Released", r.releaseDate ?? "Date not confirmed"],
                ["Genre", r.genre],
                ...(r.language ? [["Language", r.language]] : []),
                ...(r.label ? [["Label", r.label]] : []),
                ...(r.isrc ? [["ISRC", r.isrc]] : []),
                ...(r.upc ? [["UPC/EAN", r.upc]] : []),
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs uppercase tracking-[0.16em] text-smoke">{k}</dt>
                  <dd className="mt-0.5 text-mist">{v}</dd>
                </div>
              ))}
            </dl>

            {r.description && (
              <p className="mt-7 leading-relaxed text-mist">{r.description}</p>
            )}

            <section className="mt-9">
              <h2 className="eyebrow">Stream</h2>
              {r.streaming.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2.5">
                  {r.streaming.map((s) => (
                    <li key={s.platform}>
                      <a
                        href={`${absoluteUrl("/listen")}?to=${encodeURIComponent(s.url)}&release=${r.slug}&platform=${encodeURIComponent(s.platform)}`}
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-gold-deep bg-gold/10 px-4 py-2 text-sm font-semibold text-gold hover:bg-gold hover:text-ink"
                      >
                        {s.platform} <ExternalLink size={13} />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-smoke">
                  Official streaming links for this release have not been added yet, so
                  none are shown. The {SITE.shortName}{" "}
                  <Link href="/listen" className="text-gold">listen page</Link> lists the
                  verified destinations.
                </p>
              )}
            </section>

            {r.tracks.length > 1 && (
              <section className="mt-9">
                <h2 className="eyebrow">Tracklist</h2>
                <ol className="mt-3 divide-y divide-charcoal rounded-lg border border-charcoal">
                  {r.tracks.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <span className="flex items-center gap-3 text-sm">
                        <span className="w-5 text-right text-xs text-smoke">{t.trackNumber}</span>
                        <span className="text-mist">{t.title}</span>
                        {t.explicit && (
                          <span className="rounded bg-blood px-1.5 py-0.5 text-[0.625rem] font-bold">
                            E
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-smoke">
                        {t.durationSeconds
                          ? `${Math.floor(t.durationSeconds / 60)}:${String(t.durationSeconds % 60).padStart(2, "0")}`
                          : "—"}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {(r.tracks.some((t) => t.credits.producer.length) ||
              r.tracks.some((t) => t.credits.songwriter.length)) && (
              <section className="mt-9 text-sm text-smoke">
                <h2 className="eyebrow">Credits</h2>
                <p className="mt-3">
                  Songwriter{": "}{[...new Set(r.tracks.flatMap((t) => t.credits.songwriter))].join(", ") || "not listed"}
                </p>
                <p>
                  Producer{": "}{[...new Set(r.tracks.flatMap((t) => t.credits.producer))].join(", ") || "not listed"}
                </p>
                {r.copyright && <p>© {r.copyright}</p>}
              </section>
            )}

            <Faq
              items={releaseFaq(r)}
              path={`/music/${r.slug}`}
              heading={`About “${r.title}”`}
            />

            {related.length > 0 && (
              <section className="mt-12">
                <h2 className="eyebrow">Also by {SITE.shortName}</h2>
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {related.map((x) => (
                    <li key={x.id}>
                      <Link
                        href={`/music/${x.slug}`}
                        className="group block overflow-hidden rounded border border-charcoal"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={x.artworkUrl ?? "/images/placeholder-cover-800.jpg"}
                          alt={x.artworkAlt}
                          width={800}
                          height={800}
                          loading="lazy"
                          decoding="async"
                          className="aspect-square w-full object-cover"
                        />
                        <span className="block truncate p-2 text-xs text-mist group-hover:text-gold">
                          {x.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </article>
        </div>
      </div>
    </>
  );
}

export async function generateStaticParams() {
  const { data } = await getReleases();
  return data.filter(visible).map((r) => ({ slug: r.slug }));
}
