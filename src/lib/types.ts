export type ReleaseType =
  | "single"
  | "ep"
  | "album"
  | "mixtape"
  | "instrumental"
  | "music-video";

export type ReleaseStatus =
  | "draft"
  | "in-preparation"
  | "metadata-review"
  | "artwork-review"
  | "ready-for-distribution"
  | "submitted"
  | "processing"
  | "scheduled"
  | "released"
  | "rejected"
  | "needs-correction";

export type StreamPlatform =
  | "spotify"
  | "apple-music"
  | "youtube-music"
  | "audiomack"
  | "boomplay"
  | "deezer"
  | "amazon-music"
  | "tidal"
  | "youtube";

export interface StreamingLink {
  /** Row id, so the admin can remove one link without guessing by URL. */
  id: string;
  platform: StreamPlatform;
  url: string;
}

export interface Track {
  id: string;
  title: string;
  slug: string;
  durationSeconds: number | null;
  trackNumber: number;
  isrc: string | null;
  explicit: boolean;
  /** Public preview only. Masters never live in a public bucket. */
  previewUrl: string | null;
  lyrics: string | null;
  /**
   * Publication rights for those lyrics. The database refuses lyrics without
   * this flag, and the lyric pages only publish with it.
   */
  lyricsCleared: boolean;
  credits: {
    songwriter: string[];
    composer: string[];
    producer: string[];
  };
}

export interface Release {
  id: string;
  slug: string;
  title: string;
  releaseType: ReleaseType;
  status: ReleaseStatus;
  /** ISO date. Null means the admin has not confirmed it — never invented. */
  releaseDate: string | null;
  genre: string;
  subgenre: string | null;
  language: string | null;
  description: string | null;
  artworkUrl: string | null;
  artworkAlt: string;
  featuredArtists: string[];
  label: string | null;
  isrc: string | null;
  upc: string | null;
  copyright: string | null;
  publishing: string | null;
  territories: string[];
  videoUrl: string | null;
  /**
   * The last readiness score an admin recorded from the release manager, plus
   * when. Null means nobody has ever evaluated this release, which the UI says
   * instead of showing 0%.
   */
  readinessScore: number | null;
  readinessEvaluatedAt: string | null;
  streaming: StreamingLink[];
  /** From the `artists(slug,name)` embed; null when the query omitted it. */
  artistName: string | null;
  tracks: Track[];
  seo: SeoFields;
  createdAt: string;
  updatedAt: string;
}

export interface SeoFields {
  title: string | null;
  description: string | null;
  canonical: string | null;
  ogImage: string | null;
  noindex: boolean;
}

export interface MusicVideo {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category:
    | "official-video"
    | "lyric-video"
    | "visualizer"
    | "freestyle"
    | "studio-session"
    | "behind-the-scenes"
    | "dance-challenge"
    | "interview";
  youtubeId: string | null;
  externalUrl: string | null;
  thumbnailUrl: string | null;
  releaseDate: string | null;
  relatedReleaseSlug: string | null;
  durationSeconds: number | null;
  /** The row's own updated_at — the sitemap's lastMod depends on it being real. */
  updatedAt: string | null;
  seo: SeoFields;
}

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  /** Sanitised HTML produced by the admin rich-text editor. */
  bodyHtml: string;
  category: string;
  coverImage: string | null;
  coverAlt: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  status: "draft" | "scheduled" | "published";
  authorName: string;
  readingMinutes: number;
  seo: SeoFields;
}

export interface Beat {
  id: string;
  slug: string;
  title: string;
  bpm: number | null;
  musicalKey: string | null;
  genre: string;
  description: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
  licensingOptions: { name: string; priceUsd: number | null; terms: string }[];
  published: boolean;
}

export interface ArtistProfileData {
  name: string;
  legalName: string | null;
  slug: string;
  bioShort: string;
  bioMedium: string;
  bioLong: string;
  city: string;
  country: string;
  genres: string[];
  instruments: string[];
  influences: string[];
  mission: string;
  photoUrl: string | null;
  photoAlt: string;
  socials: { platform: string; url: string }[];
  streaming: StreamingLink[];
  bookingEmail: string | null;
  pressEmail: string | null;
}

export type FanFavourite = { releaseId: string; addedAt: string };
export type ContactKind =
  | "booking"
  | "event-appearance"
  | "collaboration"
  | "production"
  | "beat-licence"
  | "press"
  | "business";
