import type { Release, ReleaseStatus, Track } from "@/lib/types";

/**
 * The eleven workflow states, in the order a release actually moves through
 * them. This mirrors the CHECK constraint in 0003_music_catalogue.sql — if the
 * two ever disagree, the database wins and the write fails.
 */
export const RELEASE_STATUSES: ReleaseStatus[] = [
  "draft",
  "in-preparation",
  "metadata-review",
  "artwork-review",
  "ready-for-distribution",
  "submitted",
  "processing",
  "scheduled",
  "released",
  "rejected",
  "needs-correction",
];

/**
 * Statuses this site may set from the admin. `submitted`, `processing` and
 * `released` are excluded: those assert that files reached a distributor or
 * that the record went live, and only 0004_distribution.sql can back that claim
 * with a verified API response or a named human confirmation. Choosing them
 * here would be a button that lies.
 */
export const EDITABLE_STATUSES: ReleaseStatus[] = [
  "draft",
  "in-preparation",
  "metadata-review",
  "artwork-review",
  "ready-for-distribution",
  "needs-correction",
  "rejected",
];

/**
 * Once a release is on its way to a distributor its tracks are frozen — the
 * same rule 0003 enforces with `release_is_editable()`. Duplicated here so the
 * form can explain itself instead of showing a database error.
 */
export function isEditableStage(status: ReleaseStatus): boolean {
  return !["submitted", "processing", "released"].includes(status);
}

export const STATUS_LABEL: Record<ReleaseStatus, string> = {
  draft: "Draft",
  "in-preparation": "In preparation",
  "metadata-review": "Metadata review",
  "artwork-review": "Artwork review",
  "ready-for-distribution": "Ready for distribution",
  submitted: "Submitted",
  processing: "Processing",
  scheduled: "Scheduled",
  released: "Released",
  rejected: "Rejected",
  "needs-correction": "Needs correction",
};

export type ReadinessItem = {
  key: string;
  label: string;
  /** What the admin has to do to clear it, shown only when it is not cleared. */
  requirement: string;
  weight: number;
  /** A distributor will bounce the submission without this. */
  blocking: boolean;
  passed: boolean;
  /** The value that was checked, so the admin sees what the site can see. */
  detail: string;
};

export type Readiness = {
  score: number;
  items: ReadinessItem[];
  blockers: ReadinessItem[];
  missing: ReadinessItem[];
  /** True when nothing blocking is missing. Not a claim about the DSPs. */
  clear: boolean;
};

export type DistributorRequirements = {
  name: string;
  requiresIsrc: boolean;
  requiresUpc: boolean;
  supportedTerritories: string[];
};

type Check = {
  key: string;
  label: string;
  requirement: string;
  weight: number;
  blocking: boolean;
  passed: boolean;
  detail: string;
};

/** Type guard as well as a test: a passed check carries its value onward. */
const has = (v: string | null | undefined): v is string =>
  typeof v === "string" && v.trim().length > 0;

/** The value shown for an absent field. Deliberately not "None". */
const ABSENT = "not set";

function everyTrack(
  tracks: Track[],
  read: (t: Track) => boolean,
  describe: (t: Track) => string,
): { passed: boolean; detail: string } {
  if (tracks.length === 0) return { passed: false, detail: "no tracks yet" };
  const failing = tracks.filter((t) => !read(t));
  if (failing.length === 0) {
    return { passed: true, detail: `all ${tracks.length} track(s)` };
  }
  return {
    passed: false,
    detail: `${failing.length} of ${tracks.length} — ${failing
      .slice(0, 3)
      .map(describe)
      .join(", ")}${failing.length > 3 ? ", …" : ""}`,
  };
}

/**
 * Scores a release out of 100 from the fields it actually carries.
 *
 * This is a checklist, not a prediction: it does not know a distributor's
 * current rules beyond the requirements row stored for it, and a score of 100
 * does not mean a submission was accepted. The weights sum to exactly 100 and
 * every item reports the value it read, so a low score is explainable.
 */
