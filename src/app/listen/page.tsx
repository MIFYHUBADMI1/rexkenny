import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getArtistProfile, getReleases } from "@/lib/content";
import { buildMetadata, CORE_KEYWORDS } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { Faq } from "@/components/seo/Faq";
import { listenFaq } from "@/lib/seo/faq";
import { recordedPlatforms } from "@/lib/seo/page-meta";
import { buildGraph, musicGroupNode, breadcrumbNode } from "@/lib/seo/jsonld";
import { SmartLinkGrid } from "@/components/music/SmartLinkGrid";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return listenMeta();
}

/**
 * The snippet may only name stores this site actually holds a link for. A
 * description that listed Spotify and Boomplay because they are likely to carry
 * the music would be the same false availability claim as a dead button.
 */
async function listenMeta(): Promise<Metadata> {
  const [{ data: artist }, { data: releases }] = await Promise.all([
    getArtistProfile(),
    getReleases(),
  ]);
  const platforms = recordedPlatforms(
    artist.streaming,
    ...releases.map((r) => r.streaming),
  );

  return buildMetadata({
    title: "Listen — All Streaming Destinations",
    description:
      platforms.length > 0
        ? `Choose where to stream ${SITE.shortName}: ${platforms.join(", ")}. Every destination on this page is a link recorded for a release or for the artist profile.`
        : `Streaming destinations for ${SITE.shortName}. A service appears here only once its link has been recorded — nothing is listed on assumption.`,
    path: "/listen",
    keywords: [
      ...CORE_KEYWORDS,
      ...platforms.map((p) => `REX KENNY on ${p}`),
    ],
  });
}

/**
 * Open-redirect guard: `?to=` is only honoured for the streaming hosts we
 * publish. Anything else falls through to the picker instead of bouncing
 * a visitor off-site — a link on our domain must never become a phishing hop.
 */
const ALLOWED_HOSTS = [
  "open.spotify.com",
  "music.apple.com",
  "apps.apple.com",
  "music.youtube.com",
  "youtube.com",
  "www.youtube.com",
  "audiomack.com",
  "playaudiomack.com",
  "boomplay.com",
  "www.boomplay.com",
  "deezer.com",
  "www.deezer.com",
  "music.amazon.com",
  "music.amazon.co.uk",
  "tidal.com",
  "www.tidal.com",
  "soundcloud.com",
  "www.soundcloud.com",
];

function isSafeTarget(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return (u.protocol === "https:" || u.protocol === "http:") &&
      ALLOWED_HOSTS.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export default async function ListenPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; release?: string }>;
}) {
  const params = await searchParams;
  const { data: artist } = await getArtistProfile();
  const { data: releases } = await getReleases();

  if (isSafeTarget(params.to)) redirect(params.to as string);

  const release = params.release
    ? releases.find((r) => r.slug === params.release) ?? null
    : null;

  const destinations = release && release.streaming.length > 0
    ? release.streaming
    : artist.streaming;

  return (
    <>
      <JsonLd
        data={buildGraph([
          musicGroupNode(artist),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Listen", path: "/listen" },
          ]),
        ])}
      />

      <div className="container-page py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Smart link</p>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-black md:text-5xl">
            {release ? release.title : `Stream ${SITE.shortName}`}
          </h1>
          <p className="mt-4 leading-relaxed text-smoke">
            {release
              ? `Pick the app you already use to play “${release.title}”.`
              : `Pick your platform — ${SITE.shortName}'s catalogue is available on these services.`}
          </p>

          <div className="mt-10">
            <SmartLinkGrid
              destinations={destinations}
              releaseSlug={release?.slug ?? null}
            />
          </div>

          <div className="mx-auto mt-14 max-w-2xl text-left">
            <Faq
              items={listenFaq(release)}
              path="/listen"
              heading="How these links work"
            />
          </div>
        </div>
      </div>
    </>
  );
}
