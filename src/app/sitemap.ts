import type { MetadataRoute } from "next";
import { env } from "@/lib/config";
import {
  getLyricEntries,
  getPosts,
  getReleases,
  getVideos,
} from "@/lib/content";

const base = env.siteUrl.replace(/\/$/, "");

/**
 * The URL list is whatever the database says right now, so a redeploy must not
 * freeze it: a release published an hour after the build would stay invisible
 * to crawlers until the next deploy.
 */
export const dynamic = "force-dynamic";

/**
 * Google caps a sitemap at 50,000 URLs; one file is correct at this scale and
 * keeps the crawl path simple.
 *
 * Two rules hold here. A URL is listed only if the page will answer with that
 * record — the same helpers the pages read, with the same filters — and
 * lastMod is the row's own updated_at, never the moment this file was built,
 * because a crawler that is told everything changed today learns to stop
 * believing the dates.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const today = new Date();

  const statics: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: today, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/music`, lastModified: today, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/artist/rex-kenny`, lastModified: today, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/videos`, lastModified: today, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/about`, lastModified: today, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/lyrics`, lastModified: today, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/news`, lastModified: today, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/epk`, lastModified: today, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/contact`, lastModified: today, changeFrequency: "yearly", priority: 0.6 },
    { url: `${base}/beats`, lastModified: today, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/listen`, lastModified: today, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/privacy-policy`, lastModified: today, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms-of-service`, lastModified: today, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/cookie-policy`, lastModified: today, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/copyright-policy`, lastModified: today, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/licensing`, lastModified: today, changeFrequency: "yearly", priority: 0.3 },
  ];

  const [{ data: releases }, { data: videos }, { data: posts }, lyrics] =
    await Promise.all([getReleases(), getVideos(), getPosts(), getLyricEntries()]);

  /** An unrecorded date falls back to today rather than to a made-up 1970. */
  const date = (iso: string | null) =>
    iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso) : today;

  return [
    ...statics,
    // The same rule the release page applies to itself: only a released,
    // indexable record belongs in the sitemap, otherwise a draft is listed here
    // and answers with a noindex tag.
    ...releases
      .filter((r) => r.status === "released" && !r.seo.noindex)
      .map((r) => ({
        url: `${base}/music/${r.slug}`,
        lastModified: date(r.updatedAt),
        changeFrequency: "monthly" as const,
        priority: 0.9,
      })),
    ...videos
      .filter((v) => !v.seo.noindex)
      .map((v) => ({
        url: `${base}/videos/${v.slug}`,
        lastModified: date(v.updatedAt),
        changeFrequency: "monthly" as const,
        priority: 0.7,
      })),
    ...posts
      .filter((p) => !p.seo.noindex)
      .map((p) => ({
        url: `${base}/news/${p.slug}`,
        lastModified: date(p.updatedAt),
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    // Cleared lyrics only: getLyricEntries skips anything without recorded
    // publication rights, so no listed URL 404s for a rights decision.
    ...lyrics.map((e) => ({
      url: `${base}/lyrics/${e.slug}`,
      lastModified: e.releaseDate ? date(e.releaseDate) : today,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
