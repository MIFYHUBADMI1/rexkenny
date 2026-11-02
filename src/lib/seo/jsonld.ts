import type { BlogPost, MusicVideo, Release, ArtistProfileData } from "@/lib/types";
import { SITE, absoluteUrl } from "@/lib/seo/metadata";

type Obj = Record<string, unknown>;

const id = (path: string) => `${absoluteUrl(path)}#entity`;

export function websiteNode(): Obj {
  return {
    "@type": "WebSite",
    "@id": id("/"),
    url: absoluteUrl("/"),
    name: SITE.name,
    description: SITE.description,
    inLanguage: "en",
    publisher: { "@id": id("/#organization") },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: absoluteUrl(`/music?q={searchTermString}`) },
      "query-input": "required name=searchTermString",
    },
  };
}

export function organizationNode(): Obj {
  return {
    "@type": "Organization",
    "@id": id("/#organization"),
    name: SITE.name,
    url: absoluteUrl("/"),
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/icon-512.png"),
      width: 512,
      height: 512,
      caption: SITE.shortName,
    },
    description: "Independent music label and publishing operation run by REX KENNY.",
    foundingLocation: { "@type": "Place", name: SITE.city, addressCountry: "UG" },
    sameAs: [],
  };
}

export function personNode(p: ArtistProfileData): Obj {
  return {
    "@type": "Person",
    "@id": id("/artist/rex-kenny#person"),
    name: p.name,
    alternateName: p.legalName ?? undefined,
    url: absoluteUrl("/artist/rex-kenny"),
    image: p.photoUrl ? absoluteUrl(p.photoUrl) : undefined,
    description: p.bioShort,
    jobTitle: "African Dancehall Artist, Singer, Songwriter, Producer",
    genre: p.genres,
    nationality: { "@type": "Country", name: p.country },
    birthPlace: { "@type": "Place", name: p.city, addressCountry: p.country },
    address: {
      "@type": "PostalAddress",
      addressLocality: p.city,
      addressCountry: p.country,
    },
    sameAs: p.socials.map((s) => s.url).filter(Boolean),
    performsAs: p.genres.map((g) => ({ "@type": "Role", roleName: g })),
    link: [
      { "@type": "MusicGroup", "@id": id("/#artist") },
    ],
  };
}

/**
 * MusicGroup is legitimate for a solo artist project on Schema.org
 * (a musical artist/band entity); it is labelled as a solo project in the copy.
 */
export function musicGroupNode(p: ArtistProfileData): Obj {
  return {
    "@type": "MusicGroup",
    "@id": id("/#artist"),
    name: p.name,
    url: absoluteUrl("/artist/rex-kenny"),
    description: p.bioShort,
    genre: p.genres,
    image: p.photoUrl ? absoluteUrl(p.photoUrl) : undefined,
    foundingLocation: { "@type": "Place", name: p.city, addressCountry: p.country },
    areaServed: ["UG", "EA", "Worldwide"],
    sameAs: p.socials.map((s) => s.url).filter(Boolean),
    member: {
      "@type": "Person",
      name: p.name,
      "@id": id("/artist/rex-kenny#person"),
    },
    musicPublishers: [{ "@type": "Organization", name: SITE.name }],
  };
}

export function releaseNode(r: Release): Obj {
  const isSingle = r.releaseType === "single" || r.tracks.length <= 1;
  const recording = r.tracks[0];
  const partOf = r.tracks.map((t) => ({
    "@type": "MusicRecording",
    "@id": id(`/music/${r.slug}#${t.slug}`),
    name: t.title,
    url: absoluteUrl(`/music/${r.slug}`),
    duration: t.durationSeconds ? secondsToIso(t.durationSeconds) : undefined,
    byArtist: { "@id": id("/#artist") },
    isrcCode: t.isrc ?? r.isrc ?? undefined,
    inAlbum: { "@id": id(`/music/${r.slug}#${releaseEntityId(r)}`) },
  }));

  const albumOrSingle: Obj = {
    "@type": isSingle ? "MusicRecording" : "MusicAlbum",
    "@id": id(`/music/${r.slug}#${releaseEntityId(r)}`),
    name: r.title,
    url: absoluteUrl(`/music/${r.slug}`),
    description: r.description ?? undefined,
    ...(r.artworkUrl
      ? {
          image: {
            "@type": "ImageObject",
            url: absoluteUrl(r.artworkUrl),
            caption: r.artworkAlt,
          },
        }
      : {}),
    byArtist: { "@id": id("/#artist") },
    datePublished: r.releaseDate ?? undefined,
    genre: r.genre,
    inLanguage: r.language ?? undefined,
    keywords: [r.genre, r.subgenre, r.releaseType].filter(Boolean).join(", "),
    isFamilyFriendly: !r.tracks.some((t) => t.explicit),
    ...(isSingle && recording
      ? {
          duration: recording.durationSeconds
            ? secondsToIso(recording.durationSeconds)
            : undefined,
          isrcCode: recording.isrc ?? r.isrc ?? undefined,
          track: {
            "@type": "MusicRecording",
            name: recording.title,
            url: absoluteUrl(`/music/${r.slug}`),
          },
        }
      : {
          numTracks: r.tracks.length,
          musicGroupMember: undefined,
          track: { "@type": "ItemList", itemListOrder: "Ascending", itemListElement: r.tracks.map((t, i) => ({ "@type": "ListItem", position: i + 1, item: { "@id": id(`/music/${r.slug}#${t.slug}`) } })) },
        }),
    ...(r.streaming.length
      ? {
          sameAs: r.streaming.map((s) => s.url),
        }
      : {}),
    publisher: r.label
      ? { "@type": "Organization", name: r.label }
      : undefined,
    // A rights holder is only named when the release row names one. Guessing
    // "the artist, presumably" in machine-readable data would be a claim the
    // database does not support.
    copyrightHolder: r.copyright
      ? { "@type": "Organization", name: r.copyright }
      : undefined,
    copyrightYear: r.releaseDate ? r.releaseDate.slice(0, 4) : undefined,
  };

  return {
    "@graph": [
      albumOrSingle,
      ...(isSingle ? [] : partOf),
    ],
  };
}

