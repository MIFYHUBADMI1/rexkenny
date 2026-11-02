import type { Release } from "@/lib/types";
import { STATUS_LABEL, evaluateReadiness } from "@/lib/admin/readiness";

/**
 * Metadata exports for manual distributor uploads.
 *
 * These files describe the release the way this site's database describes it.
 * They are not a DDEX ERN and are not evidence of delivery: producing a real
 * ERN requires the distributor's schema and their acceptance response, neither
 * of which exists here. The generated header says exactly that, so a file on a
 * disk cannot be mistaken for a submission receipt.
 */

export type ExportFormat = "json" | "csv";

export type ExportBundle = {
  filename: string;
  contentType: string;
  body: string;
};

const clean = (v: string | null | undefined): string =>
  typeof v === "string" ? v.trim() : "";

/** RFC 4180 escaping: quote when needed, double embedded quotes, no raw newlines. */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s === "") return "";
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

function isoDateOnly(value: string | null): string {
  if (!value) return "";
  // Postgres sends `2026-04-01` for a date column and a full timestamp for
  // timestamptz; a distributor sheet wants the plain calendar date.
  return value.slice(0, 10);
}

export function releaseToJson(
  release: Release,
  generatedAt: string,
): ExportBundle {
  const readiness = evaluateReadiness(release);
  const payload = {
    document: "rex-kenny-music/release-metadata",
    document_version: 1,
    generated_at: generatedAt,
    provenance: {
      source: "REX KENNY MUSIC admin database",
      // Every field is a value the artist entered. Nothing here is inferred,
      // estimated or supplied by a third party.
      fabricated_fields: [],
      delivery_claim:
        "This file is metadata for upload. It does not indicate that anything has been sent to or accepted by a store.",
      readiness_score: readiness.score,
      blocking_items: readiness.blockers.map((b) => b.label),
    },
    release: {
      slug: release.slug,
      title: release.title,
      type: release.releaseType,
      status: release.status,
      status_label: STATUS_LABEL[release.status],
      release_date: isoDateOnly(release.releaseDate),
      genre: release.genre,
      subgenre: clean(release.subgenre),
      language: clean(release.language),
      description: clean(release.description),
      label: clean(release.label),
      featured_artists: release.featuredArtists,
      identifiers: {
        isrc: clean(release.isrc),
        upc: clean(release.upc),
      },
      rights: {
        copyright: clean(release.copyright),
        publishing: clean(release.publishing),
      },
      territories: release.territories,
      artwork: {
        url: clean(release.artworkUrl),
        alt: clean(release.artworkAlt),
      },
      links: {
        video: clean(release.videoUrl),
        streaming: release.streaming.map((l) => ({
          platform: l.platform,
          url: l.url,
        })),
      },
      tracks: release.tracks.map((t) => ({
        track_number: t.trackNumber,
        title: t.title,
        slug: t.slug,
        isrc: clean(t.isrc),
        duration_seconds: t.durationSeconds,
        explicit: t.explicit,
        preview_url: clean(t.previewUrl),
        lyrics_published: Boolean(t.lyrics && t.lyricsCleared),
        credits: {
          songwriters: t.credits.songwriter,
          composers: t.credits.composer,
          producers: t.credits.producer,
        },
      })),
      search: {
        seo_title: clean(release.seo.title),
        seo_description: clean(release.seo.description),
        canonical: clean(release.seo.canonical),
        og_image: clean(release.seo.ogImage),
        noindex: release.seo.noindex,
      },
    },
  };

  return {
    filename: `${release.slug}-metadata.json`,
    contentType: "application/json; charset=utf-8",
    body: `${JSON.stringify(payload, null, 2)}\n`,
  };
}

const COLUMNS = [
  "Release title",
  "Release type",
  "Release status",
  "Release date",
  "Track number",
  "Track title",
  "Track ISRC",
  "Duration (seconds)",
  "Explicit",
  "Songwriters",
  "Composers",
  "Producers",
  "Genre",
  "Language",
  "Label",
  "UPC/EAN",
  "℗ Copyright",
  "Publishing",
  "Territories",
] as const;

export function releaseToCsv(release: Release): ExportBundle {
  const rows: string[] = [];
  // A comment line is not valid RFC 4180 data, so the provenance travels in a
  // named column instead of a header comment that would confuse an importer.
  rows.push(csvRow([...COLUMNS, "Export note"]));
  const note =
    "Metadata prepared in the REX KENNY MUSIC admin. Not submitted or delivered to any store.";

  for (const t of release.tracks) {
    rows.push(
      csvRow([
        release.title,
        release.releaseType,
        release.status,
        isoDateOnly(release.releaseDate),
        t.trackNumber,
        t.title,
        clean(t.isrc),
        t.durationSeconds ?? "",
        t.explicit ? "true" : "false",
        t.credits.songwriter.join(" | "),
        t.credits.composer.join(" | "),
        t.credits.producer.join(" | "),
        release.genre,
        clean(release.language),
        clean(release.label),
        clean(release.upc),
        clean(release.copyright),
        clean(release.publishing),
        release.territories.join(" | "),
        note,
      ]),
    );
  }

  if (release.tracks.length === 0) {
    rows.push(
      csvRow([
        release.title,
        release.releaseType,
        release.status,
        isoDateOnly(release.releaseDate),
        "",
        "NO TRACKS ON THIS RELEASE",
        "",
        "",
        "",
        "",
        "",
        "",
        release.genre,
        clean(release.language),
        clean(release.label),
        clean(release.upc),
        clean(release.copyright),
        clean(release.publishing),
        release.territories.join(" | "),
        note,
      ]),
    );
  }

  return {
    filename: `${release.slug}-metadata.csv`,
    contentType: "text/csv; charset=utf-8",
    // Excel on Windows misreads UTF-8 without this marker.
    body: `\uFEFF${rows.join("\r\n")}\r\n`,
  };
}

export function buildExport(
  release: Release,
  format: ExportFormat,
  generatedAt: string,
): ExportBundle {
  return format === "csv" ? releaseToCsv(release) : releaseToJson(release, generatedAt);
}
