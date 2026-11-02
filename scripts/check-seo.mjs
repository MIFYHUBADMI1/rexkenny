#!/usr/bin/env node
/**
 * Live search-engine audit.
 *
 * Everything else in `scripts/` reads source or SQL. This one reads the HTML a
 * crawler gets, because the only markup that matters is the markup that ships:
 * metadata builders can be correct in TypeScript and still emit a broken
 * canonical, a duplicate H1 or JSON-LD that fails to parse.
 *
 * Usage:  node scripts/check-seo.mjs [baseUrl]     (default http://127.0.0.1:3000)
 *
 * It never reports success it did not observe. If no server answers, it exits
 * non-zero and says nothing was verified.
 */
import { gzipSync } from "node:zlib";

const base = (process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/$/, "");

/* --------------------------------------------------------------- budgets */

const MAX_HTML_KB = 260;
const MAX_JS_KB = 320;
const MAX_CSS_KB = 120;
const TITLE_RANGE = [15, 70];
const DESC_RANGE = [50, 250];

/* ----------------------------------------------------------- connectivity */

async function get(path, { redirect = "manual" } = {}) {
  const res = await fetch(base + path, { redirect, cache: "no-store" });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    res,
    body: buf.toString("utf8"),
    bytes: buf.length,
    gzip: gzipSync(buf).length,
  };
}

let probe;
try {
  probe = await get("/", { redirect: "follow" });
} catch {
  console.log(
    `NOT VERIFIED — no server answered at ${base}.\n` +
      `Start one (npm run build && npm run start) and pass its address.\n` +
      `Nothing in this report was checked.`,
  );
  process.exit(1);
}
if (probe.res.status >= 400) {
  console.log(`NOT VERIFIED — ${base}/ answered ${probe.res.status}. Nothing was checked.`);
  process.exit(1);
}

const origin = new URL(probe.res.url ?? base).origin;
const onLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(origin);

/* ------------------------------------------------------------ route list */

/**
 * The sitemap is the crawler's entry point, so it is both a subject of this
 * audit and the source of the URLs to audit. Anything it lists must answer.
 */
const robots = await get("/robots.txt", { redirect: "follow" });
const sitemap = await get("/sitemap.xml", { redirect: "follow" });
const llms = await get("/llms.txt", { redirect: "follow" });

const listed = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const extraPaths = [
  "/music",
  "/videos",
  "/lyrics",
  "/news",
  "/about",
  "/artist/rex-kenny",
  "/epk",
  "/contact",
  "/beats",
  "/licensing",
  "/listen",
  "/search",
  "/cookie-policy",
  "/privacy-policy",
  "/terms-of-service",
  "/copyright-policy",
  "/admin",
  "/admin/releases",
  "/this-page-does-not-exist",
];

const urls = [
  base + "/",
  ...listed,
  ...extraPaths.map((p) => base + p),
];

/**
 * Sitemap <loc> values are absolute and built from NEXT_PUBLIC_SITE_URL, which
 * is not necessarily the origin being audited. Compare and fetch by path so a
 * localhost sitemap can still be checked against a server on another port.
 */
const toPath = (u) => {
  try {
    return new URL(u).pathname + (new URL(u).search ?? "");
  } catch {
    return u;
  }
};

const seen = new Set();
const targets = urls
  .map((u) => ({ url: u, path: toPath(u) }))
  .filter((t) => !seen.has(t.path) && seen.add(t.path));

/* ------------------------------------------------------------- utilities */

const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

/**
 * Reads a value out of a <meta> or <link> tag. Matching on the rendered HTML
 * rather than a selector string: Next emits `<meta name="x" content="y"/>` and
 * attribute order is not guaranteed.
 */
