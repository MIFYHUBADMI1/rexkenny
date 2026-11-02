import { SITE } from "@/lib/site";
import { PLATFORM_LABEL } from "@/lib/admin/options";
import type {
  BlogPost,
  MusicVideo,
  Release,
  StreamingLink,
} from "@/lib/types";
import type { LyricEntry } from "@/lib/content";

/**
 * The copy rules behind every generated search snippet, in one place.
 *
 * Pages build their metadata from these, and the admin SEO audit reads the same
 * functions, so the number on the screen is what the page will actually emit.
 * A duplicated fallback would let the audit and the site drift apart — which is
 * exactly how a dashboard ends up reporting tags that no crawler ever sees.
 */
export type MetaInput = {
  title: string;
  description: string;
  path: string;
  canonical: string | null;
  image: string | null;
  imageAlt: string;
  type?: "website" | "article" | "profile";
  keywords?: string[];
  publishedTime?: string | null;
  modifiedTime?: string | null;
  noindex: boolean;
};

export const TYPE_LABEL: Record<string, string> = {
  single: "Song",
  ep: "EP",
  album: "Album",
  mixtape: "Mixtape",
  instrumental: "Instrumental",
  "music-video": "Music video",
};

/**
 * The services this site actually holds a link for. Anything a snippet claims
 * beyond this list is a promise about a store nobody has told us about, so
 * every availability sentence is built from here.
 */
export function recordedPlatforms(...links: StreamingLink[][]): string[] {
  return [
    ...new Set(
      links
        .flat()
        .map((l) => PLATFORM_LABEL[l.platform] ?? l.platform.replace(/-/g, " ")),
    ),
  ];
}

export function releaseMeta(r: Release): MetaInput {
  const typeLabel = TYPE_LABEL[r.releaseType] ?? r.releaseType.replace(/-/g, " ");
  const year = r.releaseDate ? r.releaseDate.slice(0, 4) : null;
  const platforms = recordedPlatforms(r.streaming);
  const where =
    platforms.length > 0
      ? `Listen on ${platforms.join(", ")}.`
      : `Available from ${SITE.shortName}.`;

  return {
    // The root layout appends "| REX KENNY", so the page title must not repeat
    // the artist name or every result shows it twice.
    title: r.seo.title ?? `${r.title} — ${typeLabel}`,
    description:
      r.seo.description ??
      `${r.title} by ${SITE.shortName} (${r.genre}${year ? `, ${year}` : ""}). ${where}`,
    path: `/music/${r.slug}`,
    canonical: r.seo.canonical,
    image: r.seo.ogImage ?? r.artworkUrl,
    imageAlt: r.artworkAlt || `${r.title} artwork`,
    publishedTime: r.releaseDate,
    noindex: r.seo.noindex,
  };
}

export function videoMeta(v: MusicVideo): MetaInput {
  const category = v.category.replace(/-/g, " ");
  return {
    title: v.seo.title ?? `${v.title} (${category})`,
    description:
      v.seo.description ??
      `${v.title} by ${SITE.shortName}. ${category} from ${SITE.city}, ${SITE.country}.`,
    path: `/videos/${v.slug}`,
    canonical: v.seo.canonical,
    image: v.seo.ogImage ?? v.thumbnailUrl,
    imageAlt: v.title,
    publishedTime: v.releaseDate,
    noindex: v.seo.noindex,
  };
}

export function postMeta(p: BlogPost): MetaInput {
  return {
    title: p.seo.title ?? p.title,
    description: p.seo.description ?? p.excerpt,
    path: `/news/${p.slug}`,
    canonical: p.seo.canonical,
    image: p.seo.ogImage ?? p.coverImage,
    imageAlt: p.coverAlt ?? p.title,
    type: "article",
    publishedTime: p.publishedAt,
    modifiedTime: p.updatedAt,
    noindex: p.seo.noindex,
  };
}

/**
 * Lyrics are published only when rights are cleared, so a lyric snippet says so
 * and names the writers — the claim is backed by the row's clearance flag, which
 * is what got the page generated at all.
 */
export function lyricMeta(e: LyricEntry): MetaInput {
  return {
    title: `${e.trackTitle} (Lyrics)`,
    description: `Official lyrics for “${e.trackTitle}” by ${SITE.shortName}, from ${e.releaseTitle}. Published with authorisation · written by ${
      e.songwriters.join(", ") || SITE.shortName
    }.`,
    path: `/lyrics/${e.slug}`,
    canonical: null,
    image: null,
    imageAlt: e.trackTitle,
    keywords: [
      `${SITE.shortName} lyrics`,
      `${e.trackTitle} lyrics`,
      `${SITE.artist} songs`,
    ],
    noindex: false,
  };
}
