import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getVideoBySlug, getVideoSlugs, getArtistProfile, getReleases } from "@/lib/content";
import { buildMetadata } from "@/lib/seo/metadata";
import { videoMeta } from "@/lib/seo/page-meta";
import { JsonLd } from "@/components/seo/JsonLd";
import { Faq } from "@/components/seo/Faq";
import { videoFaq } from "@/lib/seo/faq";
import { buildGraph, videoNode, musicGroupNode, breadcrumbNode } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";
import { YouTubeEmbed } from "@/components/video/YouTubeEmbed";
import { ShareButton } from "@/components/music/ShareButton";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { data: v } = await getVideoBySlug(slug);
  if (!v) return buildMetadata({ title: "Video not found", path: `/videos/${slug}`, noindex: true });

  return buildMetadata(videoMeta(v));
}

export default async function VideoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [{ data: video }, { data: artist }, { data: releases }] = await Promise.all([
    getVideoBySlug(slug),
    getArtistProfile(),
    getReleases(),
  ]);

  if (!video) notFound();

  const related = video.relatedReleaseSlug
    ? releases.find((r) => r.slug === video.relatedReleaseSlug) ?? null
    : null;

  return (
    <>
      <JsonLd
        data={buildGraph([
          musicGroupNode(artist),
          videoNode(video),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Videos", path: "/videos" },
            { name: video.title, path: `/videos/${video.slug}` },
          ]),
        ])}
      />

      <div className="container-page py-12 md:py-16">
        <nav aria-label="Breadcrumb" className="text-xs text-smoke">
          <Link href="/" className="hover:text-gold">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/videos" className="hover:text-gold">Videos</Link>
          <span className="mx-2">/</span>
          <span aria-current="page" className="text-gold">{video.title}</span>
        </nav>

        <div className="mt-6 aspect-video w-full overflow-hidden rounded-xl border border-charcoal bg-ink-soft">
          {video.youtubeId ? (
            <YouTubeEmbed youTubeId={video.youtubeId} title={video.title} />
          ) : video.externalUrl && /\.(mp4|webm)(\?|#|$)/i.test(video.externalUrl) ? (
            // Direct video files (e.g. the site-videos bucket) play inline;
            // page links to other hosts keep the "watch on the host" button.
            <video
              controls
              preload="metadata"
              src={video.externalUrl}
              className="h-full w-full bg-black"
              aria-label={video.title}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-smoke">
                This video has no embed — it is hosted externally.
              </p>
              {video.externalUrl && (
                <a href={video.externalUrl} rel="noopener noreferrer" className="btn-gold">
                  Watch on the host
                </a>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          <article>
            <p className="eyebrow">{video.category.replace(/-/g, " ")}</p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-black md:text-4xl">
              {video.title}
            </h1>
            <p className="mt-2 text-sm text-smoke">
              {SITE.shortName}
              {video.releaseDate && ` · ${video.releaseDate}`}
            </p>
            <div className="mt-4">
              <ShareButton path={`/videos/${video.slug}`} title={video.title} />
            </div>
            {video.description && (
              <p className="mt-5 leading-relaxed text-mist">{video.description}</p>
            )}
          </article>

          <aside className="space-y-4">
            {related && (
              <div className="rounded-lg border border-charcoal bg-ink-raised p-5">
                <p className="eyebrow">From the release</p>
                <Link
                  href={`/music/${related.slug}`}
                  className="mt-2 block font-semibold hover:text-gold"
                >
                  {related.title}
                </Link>
                <p className="mt-1 text-xs text-smoke">
                  {related.releaseType} · {related.genre}
                </p>
              </div>
            )}
            <Link href="/listen" className="btn-gold w-full">Stream the music</Link>
            <Link href="/videos" className="btn-ghost w-full">All videos</Link>
          </aside>
        </div>

        <Faq
          items={videoFaq(video, related)}
          path={`/videos/${video.slug}`}
          heading={`About “${video.title}”`}
        />
      </div>
    </>
  );
}

export async function generateStaticParams() {
  const slugs = await getVideoSlugs();
  return slugs.map((slug) => ({ slug }));
}
