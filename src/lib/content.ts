import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  demoArtist,
  demoBeats,
  demoPosts,
  demoReleases,
  demoVideos,
} from "@/lib/demo-content";
import type {
  ArtistProfileData,
  Beat,
  BlogPost,
  MusicVideo,
  Release,
} from "@/lib/types";

export type Source = "supabase" | "demo";
export type WithSource<T> = { data: T; source: Source };

/** Shape returned to pages so the UI can label demo content honestly. */
export async function getReleases(): Promise<WithSource<Release[]>> {
  const sb = await createSupabaseServerClient();
  if (!sb) return { data: demoReleases, source: "demo" };
  const { data, error } = await sb
    .from("releases")
    .select("*, tracks(*), streaming_links(*), artists(slug,name)")
    .eq("status", "released")
    .order("release_date", { ascending: false });
  if (error || !data) return { data: [], source: "supabase" };
  return { data: data.map(mapRelease), source: "supabase" };
}

export async function getReleaseBySlug(
  slug: string,
): Promise<WithSource<Release | null>> {
  const sb = await createSupabaseServerClient();
  if (!sb) {
    const hit = demoReleases.find((r) => r.slug === slug) ?? null;
    return { data: hit, source: "demo" };
  }
  const { data, error } = await sb
    .from("releases")
    .select("*, tracks(*), streaming_links(*), artists(slug,name)")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return { data: null, source: "supabase" };
  return { data: mapRelease(data), source: "supabase" };
}

export async function getArtistProfile(): Promise<WithSource<ArtistProfileData>> {
  const sb = await createSupabaseServerClient();
  if (!sb) return { data: demoArtist, source: "demo" };
  const { data, error } = await sb
    .from("artist_profiles")
    .select("*, artist_social_links(*), streaming_links(*)")
    .eq("slug", "rex-kenny")
    .maybeSingle();
  if (error || !data) return { data: demoArtist, source: "supabase" };
  return { data: mapArtist(data), source: "supabase" };
}

export async function getVideos(): Promise<WithSource<MusicVideo[]>> {
  const sb = await createSupabaseServerClient();
  if (!sb) return { data: demoVideos, source: "demo" };
  const { data, error } = await sb
    .from("music_videos")
    .select("*")
    .eq("published", true)
    .order("release_date", { ascending: false });
  if (error || !data) return { data: [], source: "supabase" };
  return { data: data.map(mapVideo), source: "supabase" };
}

export async function getPosts(): Promise<WithSource<BlogPost[]>> {
  const sb = await createSupabaseServerClient();
  if (!sb) return { data: demoPosts, source: "demo" };
  const { data, error } = await sb
    .from("blog_posts")
    .select("*")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error || !data) return { data: [], source: "supabase" };
  return { data: data.map(mapPost), source: "supabase" };
}

/** Route generation for sitemaps and generateStaticParams. */
export const getReleaseSlugs = cache(async (): Promise<string[]> => {
  const { data } = await getReleases();
  return data.filter((r) => !r.seo.noindex).map((r) => r.slug);
});

export const getVideoSlugs = cache(async (): Promise<string[]> => {
  const { data } = await getVideos();
  return data.filter((v) => !v.seo.noindex).map((v) => v.slug);
});

export const getPostSlugs = cache(async (): Promise<string[]> => {
  const { data } = await getPosts();
  return data.filter((p) => !p.seo.noindex).map((p) => p.slug);
});

export async function getVideoBySlug(
  slug: string,
): Promise<WithSource<MusicVideo | null>> {
  const { data } = await getVideos();
  return { data: data.find((v) => v.slug === slug) ?? null, source: data.length ? "supabase" : "demo" };
}

export async function getPostBySlug(
  slug: string,
): Promise<WithSource<BlogPost | null>> {
  const { data } = await getPosts();
  return { data: data.find((p) => p.slug === slug) ?? null, source: data.length ? "supabase" : "demo" };
}

/** A published lyric, joined to the release it belongs to. */
export type LyricEntry = {
  slug: string;
  trackTitle: string;
  releaseSlug: string;
  releaseTitle: string;
  genre: string;
  language: string | null;
  releaseDate: string | null;
  lyrics: string;
  songwriters: string[];
  producers: string[];
};

