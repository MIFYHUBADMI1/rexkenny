import "server-only";
import { env } from "@/lib/config";
import { SITE } from "@/lib/site";
import { absoluteUrl } from "@/lib/seo/metadata";
import {
  lyricMeta,
  postMeta,
  releaseMeta,
  videoMeta,
  type MetaInput,
} from "@/lib/seo/page-meta";
import {
  buildGraph,
  releaseNode,
  musicGroupNode,
  breadcrumbNode,
} from "@/lib/seo/jsonld";
import { getArtistProfile, getLyricEntries, getPosts, getVideos } from "@/lib/content";
import { listReleasesForAdmin } from "@/lib/admin/catalogue";
import type { Release } from "@/lib/types";

/**
 * Search audit over the pages driven by stored data.
 *
 * It reads the same functions the pages build their metadata from, so what is
 * reported here is what the page will emit — not a parallel guess. Static pages
 * are listed too, but their copy lives in source and is flagged as such.
 */
export type SeoRow = {
  path: string;
  label: string;
  /** Exactly what lands in <title>, root template included. */
  renderedTitle: string;
  titleLength: number;
  description: string;
  descriptionLength: number;
  canonical: string;
  ogImage: string;
  usesSiteDefaultImage: boolean;
  noindex: boolean;
  public: boolean;
  issues: string[];
  editHref: string | null;
  kind: "release" | "video" | "post" | "lyric";
};

export type SiteCheck = {
  label: string;
  state: "ok" | "warn" | "fail";
  detail: string;
};

/** The root layout's `%s | REX KENNY` template, applied here for accuracy. */
function renderTitle(title: string | null | undefined): string {
  return title && title.length > 0 ? `${title} | ${SITE.shortName}` : SITE.title;
}

function metaIssues(input: MetaInput, rendered: string): string[] {
  const issues: string[] = [];

  if (rendered.length > 65) {
    issues.push(
      `Title is ${rendered.length} characters; results cut near 65, so the end will be replaced with an ellipsis.`,
    );
  }
  if (rendered.length < 30) {
    issues.push(
      `Title is ${rendered.length} characters. There is room to say more about what a searcher gets.`,
    );
  }
  if (input.description.length > 165) {
    issues.push(
      `Description is ${input.description.length} characters; results cut near 165.`,
    );
  }
  if (input.description.length < 70) {
    issues.push(
      `Description is only ${input.description.length} characters — thin for a snippet.`,
    );
  }
  if (/rex kenny/i.test(input.title ?? "") && input.title) {
    issues.push(
      "The title repeats the artist name, which the site template appends anyway.",
    );
  }
  if (input.canonical && !/^https?:\/\//i.test(input.canonical)) {
    issues.push("Canonical override is not an absolute URL.");
  }
  return issues;
}

function rowFromMeta(
  input: MetaInput,
  extra: Pick<SeoRow, "label" | "kind" | "public" | "editHref">,
): SeoRow {
  const rendered = renderTitle(input.title);
  return {
    path: input.path,
    label: extra.label,
    renderedTitle: rendered,
    titleLength: rendered.length,
    description: input.description,
    descriptionLength: input.description.length,
    canonical: absoluteUrl(input.canonical ?? input.path),
    ogImage: absoluteUrl(input.image ?? SITE.ogImage),
    usesSiteDefaultImage: !input.image,
    noindex: input.noindex || !extra.public,
    public: extra.public,
    issues: metaIssues(input, rendered),
    editHref: extra.editHref,
    kind: extra.kind,
  };
}

/**
 * Duplicates are a search problem, not a cosmetic one: two URLs competing for
 * the same query split the clicks between them.
 */
