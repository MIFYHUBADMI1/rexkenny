import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getLyricBySlug, getLyricEntries, getArtistProfile } from "@/lib/content";
import { buildMetadata, absoluteUrl } from "@/lib/seo/metadata";
import { lyricMeta } from "@/lib/seo/page-meta";
import { JsonLd } from "@/components/seo/JsonLd";
import { Faq } from "@/components/seo/Faq";
import { lyricFaq } from "@/lib/seo/faq";
import { buildGraph, musicGroupNode, breadcrumbNode } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getLyricBySlug(slug);
  if (!entry) return buildMetadata({ title: "Lyrics not found", path: `/lyrics/${slug}`, noindex: true });

  return buildMetadata(lyricMeta(entry));
}

export default async function LyricsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [entry, { data: artist }] = await Promise.all([
    getLyricBySlug(slug),
    getArtistProfile(),
  ]);

  if (!entry) notFound();

  const others = (await getLyricEntries()).filter((e) => e.slug !== entry.slug).slice(0, 6);

  return (
    <>
      <JsonLd
        data={buildGraph([
          musicGroupNode(artist),
          {
            "@type": "CreativeWork",
            "@id": `${absoluteUrl(`/lyrics/${entry.slug}`)}#lyrics`,
            name: `${entry.trackTitle} (Lyrics)`,
            url: absoluteUrl(`/lyrics/${entry.slug}`),
            author: entry.songwriters.map((w) => ({ "@type": "Person", name: w })),
            about: { "@type": "MusicRecording", name: entry.trackTitle },
            inLanguage: entry.language ?? "en",
            isAccessibleForFree: true,
            creditText: `Words by ${entry.songwriters.join(", ") || SITE.shortName}`,
          },
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Lyrics", path: "/lyrics" },
            { name: entry.trackTitle, path: `/lyrics/${entry.slug}` },
          ]),
        ])}
      />

      <div className="container-page max-w-3xl py-12 md:py-16">
        <nav aria-label="Breadcrumb" className="text-xs text-smoke">
          <Link href="/" className="hover:text-gold">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/lyrics" className="hover:text-gold">Lyrics</Link>
          <span className="mx-2">/</span>
          <span aria-current="page" className="text-gold">{entry.trackTitle}</span>
        </nav>

        <header className="mt-6">
          <p className="eyebrow">Lyrics</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black">
            {entry.trackTitle}
          </h1>
          <p className="mt-3 text-sm text-smoke">
            <Link href="/artist/rex-kenny" className="text-gold">{SITE.shortName}</Link>
            {" "}· from{" "}
            <Link href={`/music/${entry.releaseSlug}`} className="text-gold">
              {entry.releaseTitle}
            </Link>
            {entry.releaseDate && ` · ${entry.releaseDate.slice(0, 4)}`}
          </p>
        </header>

        {/* white-space: pre-line preserves the writer's line breaks — lyrics
            lose their structure if the newlines are collapsed. */}
        <section
          aria-label={`Lyrics for ${entry.trackTitle}`}
          className="mt-9 whitespace-pre-line border-l-2 border-gold/50 pl-6 text-[1.0625rem] leading-relaxed text-mist"
        >
          {entry.lyrics}
        </section>

        <footer className="mt-10 rounded-lg border border-charcoal bg-ink-raised p-5 text-xs leading-relaxed text-smoke">
          <p>
            <strong className="text-mist">Writers:</strong>{" "}
            {entry.songwriters.join(", ") || "not listed"}
          </p>
          {entry.producers.length > 0 && (
            <p className="mt-1">
              <strong className="text-mist">Producer:</strong> {entry.producers.join(", ")}
            </p>
          )}
          <p className="mt-3">
            Published with the rights holder’s permission. Reproducing these lyrics
            elsewhere without written consent is not permitted — see the{" "}
            <Link href="/copyright-policy" className="text-gold">copyright policy</Link>.
          </p>
        </footer>

        <Faq
          items={lyricFaq(entry)}
          path={`/lyrics/${entry.slug}`}
          heading="About these lyrics"
        />

        {others.length > 0 && (
          <section className="mt-12">
            <h2 className="eyebrow">More lyrics</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {others.map((o) => (
                <li key={o.slug}>
                  <Link
                    href={`/lyrics/${o.slug}`}
                    className="block rounded border border-charcoal px-4 py-3 text-sm hover:border-gold hover:text-gold"
                  >
                    {o.trackTitle}
                    <span className="mt-0.5 block text-xs text-smoke">{o.releaseTitle}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

export async function generateStaticParams() {
  const entries = await getLyricEntries();
  return entries.map((e) => ({ slug: e.slug }));
}