const releaseEntityId = (r: Release) => (r.releaseType === "single" ? "recording" : "album");

export function videoNode(v: MusicVideo): Obj {
  const thumb =
    v.thumbnailUrl ??
    (v.youtubeId ? `https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg` : undefined);
  return {
    "@type": "VideoObject",
    "@id": id(`/videos/${v.slug}#video`),
    name: v.title,
    description: v.description ?? `${v.title} by ${SITE.shortName}.`,
    thumbnailUrl: thumb ? [absoluteUrl(thumb)] : undefined,
    uploadDate: v.releaseDate ?? undefined,
    duration: v.durationSeconds ? secondsToIso(v.durationSeconds) : undefined,
    contentUrl: v.externalUrl ?? undefined,
    embedUrl: v.youtubeId ? `https://www.youtube.com/embed/${v.youtubeId}` : undefined,
    publisher: { "@id": id("/#organization") },
    ...(v.youtubeId ? { sameAs: `https://www.youtube.com/watch?v=${v.youtubeId}` } : {}),
    inLanguage: "en",
    ...(v.relatedReleaseSlug
      ? {
          partOfSeries: { "@id": id(`/music/${v.relatedReleaseSlug}#album`) },
        }
      : {}),
  };
}

export function articleNode(p: BlogPost, path: string): Obj {
  return {
    "@type": "Article",
    "@id": id(`${path}#article`),
    headline: p.title,
    description: p.excerpt,
    url: absoluteUrl(path),
    image: p.coverImage ? absoluteUrl(p.coverImage) : undefined,
    datePublished: p.publishedAt ?? undefined,
    dateModified: p.updatedAt ?? undefined,
    inLanguage: "en",
    author: { "@type": "Person", name: p.authorName, url: absoluteUrl("/artist/rex-kenny") },
    publisher: { "@id": id("/#organization") },
    mainEntityOfPage: { "@type": "WebPage", "@id": id(path) },
    wordCount: undefined,
  };
}

export interface Crumb {
  name: string;
  path: string;
}

/**
 * FAQPage. Google no longer shows these as rich results for ordinary sites, but
 * answer engines and other crawlers read the markup, which is why the answers
 * are also rendered as visible text by the Faq component.
 */
export function faqNode(
  items: { question: string; answer: string }[],
  path: string,
): Obj {
  return {
    "@type": "FAQPage",
    "@id": id(`${path}#faq`),
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

/**
 * A listing page: the visible list and the machine-readable list are built from
 * the same array, so a crawler cannot be shown entries the page does not show.
 */
export function collectionNode(
  opts: { name: string; description: string; path: string; items: { name: string; path: string }[] },
): Obj {
  return {
    "@type": "CollectionPage",
    "@id": id(opts.path),
    name: opts.name,
    description: opts.description,
    url: absoluteUrl(opts.path),
    isPartOf: { "@id": id("/") },
    publisher: { "@id": id("/#organization") },
    mainEntity: {
      "@type": "ItemList",
      name: opts.name,
      numberOfItems: opts.items.length,
      itemListOrder: "Ascending",
      itemListElement: opts.items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: absoluteUrl(item.path),
        name: item.name,
      })),
    },
  };
}

/**
 * A page that is neither a list nor a work about the music: legal text, guides,
 * any long-form document. It only repeats what the HTML already says — name,
 * summary, the date the document claims to be current — and is what lets the
 * legal pages be understood as part of this site instead of loose URLs.
 */
export function webPageNode(opts: {
  name: string;
  description: string;
  path: string;
  updated?: string | null;
}): Obj {
  return {
    "@type": "WebPage",
    "@id": id(opts.path),
    url: absoluteUrl(opts.path),
    name: opts.name,
    description: opts.description,
    inLanguage: "en",
    isPartOf: { "@id": id("/") },
    publisher: { "@id": id("/#organization") },
    ...(opts.updated && !Number.isNaN(Date.parse(opts.updated))
      ? { dateModified: opts.updated }
      : {}),
  };
}

export function breadcrumbNode(crumbs: Crumb[]): Obj {
  return {
    "@type": "BreadcrumbList",
    "@id": id("/#breadcrumbs"),
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

/** Wraps nodes in one @graph with the site + org anchors defined once. */
export function buildGraph(nodes: unknown[]): Obj {
  const graph: unknown[] = [websiteNode(), organizationNode()];
  for (const n of nodes) {
    if (Array.isArray(n)) graph.push(...n);
    else graph.push(n);
  }
  return {
    "@context": "https://schema.org",
    "@graph": graph.filter(Boolean),
  };
}

export function secondsToIso(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || !(h || m) ? `${s}S` : ""}`;
}
