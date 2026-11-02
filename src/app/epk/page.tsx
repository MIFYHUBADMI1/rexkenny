import type { Metadata } from "next";
import Link from "next/link";
import { getArtistProfile, getReleases, getVideos } from "@/lib/content";
import { buildMetadata, absoluteUrl } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildGraph, personNode, musicGroupNode, breadcrumbNode } from "@/lib/seo/jsonld";
import { PrintButton } from "@/components/ui/PrintButton";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Electronic Press Kit (EPK)",
    description: `Press kit for ${SITE.shortName}: biography, genres, selected releases, videos, photographs, streaming links, booking and press contacts. Print or save as PDF.`,
    path: "/epk",
    keywords: [
      "REX KENNY EPK",
      "REX KENNY press kit",
      "Ugandan African Dancehall artist press kit",
      "book REX KENNY",
    ],
      image: SITE.ogImage,
  });
}

export default async function EpkPage() {
  const [{ data: artist, source }, { data: releases }, { data: videos }] =
    await Promise.all([getArtistProfile(), getReleases(), getVideos()]);

  return (
    <>
      <JsonLd
        data={buildGraph([
          personNode(artist),
          musicGroupNode(artist),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "EPK", path: "/epk" },
          ]),
        ])}
      />

      {source === "demo" && <DemoNotice />}

      {/* A4-ish sheet so print output reads like a document, not a web page. */}
      <div className="container-page py-14">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div>
            <p className="eyebrow">For bookers, press and festival programmers</p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black">
              Press kit
            </h1>
          </div>
          <PrintButton />
        </div>

        <article className="rounded-xl border border-charcoal bg-ink-soft p-8 md:p-12 print:border-0 print:bg-white print:p-0">
          <header className="grid gap-8 md:grid-cols-[240px_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={artist.photoUrl ?? "/images/rex-kenny-press-1-1600.jpg"}
              alt={`${SITE.shortName} — official press photograph`}
              className="aspect-[4/5] w-full rounded-lg object-cover"
            />
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-4xl font-black">
                {SITE.shortName}
              </h2>
              <p className="mt-2 text-gold">{SITE.roles.join(" · ")}</p>
              <p className="mt-1 text-sm text-smoke">
                {artist.city}, {artist.country} · {artist.genres.join(", ")}
              </p>
              <p className="mt-5 leading-relaxed text-mist">{artist.bioMedium}</p>
            </div>
          </header>

          <section className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Origin", `${artist.city}, ${artist.country}`],
              ["Primary genre", artist.genres[0] ?? "African Dancehall"],
              ["Works", SITE.roles.slice(-2).join(", ")],
              ["Status", "Independent — self-released"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-charcoal p-4 print:border-0">
                <p className="text-[0.625rem] uppercase tracking-[0.2em] text-smoke">{k}</p>
                <p className="mt-1 text-sm font-semibold text-mist">{v}</p>
              </div>
            ))}
          </section>

          <section className="mt-10">
            <h3 className="eyebrow">Selected releases</h3>
            {releases.length === 0 ? (
              <p className="mt-3 text-sm text-smoke">No releases published yet.</p>
            ) : (
              <table className="mt-4 w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-charcoal text-xs uppercase tracking-[0.14em] text-smoke">
                    <th className="py-2 pr-4">Title</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Year</th>
                    <th className="py-2">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {releases.slice(0, 8).map((r) => (
                    <tr key={r.id} className="border-b border-charcoal/60">
                      <td className="py-2.5 pr-4 font-semibold text-mist">{r.title}</td>
                      <td className="py-2.5 pr-4 text-smoke">{r.releaseType}</td>
                      <td className="py-2.5 pr-4 text-smoke">{r.releaseDate?.slice(0, 4) ?? "—"}</td>
                      <td className="py-2.5 text-smoke">
                        {r.streaming.length > 0 ? (
                          <a href={r.streaming[0].url} className="text-gold" rel="noopener noreferrer">
                            {r.streaming[0].platform}
                          </a>
                        ) : (
                          absoluteUrl(`/music/${r.slug}`)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {videos.length > 0 && (
            <section className="mt-10">
              <h3 className="eyebrow">Videos</h3>
              <ul className="mt-3 space-y-2 text-sm text-mist">
                {videos.slice(0, 5).map((v) => (
                  <li key={v.id}>
                    {v.title}
                    {v.youtubeId && (
                      <span className="text-smoke">
                        {" "}— https://www.youtube.com/watch?v={v.youtubeId}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-10 grid gap-6 sm:grid-cols-2">
            <div className="rounded-lg border border-charcoal p-5 print:border-0">
              <h3 className="eyebrow">Contact</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-smoke">Bookings</dt>
                  <dd className="text-mist">{artist.bookingEmail ?? "Use the contact form"}</dd>
                </div>
                <div>
                  <dt className="text-smoke">Press</dt>
                  <dd className="text-mist">{artist.pressEmail ?? "Use the contact form"}</dd>
                </div>
                <div>
                  <dt className="text-smoke">Web</dt>
                  <dd className="text-mist">{SITE.url}</dd>
                </div>
              </dl>
            </div>
            <div className="rounded-lg border border-charcoal p-5 print:border-0">
              <h3 className="eyebrow">Social</h3>
              {artist.socials.length > 0 ? (
                <ul className="mt-3 space-y-1.5 text-sm text-mist">
                  {artist.socials.map((s) => (
                    <li key={s.platform}>
                      {s.platform}: <span className="text-smoke">{s.url}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-smoke">
                  Official profile links are added in the admin; none are published yet.
                </p>
              )}
            </div>
          </section>

          <footer className="mt-10 border-t border-charcoal pt-5 text-xs text-smoke print:text-black">
            <p>
              Prepared {new Date().toISOString().slice(0, 10)} · {SITE.legalName} ·{" "}
              <Link href="/contact" className="text-gold">
                Request assets or clarification
              </Link>
            </p>
            <p className="mt-1">
              Photographs and recordings remain the property of their credited owners.
            </p>
          </footer>
        </article>
      </div>
    </>
  );
}