export function evaluateReadiness(
  release: Release,
  requirements?: DistributorRequirements,
): Readiness {
  const tracks = release.tracks;
  const lateStage = ["scheduled", "released", "submitted", "processing"].includes(
    release.status,
  );
  const multiTrack = release.releaseType === "album" || release.releaseType === "ep";

  const titleCheck: Check = {
    key: "title",
    label: "Title",
    requirement: "Give the release a title.",
    weight: 4,
    blocking: true,
    passed: has(release.title),
    detail: has(release.title) ? release.title : ABSENT,
  };

  const dateCheck: Check = {
    key: "release-date",
    label: "Release date",
    requirement: "Set the date the record comes out. It is never guessed.",
    weight: 8,
    blocking: lateStage,
    passed: has(release.releaseDate),
    detail: has(release.releaseDate) ? String(release.releaseDate) : ABSENT,
  };

  const artworkCheck: Check = {
    key: "artwork",
    label: "Cover artwork",
    requirement:
      "Upload square cover art (3000×3000 px recommended, 1400 px minimum) and attach it to the release.",
    weight: 10,
    blocking: true,
    passed: has(release.artworkUrl),
    detail: has(release.artworkUrl) ? release.artworkUrl : ABSENT,
  };

  const isrcCheck = everyTrack(
    tracks,
    (t) => has(t.isrc),
    (t) => t.title,
  );
  const durationCheck = everyTrack(
    tracks,
    (t) => typeof t.durationSeconds === "number" && t.durationSeconds > 0,
    (t) => t.title,
  );
  const creditCheck = everyTrack(
    tracks,
    (t) => t.credits.songwriter.length > 0,
    (t) => t.title,
  );

  const items: Check[] = [
    titleCheck,
    {
      key: "slug",
      label: "URL slug",
      requirement: "Set a lowercase hyphenated slug.",
      weight: 2,
      blocking: true,
      passed: has(release.slug),
      detail: has(release.slug) ? `/${release.slug}` : ABSENT,
    },
    {
      key: "release-type",
      label: "Release type",
      requirement: "Choose single, EP, album, mixtape, instrumental or music video.",
      weight: 2,
      blocking: false,
      passed: has(release.releaseType),
      detail: release.releaseType,
    },
    dateCheck,
    {
      key: "genre",
      label: "Primary genre",
      requirement: "Pick the genre shipped to stores.",
      weight: 4,
      blocking: true,
      passed: has(release.genre),
      detail: has(release.genre) ? release.genre : ABSENT,
    },
    {
      key: "language",
      label: "Language",
      requirement: "Set the dominant language of the vocals (Runyankole, Luganda, English…).",
      weight: 1,
      blocking: false,
      passed: has(release.language),
      detail: has(release.language) ? release.language : ABSENT,
    },
    artworkCheck,
    {
      key: "artwork-alt",
      label: "Artwork description",
      requirement: "Describe the cover for screen readers and for the SEO image.",
      weight: 1,
      blocking: false,
      passed: has(release.artworkAlt),
      detail: has(release.artworkAlt) ? release.artworkAlt : ABSENT,
    },
    {
      key: "description",
      label: "Short description",
      requirement: "Write one or two sentences used on the release page and the EPK.",
      weight: 2,
      blocking: false,
      passed: has(release.description),
      detail: has(release.description) ? `${release.description.trim().length} characters` : ABSENT,
    },
    {
      key: "tracks",
      label: "At least one track",
      requirement: "Add the recording(s) included on this release.",
      weight: 6,
      blocking: true,
      passed: tracks.length > 0,
      detail: `${tracks.length} track(s)`,
    },
    {
      key: "track-isrc",
      label: "ISRC on every track",
      requirement:
        "Enter the 12-character ISRC issued for each recording. Distributors reject a submission without it.",
      weight: 14,
      blocking: true,
      passed: isrcCheck.passed,
      detail: isrcCheck.detail,
    },
    {
      key: "track-duration",
      label: "Duration on every track",
      requirement: "Enter each track's length in seconds.",
      weight: 6,
      blocking: false,
      passed: durationCheck.passed,
      detail: durationCheck.detail,
    },
    {
      key: "track-credits",
      label: "Songwriter credit on every track",
      requirement: "List at least one songwriter per track, as registered with the CMO.",
      weight: 8,
      blocking: false,
      passed: creditCheck.passed,
      detail: creditCheck.detail,
    },
    {
      key: "lyrics-cleared",
      label: "Lyric publication rights",
      requirement:
        "Lyrics are stored but not marked cleared — the database rejects this combination. Clear the rights or withdraw the text.",
      weight: 3,
      blocking: true,
      // mapRelease only yields lyrics for rows the CHECK constraint allowed
      // through, so an uncleared lyric can only exist in demo data.
      passed: tracks.every((t) => !t.lyrics || t.lyricsCleared),
      detail: (() => {
        const withLyrics = tracks.filter((t) => has(t.lyrics));
        if (withLyrics.length === 0) return "no lyrics stored";
        return `${withLyrics.filter((t) => t.lyricsCleared).length}/${withLyrics.length} cleared`;
      })(),
    },
    {
      key: "copyright",
      label: "Copyright line",
      requirement: "℗ year + rights holder, exactly as it appears on the record.",
      weight: 5,
      blocking: true,
      passed: has(release.copyright),
      detail: has(release.copyright) ? String(release.copyright) : ABSENT,
    },
    {
      key: "publishing",
      label: "Publishing rights holder",
      requirement: "Name the publisher or administrator for the composition.",
      weight: 4,
      blocking: false,
      passed: has(release.publishing),
      detail: has(release.publishing) ? release.publishing : ABSENT,
    },
    {
      key: "label",
      label: "Label",
      requirement: "Set the label of record — an independent artist name is fine.",
      weight: 3,
      blocking: false,
      passed: has(release.label),
      detail: has(release.label) ? release.label : ABSENT,
    },
    {
      key: "upc",
      label: "UPC / EAN",
      requirement: "Provide the product code for the release.",
      weight: 6,
      blocking: multiTrack,
      passed: has(release.upc),
      detail: has(release.upc) ? String(release.upc) : ABSENT,
    },
    {
      key: "territories",
      label: "Territories",
      requirement: 'List where rights are granted, or "worldwide".',
      weight: 3,
      blocking: false,
      passed: release.territories.length > 0,
      detail:
        release.territories.length > 0 ? release.territories.join(", ") : ABSENT,
    },
    {
      key: "streaming",
      label: "Listening links",
      requirement:
        "Add at least one store link once the record is out, so /listen is not empty.",
      weight: 4,
      blocking: release.status === "released",
      passed: release.streaming.length > 0,
      detail:
        release.streaming.length > 0
          ? release.streaming.map((l) => l.platform).join(", ")
          : ABSENT,
    },
    {
      key: "seo-title",
      label: "SEO title",
      requirement: "Write the title this page should carry in search results.",
      weight: 2,
      blocking: false,
      passed: has(release.seo.title),
      detail: has(release.seo.title) ? String(release.seo.title) : "falls back to generated",
    },
    {
      key: "seo-description",
      label: "SEO description",
      requirement: "Write the 70–160 character summary shown under the result.",
      weight: 2,
      blocking: false,
      passed: has(release.seo.description),
      detail: has(release.seo.description)
        ? `${String(release.seo.description).length} characters`
        : "falls back to generated",
    },
  ];

  if (requirements) {
    if (requirements.requiresIsrc && !isrcCheck.passed) {
      items.push({
        key: "distributor-isrc",
        label: `${requirements.name}: ISRC required`,
        requirement: `${requirements.name} will reject this submission while a track has no ISRC.`,
        weight: 0,
        blocking: true,
        passed: false,
        detail: isrcCheck.detail,
      });
    }
    if (requirements.requiresUpc && !has(release.upc)) {
      items.push({
        key: "distributor-upc",
        label: `${requirements.name}: UPC required`,
        requirement: `${requirements.name} asks for a product code.`,
        weight: 0,
        blocking: true,
        passed: false,
        detail: ABSENT,
      });
    }
    if (requirements.supportedTerritories.length > 0) {
      const outside = release.territories.filter(
        (t) =>
          t.toLowerCase() !== "worldwide" &&
          !requirements.supportedTerritories.includes(t),
      );
      items.push({
        key: "distributor-territories",
        label: `${requirements.name}: territories covered`,
        requirement: `${requirements.name} does not list ${outside.join(", ")}.`,
        weight: 0,
        blocking: outside.length > 0,
        passed: outside.length === 0,
        detail:
          outside.length === 0
            ? release.territories.join(", ") || "none selected"
            : outside.join(", "),
      });
    }
  }

  const scored = items.filter((i) => i.weight > 0);
  const total = scored.reduce((sum, i) => sum + i.weight, 0);
  const earned = scored.reduce((sum, i) => sum + (i.passed ? i.weight : 0), 0);
  const missing = items.filter((i) => !i.passed);

  return {
    score: total === 0 ? 0 : Math.round((earned / total) * 100),
    items,
    missing,
    blockers: missing.filter((i) => i.blocking),
    clear: missing.every((i) => !i.blocking),
  };
}