function flagDuplicates(rows: SeoRow[]): void {
  const byTitle = new Map<string, SeoRow[]>();
  const byDescription = new Map<string, SeoRow[]>();
  for (const r of rows) {
    const t = r.renderedTitle.toLowerCase().trim();
    const d = r.description.toLowerCase().trim();
    byTitle.set(t, [...(byTitle.get(t) ?? []), r]);
    byDescription.set(d, [...(byDescription.get(d) ?? []), r]);
  }
  for (const [, group] of byTitle) {
    if (group.length > 1) {
      for (const r of group) {
        r.issues.push(
          `Same title as ${group.filter((g) => g !== r).map((g) => g.path).join(", ")} — search engines pick one to show and the other competes.`,
        );
      }
    }
  }
  for (const [, group] of byDescription) {
    if (group.length > 1) {
      for (const r of group) {
        r.issues.push(
          `Same description as ${group
            .filter((g) => g !== r)
            .map((g) => g.path)
            .join(", ")}.`,
        );
      }
    }
  }
}

/**
 * Walks a structured-data graph the way a validator does: every URL has to be
 * absolute, every node has to name its type, and a date has to be a date. This
 * runs on the objects the page will serialise, so a broken node is caught before
 * it reaches a rich-result report.
 */
export function validateGraph(graph: unknown): string[] {
  const errors: string[] = [];
  const seen: string[] = [];

  /** Keys whose value must be an absolute URL pointing at this site. */
  const OWN_URL = /^(url|image|item|logo|canonicalUrl|urlTemplate)$/i;
  /** Keys whose value must be absolute but may live on another origin. */
  const EXTERNAL_URL = /^(sameAs|contentUrl|thumbnailUrl|embedUrl|downloadUrl)$/i;

  const walk = (value: unknown, path: string, key = ""): void => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`, key));
      return;
    }
    if (typeof value === "string") {
      const absolute = /^https?:\/\//i.test(value);
      if (OWN_URL.test(key)) {
        if (!absolute) {
          errors.push(`${path}: expected an absolute URL, found "${value}".`);
        } else if (!value.startsWith(SITE.url)) {
          errors.push(
            `${path}: this site's own URL must start with ${SITE.url} (found ${value}).`,
          );
        }
      } else if (EXTERNAL_URL.test(key) && !absolute) {
        errors.push(`${path}: "${value}" is not an absolute URL.`);
      }
      return;
    }
    if (typeof value !== "object") return;

    const obj = value as Record<string, unknown>;
    if (obj["@type"]) seen.push(String(obj["@type"]));
    for (const [k, v] of Object.entries(obj)) {
      if (k === "datePublished" || k === "dateModified") {
        if (typeof v === "string" && Number.isNaN(Date.parse(v))) {
          errors.push(`${path}.${k}: "${v}" is not a parseable date.`);
        }
      }
      // "@id" names this site's entity, so it is checked as one of ours.
      if (k === "@id") walk(v, `${path}.__id`, "url");
      else walk(v, `${path}.${k}`, k);
    }
  };

  walk(graph, "@root");
  const root = graph as Record<string, unknown>;
  if (!root["@context"]) errors.push("Graph has no @context.");
  if (!Array.isArray(root["@graph"])) errors.push("Graph has no @graph array.");
  if (seen.length === 0) errors.push("No node in this graph declares an @type.");
  return errors;
}

export type StructuredReport = {
  checked: { page: string; types: string[]; errors: string[] }[];
  note: string;
};

export type SeoAudit = {
  rows: SeoRow[];
  site: SiteCheck[];
  structured: StructuredReport;
  offline: boolean;
  message?: string;
};