function tagValue(html, tagName, pairs) {
  for (const match of html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi"))) {
    const tag = match[0];
    let matched = true;
    const found = [];
    for (const [attrName, wanted] of Object.entries(pairs)) {
      // Self-closing tags end `..."/>`, so nothing may be required after the
      // closing quote.
      const re = new RegExp(`(?:^|\\s)${attrName}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
      if (!re) {
        matched = false;
        break;
      }
      if (wanted !== undefined && re[1] !== wanted) {
        matched = false;
        break;
      }
      found.push(re[1]);
    }
    if (matched) return found;
  }
  return null;
}

const metaContent = (html, key, value) => {
  const v = tagValue(html, "meta", { [key]: value, content: undefined });
  return v ? decode(v[1] ?? v[0]) : null;
};

const linkHref = (html, rel) => {
  const v = tagValue(html, "link", { rel, href: undefined });
  return v ? decode(v[1] ?? v[0]) : null;
};

/** Text a human or a model actually reads, with markup stripped. */
function visibleText(html) {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ");
}

/* ------------------------------------------------------------ the audit */

const findings = [];
const rows = [];
const jsonLdTypes = new Set();

function add(url, level, message) {
  findings.push({ url: toPath(url), level, message });
}

const listedPaths = new Set(listed.map(toPath));

for (const { url: rawUrl, path } of targets) {
  const expect404 = path.includes("this-page-does-not-exist");
  const fetched = await get(path, { redirect: "follow" });
  const { res, body, gzip } = fetched;

  if (expect404) {
    if (res.status !== 404 && res.status !== 410) {
      add(rawUrl, "fail", `a made-up URL answered ${res.status}; it must 404 or crawlers will trust it`);
    } else {
      rows.push({ path, status: res.status, title: "—", h1: 0, ld: 0, kb: (gzip / 1024).toFixed(0) });
    }
    continue;
  }

  if (res.status >= 300) {
    const loc = res.headers.get("location") ?? "";
    /**
     * The dashboard is only ever a redirect for an anonymous visitor. If it
     * ever answers with content here, the RLS boundary is the only thing left
     * between a stranger and the catalogue.
     */
    if (path.startsWith("/admin") && !/\/auth\/login/.test(loc)) {
      add(rawUrl, "fail", `admin URL bounced to "${loc || "nothing"}" instead of the login page`);
    }
    rows.push({ path, status: res.status, title: `→ ${loc || "?"}`.slice(0, 46), h1: 0, ld: 0, kb: "-", js: "-" });
    if (listedPaths.has(path)) {
      add(rawUrl, "fail", `listed in sitemap.xml but answers ${res.status}`);
    }
    continue;
  }
  if (res.status !== 200) {
    add(rawUrl, "fail", `answered ${res.status}`);
    continue;
  }

  const isAdmin = path.startsWith("/admin");
  const html = body;

  /* ---- document shell */
  if (!/<!doctype html>/i.test(html)) add(rawUrl, "warn", "no doctype");
  if (!/<html[^>]*\slang=["']/i.test(html)) add(rawUrl, "fail", "<html> has no lang attribute");
  if (!/<meta[^>]+charset/i.test(html)) add(rawUrl, "warn", "no <meta charset>");
  if (!/<meta[^>]+name="viewport"/i.test(html)) add(rawUrl, "warn", "no viewport meta");

  /* ---- title and description */
  const robotsMeta = metaContent(html, "name", "robots") ?? "";
  const noindex = /noindex/i.test(robotsMeta);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  const cleanTitle = decode(title).trim();
  if (!cleanTitle) add(rawUrl, "fail", "no <title>");
  else if (
    !noindex &&
    (cleanTitle.length < TITLE_RANGE[0] || cleanTitle.length > TITLE_RANGE[1])
  ) {
    // A page that asks not to be indexed is read in a browser tab, not a
    // results page, so the search-result length budget does not apply to it.
    add(rawUrl, "warn", `title is ${cleanTitle.length} characters (${TITLE_RANGE.join("-")} reads best)`);
  }
  const desc = metaContent(html, "name", "description");
  if (!desc) add(rawUrl, "fail", "no meta description — Google will invent one");
  else if (desc.length < DESC_RANGE[0] || desc.length > DESC_RANGE[1]) {
    add(rawUrl, "warn", `description is ${desc.length} characters`);
  }

  /* ---- canonical and robots */
  const canonical = linkHref(html, "canonical");
  if (!canonical) add(rawUrl, "fail", "no canonical URL");
  else {
    if (!/^https?:\/\//.test(canonical)) add(rawUrl, "fail", `canonical "${canonical}" is not absolute`);
    else if (!isAdmin) {
      // The canonical's host comes from SITE_URL, so auditing a preview on
      // another port still has to agree on the path alone.
      const want = path.replace(/\/$/, "") || "/";
      const got = toPath(canonical).replace(/\/$/, "") || "/";
      if (got !== want) {
        add(rawUrl, "warn", `canonical ${canonical} is not this path ${path}`);
      }
    }
    if (/localhost|127\.0\.0\.1/.test(canonical) && !onLocalhost) {
      add(rawUrl, "fail", "canonical points at localhost on a public origin");
    }
  }
  if (isAdmin && !noindex) add(rawUrl, "fail", "an admin page is indexable");
  if (!isAdmin && noindex && listedPaths.has(toPath(canonical ?? rawUrl))) {
    add(rawUrl, "fail", "in the sitemap and marked noindex at the same time");
  }

  /* ---- open graph */
  for (const tag of ["og:title", "og:description", "og:url", "og:image", "og:type"]) {
    if (!new RegExp(`<meta[^>]+property=["']${tag}["']`, "i").test(html)) {
      add(rawUrl, "warn", `missing ${tag}`);
    }
  }
  const ogImage = metaContent(html, "property", "og:image");
  if (ogImage && !/^https?:\/\//.test(ogImage)) add(rawUrl, "fail", `og:image "${ogImage}" is not absolute`);
  if (!/name="twitter:card"/i.test(html)) add(rawUrl, "warn", "missing twitter:card");

  /* ---- headings */
  const h1s = [...html.matchAll(/<h1[\s>]/gi)].length;
  if (h1s === 0) add(rawUrl, "fail", "no <h1> on a live page");
  else if (h1s > 1) add(rawUrl, "warn", `${h1s} <h1> elements`);

  /* ---- images */
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  for (const tag of imgs) {
    const src = /src="([^"]*)"/.exec(tag)?.[1] ?? "?";
    if (!/\balt=/.test(tag)) {
      add(rawUrl, "fail", `<img ${src}> has no alt attribute`);
    }
    if (
      !/\bwidth=/.test(tag) &&
      !/\bheight=/.test(tag) &&
      !/aspect-/.test(tag) &&
      /* Decorative layers that are absolutely positioned cannot reflow the page. */
      !/aria-hidden/.test(tag) &&
      !/\bclass="[^"]*\babsolute\b/.test(tag)
    ) {
      add(rawUrl, "warn", `<img ${src}> has no dimensions and no aspect-ratio class — it will shift layout`);
    }
    if (/loading="lazy"/.test(tag) && /fetchpriority="high"/i.test(tag)) {
      add(rawUrl, "warn", `<img ${src}> is both lazy and fetch-priority high`);
    }
  }

  /* ---- JSON-LD */
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, raw] of blocks) {
    let doc;
    try {
      doc = JSON.parse(raw.replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&"));
    } catch (e) {
      add(rawUrl, "fail", `JSON-LD does not parse: ${e.message}`);
      continue;
    }
    const graph = Array.isArray(doc?.["@graph"]) ? doc["@graph"] : doc ? [doc] : [];
    if (doc?.["@context"] !== "https://schema.org") {
      add(rawUrl, "fail", "JSON-LD has no @context of https://schema.org");
    }
    if (graph.length === 0) add(rawUrl, "warn", "empty JSON-LD graph");
    for (const node of graph) {
      if (node?.["@type"]) {
        (Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]]).forEach((t) =>
          jsonLdTypes.add(t),
        );
      }
      for (const [key, value] of Object.entries(node ?? {})) {
        if (typeof value !== "string") continue;
        if (/(url|Url|image|logo|sameAs|contentUrl|thumbnailUrl)$|^@id$/.test(key)) {
          if (/^https?:\/\//.test(value)) continue;
          if (value.startsWith("/")) {
            add(rawUrl, "fail", `${key} "${value}" is relative — crawlers resolve it against nothing`);
          }
        }
        if (/Date$/.test(key) && value && Number.isNaN(Date.parse(value))) {
          add(rawUrl, "fail", `${key} "${value}" is not a date`);
        }
      }
    }
    const ids = graph.map((n) => n?.["@id"]).filter(Boolean);
    if (new Set(ids).size !== ids.length) add(rawUrl, "warn", "duplicate @id values in one graph");
  }
  // Markup on a page that asks not to be indexed is dead weight, so the
  // requirement only applies to pages a crawler is actually invited to keep.
  if (blocks.length === 0 && !isAdmin && !noindex) {
    add(rawUrl, "warn", "no structured data on an indexable public page");
  }

  /* ---- placeholders that would ship a lie */
  const text = visibleText(html);
  for (const bad of ["Lorem ipsum", "TODO", "FIXME", "undefined", "NaN", "[object Object]"]) {
    if (text.includes(bad)) add(rawUrl, "fail", `page text contains "${bad}"`);
  }

  /* ---- payload budgets */
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((m) => m[1]);
  let jsKb = 0;
  for (const src of scripts) {
    const asset = await get(src.startsWith("http") ? src.replace(origin, "") : src, {
      redirect: "follow",
    });
    jsKb += asset.gzip / 1024;
  }
  let cssKb = 0;
  for (const href of [...html.matchAll(/<link[^>]+stylesheet[^>]*>/gi)]
    .map((m) => /href="([^"]+)"/.exec(m[0])?.[1])
    .filter(Boolean)) {
    const asset = await get(href.startsWith("http") ? href.replace(origin, "") : href, {
      redirect: "follow",
    });
    cssKb += asset.gzip / 1024;
  }
  if (gzip / 1024 > MAX_HTML_KB) add(rawUrl, "warn", `HTML is ${(gzip / 1024).toFixed(0)} KB gzipped`);
  if (jsKb > MAX_JS_KB) add(rawUrl, "fail", `${jsKb.toFixed(0)} KB of JavaScript for this page (budget ${MAX_JS_KB} KB)`);
  if (cssKb > MAX_CSS_KB) add(rawUrl, "warn", `${cssKb.toFixed(0)} KB of CSS (budget ${MAX_CSS_KB} KB)`);

  rows.push({
    path,
    status: res.status,
    title: cleanTitle.slice(0, 46) + (cleanTitle.length > 46 ? "…" : ""),
    h1: h1s,
    ld: blocks.length,
    kb: (gzip / 1024).toFixed(0),
    js: jsKb.toFixed(0),
  });
}

