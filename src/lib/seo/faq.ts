import type { MusicVideo, Release } from "@/lib/types";
import type { LyricEntry } from "@/lib/content";
import { SITE } from "@/lib/site";
import { absoluteUrl } from "@/lib/seo/metadata";
import { PLATFORM_LABEL } from "@/lib/admin/options";

/**
 * Answers published as visible copy and as FAQPage structured data, from the
 * same array — so the markup can never promise something the page does not
 * say. Every answer is built from the record in front of it: where the
 * database holds no value, the answer says so instead of guessing.
 */
export type FaqItem = { question: string; answer: string };

const quoted = (s: string) => `“${s}”`;

function platformNames(r: Release): string {
  return r.streaming.map((s) => PLATFORM_LABEL[s.platform] ?? s.platform).join(", ");
}

function trackCount(r: Release): string {
  const n = r.tracks.length;
  if (n === 0) return "No track listing has been published for";
  return `${n} ${n === 1 ? "track is" : "tracks are"}`;
}

export function releaseFaq(r: Release): FaqItem[] {
  const items: FaqItem[] = [
    {
      question: `When was ${quoted(r.title)} released by ${SITE.shortName}?`,
      answer: r.releaseDate
        ? `${quoted(r.title)} was released on ${r.releaseDate}.`
        : `The release date of ${quoted(r.title)} has not been confirmed, so this page does not state one. It is added here when the date is confirmed.`,
    },
    {
      question: `Where can I listen to ${quoted(r.title)}?`,
      answer:
        r.streaming.length > 0
          ? `${quoted(r.title)} is linked on ${platformNames(r)}. The buttons on this page go to the store pages recorded for this release.`
          : `Official store links for ${quoted(r.title)} have not been added yet, so none are shown. That does not mean the record is unavailable — it means this site has not been told where it is.`,
    },
    {
      question: `What kind of music is ${quoted(r.title)}?`,
      answer: [
        `${quoted(r.title)} is ${r.releaseType} in the ${r.genre} genre`,
        r.subgenre ? `with ${r.subgenre} influences` : "",
        r.language ? `sung in ${r.language}` : "",
      ]
        .filter(Boolean)
        .join(", ")
        .concat("."),
    },
    {
      question: `Who wrote and produced ${quoted(r.title)}?`,
      answer: (() => {
        const songwriters = [
          ...new Set(r.tracks.flatMap((t) => t.credits.songwriter)),
        ];
        const producers = [...new Set(r.tracks.flatMap((t) => t.credits.producer))];
        if (songwriters.length === 0 && producers.length === 0) {
          return `Credits have not been published for ${quoted(r.title)} yet.`;
        }
        return [
          songwriters.length ? `Words by ${songwriters.join(", ")}` : "",
          producers.length ? `Produced by ${producers.join(", ")}` : "",
          r.copyright ? `${r.copyright}` : "",
        ]
          .filter(Boolean)
          .join(". ");
      })(),
    },
    {
      question: `Does this website distribute ${quoted(r.title)} to streaming services?`,
      answer: `No. This is ${SITE.shortName}'s official website: it publishes the music, the metadata and the links. Delivery to stores is handled by the distributor and label named on the record${
        r.label ? ` (${r.label})` : ""
      }, and this page only lists destinations that have actually been recorded for ${quoted(
        r.title,
      )}.`,
    },
  ];

  if (r.tracks.length > 1) {
    items.splice(2, 0, {
      question: `How many songs are on ${quoted(r.title)}?`,
      answer: `${trackCount(r)} listed on this page: ${r.tracks
        .map((t) => t.title)
        .join(", ")}.`,
    });
  }

  return items;
}

export function lyricFaq(entry: LyricEntry): FaqItem[] {
  return [
    {
      question: `Why are the lyrics to ${quoted(entry.trackTitle)} published here?`,
      answer: `They are published with the rights holder's permission, which is recorded for every lyric this site carries. ${SITE.shortName} controls the words to this song${
        entry.songwriters.length > 0 ? ` and the writers are credited as ${entry.songwriters.join(", ")}` : ""
      }.`,
    },
    {
      question: `Can I copy the lyrics to ${quoted(entry.trackTitle)} onto my own site?`,
      answer:
        "No. Reproducing these lyrics elsewhere without written consent from the rights holder is not permitted. Linking to this page is always fine.",
    },
    {
      question: `Which recording does this lyric belong to?`,
      answer: `${quoted(entry.trackTitle)} appears on ${quoted(entry.releaseTitle)}${
        entry.releaseDate ? `, released ${entry.releaseDate}` : ""
      }.`,
    },
  ];
}

export function videoFaq(v: MusicVideo, related: Release | null = null): FaqItem[] {
  return [
    {
      question: `Where can I watch ${quoted(v.title)}?`,
      answer: v.externalUrl
        ? `${quoted(v.title)} is published at ${v.externalUrl}. The player on this page loads the same official video.`
        : `An official link for ${quoted(v.title)} has not been recorded yet, so this page shows the information it has rather than guessing a destination.`,
    },
    {
      question: `Is ${quoted(v.title)} connected to a release?`,
      answer: related
        ? `Yes — it is the video for ${quoted(related.title)}, listed at ${absoluteUrl(
            `/music/${related.slug}`,
          )}.`
        : v.relatedReleaseSlug
          ? `This video points at the release /music/${v.relatedReleaseSlug}, but that record is not published, so no details are claimed here.`
          : `This video is not linked to a release record on this site, so no connection is claimed.`,
    },
  ];
}

export function lyricIndexFaq(count: number): FaqItem[] {
  return [
    {
      question: `Why are some ${SITE.shortName} songs missing from this list?`,
      answer:
        count === 0
          ? "No lyrics have been authorised for publication yet, so the list is empty rather than partial. Each song appears here once its writer or rights holder authorises it."
          : `Only songs whose publication rights are recorded are listed — ${count} ${count === 1 ? "song is" : "songs are"} published here now. A missing song means permission has not been given for this site to carry the words, not that the song does not exist.`,
    },
    {
      question: "Are these lyrics taken from a lyric database?",
      answer: `No. Every lyric on this site is supplied through ${SITE.shortName}'s own catalogue and stored with its writer credits. Nothing is scraped from a third-party lyric service.`,
    },
    {
      question: "Can I link to a lyric page?",
      answer:
        "Yes — linking is always permitted, and the pages are built to be shared. Copying the text onto another site needs written consent from the rights holder.",
    },
  ];
}

export function listenFaq(release: Release | null): FaqItem[] {
  return [
    {
      question: release
        ? `How do I play ${quoted(release.title)} in my app?`
        : `How do I choose where to stream ${SITE.shortName}?`,
      answer: release
        ? `Pick the service you already use from the buttons on this page. Each one goes to the store page recorded for ${quoted(
            release.title,
          )}.${
            release.streaming.length === 0
              ? " No store links have been recorded for this release yet, so the artist-wide destinations are shown instead."
              : ""
          }`
        : `Pick the platform you already use. The list shows only the destinations recorded on ${SITE.shortName}'s catalogue — a service is never listed here because it seems likely to carry the music.`,
    },
    {
      question: "Why is a store missing from the list?",
      answer: `Because no link for it has been recorded. When a release goes onto a new service, that service is added to its page and appears here. Until then this site says nothing about availability, rather than assuming.`,
    },
    {
      question: "Do these links add tracking or affiliate codes?",
      answer: `No. Each button goes to the destination exactly as it is stored for the release, on the store's own domain. Nothing is routed through a third-party link shortener.`,
    },
  ];
}
