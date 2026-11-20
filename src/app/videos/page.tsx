import type { Metadata } from "next";
import Link from "next/link";
import { Play } from "lucide-react";
import { getArtistProfile, getVideos } from "@/lib/content";
import { buildMetadata, CORE_KEYWORDS } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildGraph, videoNode, breadcrumbNode, musicGroupNode, collectionNode } from "@/lib/seo/jsonld";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/DemoNotice";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { data: videos } = await getVideos();
  const onYouTube = videos.some((v) => Boolean(v.youtubeId));

  return buildMetadata({
    title: "Videos — Official Music Videos & Visualisers",
    description: `Official videos, lyric videos, visualisers, freestyles and studio sessions by ${SITE.shortName}, from ${SITE.city}, ${SITE.country}. ${
      onYouTube
        ? "Videos with a recorded YouTube link play from it; the rest say where they are hosted."
        : "Each page shows where the video is hosted, or says when no official link is recorded."
    }`,
    path: "/videos",
    keywords: [...CORE_KEYWORDS, "REX KENNY Official Music Videos", "REX KENNY YouTube"],
  });
}

export default async function VideosPage() {
  const [{ data: videos }, { data: artist }] = await Promise.all([
    getVideos(),
    getArtistProfile(),
  ]);

  return (
    <>
      <JsonLd
        data={buildGraph([
          musicGroupNode(artist),
          videos.map((v) => videoNode(v)),
          collectionNode({
            name: `Videos by ${SITE.shortName}`,
            description: `Official videos, visualisers and studio footage published on ${SITE.shortName}'s site.`,
            path: "/videos",
            items: videos.map((v) => ({ name: v.title, path: `/videos/${v.slug}` })),
          }),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Videos", path: "/videos" },
          ]),
        ])}
      />

      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Videos", path: "/videos" },
        ]}
        title="Videos"
        lede={`Official videos, visualisers and studio footage from ${SITE.shortName}.`}
      />

      <div className="container-page py-14">
        {videos.length === 0 ? (
          <EmptyState
            title="No videos published yet"
            body="New music videos, visualisers and studio sessions will appear here as they are released."
          />
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/videos/${v.slug}`}
                  className="group block overflow-hidden rounded-lg border border-charcoal bg-ink-raised"
                >
                  <span className="relative block aspect-video overflow-hidden bg-charcoal">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        v.thumbnailUrl ??
                        (v.youtubeId
                          ? `https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg`
                          : "/images/placeholder-cover-800.jpg")
                      }
                      alt={v.title}
                      loading="lazy"
                      width={800}
                      height={800}
                      className="rk-video absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink/75 text-gold">
                        <Play size={18} fill="currentColor" />
                      </span>
                    </span>
                  </span>
                  <span className="block p-4">
                    <span className="text-[0.6875rem] uppercase tracking-[0.18em] text-gold">
                      {v.category.replace(/-/g, " ")}
                    </span>
                    <span className="mt-1 block font-semibold group-hover:text-gold">
                      {v.title}
                    </span>
                    {v.releaseDate && (
                      <span className="mt-1 block text-xs text-smoke">{v.releaseDate}</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