export const getLyricEntries = cache(async (): Promise<LyricEntry[]> => {
  const { data: releases } = await getReleases();
  const out: LyricEntry[] = [];
  for (const r of releases) {
    for (const t of r.tracks) {
      // Lyrics reach the public page only when the artist has marked them
      // cleared for publication; the database refuses to store them otherwise.
      if (!t.lyricsCleared) continue;
      if (!t.lyrics || t.lyrics.trim().length === 0) continue;
      out.push({
        slug: `${r.slug}--${t.slug}`,
        trackTitle: t.title,
        releaseSlug: r.slug,
        releaseTitle: r.title,
        genre: r.genre,
        language: r.language,
        releaseDate: r.releaseDate,
        lyrics: t.lyrics,
        songwriters: t.credits.songwriter,
        producers: t.credits.producer,
      });
    }
  }
  return out;
});

export const getLyricBySlug = cache(async (slug: string): Promise<LyricEntry | null> => {
  const entries = await getLyricEntries();
  return entries.find((e) => e.slug === slug) ?? null;
});

export async function getBeats(): Promise<WithSource<Beat[]>> {
  const sb = await createSupabaseServerClient();
  if (!sb) return { data: demoBeats, source: "demo" };
  const { data, error } = await sb
    .from("beats")
    .select("*")
    .eq("published", true)
    .order("created_at", { ascending: false });
  if (error || !data) return { data: [], source: "supabase" };
  return {
    data: data.map((b) => ({
      id: String(b.id),
      slug: String(b.slug),
      title: String(b.title),
      bpm: b.bpm === null ? null : Number(b.bpm),
      musicalKey: (b.musical_key as string | null) ?? null,
      genre: String(b.genre ?? "African Dancehall"),
      description: (b.description as string | null) ?? null,
      artworkUrl: (b.artwork_url as string | null) ?? null,
      previewUrl: (b.preview_url as string | null) ?? null,
      licensingOptions: (b.licensing_options as Beat["licensingOptions"]) ?? [],
      published: Boolean(b.published),
    })),
    source: "supabase",
  };
}

/* ---------- row mappers: snake_case DB -> camelCase domain ---------- */

export type Row = Record<string, unknown>;
const s = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);
const n = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

export function mapRelease(r: Row): Release {
  const links = (r.streaming_links as Row[] | null) ?? [];
  const tracks = (r.tracks as Row[] | null) ?? [];
  return {
    id: s(r.id) ?? "",
    slug: s(r.slug) ?? "",
    title: s(r.title) ?? "",
    releaseType: (s(r.release_type) ?? "single") as Release["releaseType"],
    status: (s(r.status) ?? "draft") as Release["status"],
    releaseDate: s(r.release_date),
    genre: s(r.genre) ?? "African Dancehall",
    subgenre: s(r.subgenre),
    language: s(r.language),
    description: s(r.description),
    artworkUrl: s(r.artwork_url),
    artworkAlt: s(r.artwork_alt) ?? `${s(r.title) ?? "Release"} artwork`,
    featuredArtists: Array.isArray(r.featured_artists)
      ? (r.featured_artists as string[])
      : [],
    label: s(r.label),
    isrc: s(r.isrc),
    upc: s(r.upc),
    copyright: s(r.copyright),
    publishing: s(r.publishing),
    territories: Array.isArray(r.territories) ? (r.territories as string[]) : [],
    videoUrl: s(r.video_url),
    readinessScore: n(r.readiness_score),
    readinessEvaluatedAt: s(r.readiness_evaluated_at),
    artistName: (() => {
      // `artists(slug,name)` resolves through releases.artist_id, a plain
      // many-to-one, so PostgREST returns an object rather than an array.
      // Null when the query did not embed the artist at all.
      const artist = r.artists as Row | null;
      return artist ? s(artist.name) : null;
    })(),
    streaming: links.map((l) => ({
      id: s(l.id) ?? "",
      platform: s(l.platform) as Release["streaming"][number]["platform"],
      url: s(l.url) ?? "",
    })),
    tracks: tracks.map((t) => ({
      id: s(t.id) ?? "",
      title: s(t.title) ?? "",
      slug: s(t.slug) ?? "",
      durationSeconds: n(t.duration_seconds),
      trackNumber: n(t.track_number) ?? 0,
      isrc: s(t.isrc),
      explicit: Boolean(t.explicit),
      previewUrl: s(t.preview_url),
      lyrics: s(t.lyrics),
      lyricsCleared: Boolean(t.lyrics_cleared),
      credits: {
        songwriter: (t.songwriters as string[]) ?? [],
        composer: (t.composers as string[]) ?? [],
        producer: (t.producers as string[]) ?? [],
      },
    })),
    seo: {
      title: s(r.seo_title),
      description: s(r.seo_description),
      canonical: s(r.canonical_url),
      ogImage: s(r.og_image),
      noindex: Boolean(r.noindex),
    },
    createdAt: s(r.created_at) ?? "",
    updatedAt: s(r.updated_at) ?? "",
  };
}