/* ------------------------------------------------- sitemap + robots checks */

if (robots.res.status !== 200) add("/robots.txt", "fail", `answered ${robots.res.status}`);
else {
  for (const need of ["Sitemap:", "Disallow: /admin"]) {
    if (!robots.body.includes(need)) add("/robots.txt", "fail", `missing "${need}"`);
  }
}
if (sitemap.res.status !== 200) add("/sitemap.xml", "fail", `answered ${sitemap.res.status}`);
else if (listed.length === 0) add("/sitemap.xml", "fail", "lists no URLs");
if (llms.res.status !== 200) add("/llms.txt", "warn", `answered ${llms.res.status}`);

/** Every asset the HTML advertises must exist, or the head is lying. */
for (const [file, label] of [
  ["/favicon.ico", "favicon"],
  ["/apple-icon.png", "apple touch icon"],
  ["/icon-512.png", "PWA icon"],
  ["/site.webmanifest", "web app manifest"],
]) {
  const r = await get(file, { redirect: "follow" });
  if (r.res.status !== 200) add(file, "fail", `${label} advertised in the head but answers ${r.res.status}`);
}

/* ---------------------------------------------------------------- report */

const width = Math.max(...rows.map((r) => r.path.length), 6);
console.log(`audited ${rows.length} URLs from ${origin}`);
console.log(`  ${"route".padEnd(width)}  code  h1  ld   html   js    title`);
for (const r of rows) {
  console.log(
    `  ${r.path.padEnd(width)}  ${String(r.status).padEnd(4)}  ${String(r.h1).padEnd(2)}  ${String(
      r.ld,
    ).padEnd(3)}  ${String(r.kb).padStart(4)}K  ${String(r.js ?? "-").padStart(4)}K  ${r.title}`,
  );
}
console.log(`\nstructured-data types seen: ${[...jsonLdTypes].sort().join(", ") || "none"}`);

const fails = findings.filter((f) => f.level === "fail");
const warns = findings.filter((f) => f.level === "warn");

if (warns.length) {
  console.log(`\nWARNINGS (${warns.length})`);
  for (const f of warns.slice(0, 40)) console.log(`  ${f.url}  ${f.message}`);
  if (warns.length > 40) console.log(`  … ${warns.length - 40} more`);
}

if (fails.length) {
  console.log(`\nFAILURES (${fails.length})`);
  for (const f of fails) console.log(`  ${f.url}  ${f.message}`);
  process.exit(1);
}

console.log(
  `\nPASS - ${rows.length} URLs: titles, canonicals, Open Graph, headings, alt text, ` +
    `JSON-LD and payload budgets all held.`,
);