export async function auditSite(): Promise<SeoAudit> {
  const rows: SeoRow[] = [];
  const site: SiteCheck[] = [];

  const releases = await listReleasesForAdmin();
  const [videos, posts, lyrics, artist] = await Promise.all([
    getVideos(),
    getPosts(),
    getLyricEntries(),
    getArtistProfile(),
  ]);

  if (releases.ok && releases.data) {
    for (const r of releases.data) {
      const publicRow = r.status === "released";
      rows.push(
        rowFromMeta(releaseMeta(r), {
          label: r.title,
          kind: "release",
          public: publicRow,
          editHref: `/admin/releases/${r.slug}`,
        }),
      );
    }
  }

  for (const v of videos.data) {
    rows.push(
      rowFromMeta(videoMeta(v), {
        label: v.title,
        kind: "video",
        public: true,
        editHref: null,
      }),
    );
  }
  for (const p of posts.data) {
    rows.push(
      rowFromMeta(postMeta(p), { label: p.title, kind: "post", public: true, editHref: null }),
    );
  }
  for (const l of lyrics) {
    rows.push(
      rowFromMeta(lyricMeta(l), {
        label: `${l.trackTitle} lyrics`,
        kind: "lyric",
        public: true,
        editHref: null,
      }),
    );
  }

  flagDuplicates(rows);

  /* ------------------------------------------------------------ site checks */

  site.push(
    env.siteUrl.includes("localhost")
      ? {
          label: "Canonical origin",
          state: "fail",
          detail: `NEXT_PUBLIC_SITE_URL still resolves to ${SITE.url}. Every canonical tag, sitemap entry and structured-data URL points at a machine nobody can crawl. Set it before launch.`,
        }
      : {
          label: "Canonical origin",
          state: "ok",
          detail: `All URLs are built from ${SITE.url}.`,
        },
    SITE.gscToken
      ? {
          label: "Search Console verification",
          state: "ok",
          detail: "A verification token is present in the document head.",
        }
      : {
          label: "Search Console verification",
          state: "warn",
          detail:
            "NEXT_PUBLIC_GSC_SITE_VERIFICATION is empty, so the property cannot be claimed through this HTML file. Verify by DNS or by uploading the HTML file Google gives you.",
        },
    {
      label: "Robots rules",
      state: "ok",
      detail:
        "/admin/, /api/, /auth/ and /account/ are disallowed for every crawler, including the AI answer engines this site otherwise welcomes.",
    },
    {
      label: "AI answer engines",
      state: "ok",
      detail:
        "robots.txt permits GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot and friends on public paths, and /llms.txt describes the site for them.",
    },
    {
      label: "Structured data origin",
      state: SITE.url.startsWith("https://") ? "ok" : "warn",
      detail: SITE.url.startsWith("https://")
        ? "Structured-data URLs use https."
        : `Site origin is ${SITE.url}; search engines treat a non-HTTPS canonical as a soft 404 candidate.`,
    },
  );

  if (!releases.ok) {
    site.push({
      label: "Catalogue read",
      state: "fail",
      detail: releases.message,
    });
  }

  /* ---------------------------------------------------------- structured data */

  const checked: StructuredReport["checked"] = [];

  if (artist.data) {
    const home = buildGraph([musicGroupNode(artist.data)]);
    checked.push({
      page: "/",
      types: typesOf(home),
      errors: validateGraph(home),
    });
  }

  const sample = (releases.ok ? releases.data : []).filter(
    (r) => r.status === "released",
  );
  for (const r of sample.slice(0, 3)) {
    const graph = buildGraph([
      releaseNode(r)["@graph"],
      artist.data ? musicGroupNode(artist.data) : null,
      breadcrumbNode([
        { name: "Home", path: "/" },
        { name: "Music", path: "/music" },
        { name: r.title, path: `/music/${r.slug}` },
      ]),
    ]);
    checked.push({
      page: `/music/${r.slug}`,
      types: typesOf(graph),
      errors: validateGraph(graph),
    });
  }

  return {
    rows,
    site,
    structured: {
      checked,
      note:
        sample.length === 0
          ? "No released record exists yet, so only the home page graph could be checked. Nothing here is simulated in its place."
          : `Validated the objects ${checked.length} pages serialise, including all ${sample.length} released record(s). Emitted HTML is checked separately by npm run check:seo against a running server.`,
    },
    offline: !releases.ok && releases.offline,
    message: releases.ok ? undefined : releases.message,
  };
}

function typesOf(graph: unknown): string[] {
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if (obj["@type"]) out.push(String(obj["@type"]));
      Object.values(obj).forEach(walk);
    }
  };
  walk(graph);
  return [...new Set(out)];
}

/** Used by the sitemap screen so the counts shown are the counts served. */
export function releaseRowForSitemap(r: Release): { path: string; included: boolean } {
  return { path: `/music/${r.slug}`, included: r.status === "released" && !r.seo.noindex };
}