function mapArtist(r: Row): ArtistProfileData {
  const socials = (r.artist_social_links as Row[] | null) ?? [];
  const links = (r.streaming_links as Row[] | null) ?? [];
  return {
    name: s(r.name) ?? "REX KENNY",
    legalName: s(r.legal_name),
    slug: s(r.slug) ?? "rex-kenny",
    bioShort: s(r.bio_short) ?? "",
    bioMedium: s(r.bio_medium) ?? "",
    bioLong: s(r.bio_long) ?? "",
    city: s(r.city) ?? "Kasese",
    country: s(r.country) ?? "Uganda",
    genres: (r.genres as string[]) ?? [],
    instruments: (r.instruments as string[]) ?? [],
    influences: (r.influences as string[]) ?? [],
    mission: s(r.mission) ?? "",
    photoUrl: s(r.photo_url),
    photoAlt: s(r.photo_alt) ?? "Artist photograph",
    socials: socials.map((x) => ({
      platform: s(x.platform) ?? "",
      url: s(x.url) ?? "",
    })),
    streaming: links.map((l) => ({
      id: s(l.id) ?? "",
      platform: s(l.platform) as ArtistProfileData["streaming"][number]["platform"],
      url: s(l.url) ?? "",
    })),
    bookingEmail: s(r.booking_email),
    pressEmail: s(r.press_email),
  };
}

function mapVideo(r: Row): MusicVideo {
  return {
    id: s(r.id) ?? "",
    slug: s(r.slug) ?? "",
    title: s(r.title) ?? "",
    description: s(r.description),
    category: (s(r.category) ?? "official-video") as MusicVideo["category"],
    youtubeId: s(r.youtube_id),
    externalUrl: s(r.external_url),
    thumbnailUrl: s(r.thumbnail_url),
    releaseDate: s(r.release_date),
    relatedReleaseSlug: s(r.related_release_slug),
    durationSeconds: n(r.duration_seconds),
    updatedAt: s(r.updated_at),
    seo: {
      title: s(r.seo_title),
      description: s(r.seo_description),
      canonical: s(r.canonical_url),
      ogImage: s(r.og_image),
      noindex: Boolean(r.noindex),
    },
  };
}

function mapPost(r: Row): BlogPost {
  return {
    slug: s(r.slug) ?? "",
    title: s(r.title) ?? "",
    excerpt: s(r.excerpt) ?? "",
    bodyHtml: s(r.body_html) ?? "",
    category: s(r.category) ?? "News",
    coverImage: s(r.cover_image),
    coverAlt: s(r.cover_alt),
    publishedAt: s(r.published_at),
    updatedAt: s(r.updated_at),
    status: (s(r.status) ?? "draft") as BlogPost["status"],
    authorName: s(r.author_name) ?? "REX KENNY",
    readingMinutes: n(r.reading_minutes) ?? 1,
    seo: {
      title: s(r.seo_title),
      description: s(r.seo_description),
      canonical: s(r.canonical_url),
      ogImage: s(r.og_image),
      noindex: Boolean(r.noindex),
    },
  };
}
