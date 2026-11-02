// scripts/check-links.mjs
//
// Walks every literal internal link in src/ and asserts a route exists for it.
// A 404 on an artist site is a trust problem, and the admin is worse: a dead
// module link suggests a feature that does not exist. Dynamic segments are
// resolved against the slugs the content layer can actually produce.
//
// Usage: node scripts/check-links.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");

/* ---------- 1. enumerate routes from the app tree ---------- */

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    out.push(full);
    out.push(...walk(full));
  }
  return out;
}

const appDir = join(srcDir, "app");
// walk() returns subdirectories only, so seed it with the app root itself:
// otherwise "/" never appears in the route list and every link home looks dead.
const routeDirs = [appDir, ...walk(appDir)];

/** Convert a filesystem path into a URL pattern. */
function toPattern(dir) {
  const rel = relative(appDir, dir)
    .split(/[\\/]/)
    .filter(Boolean)
    .join("/");
  return (
    "/" +
    rel
      .replace(/\/\(([^)]+)\)/g, "") // route groups do not appear in the URL
      .replace(/^\(([^)]+)\)/, "")
      .replace(/\[([^\]]+)\]/g, ":param")
  ).replace(/\/$/, "");
}

const routeTerminals = new Set();
for (const dir of routeDirs) {
  const files = readdirSync(dir);
  const isTerminal = files.some((f) =>
    ["page.tsx", "page.ts", "route.ts", "route.tsx"].includes(f),
  );
  if (!isTerminal) continue;
  // index pages live at their parent's path
  const pattern = toPattern(dir);
  routeTerminals.add(pattern === "" ? "/" : pattern);
}
// Globally-defined route files (e.g. app/sitemap.ts, app/robots.ts) map to
// extensionless URLs at the app root.
for (const f of readdirSync(appDir)) {
  const m = /^(sitemap|robots)\.ts$/.exec(f);
  if (m) routeTerminals.add(`/${m[1] === "sitemap" ? "sitemap.xml" : "robots.txt"}`);
}
routeTerminals.add("/llms.txt");

const patterns = [...routeTerminals].sort();

/* ---------- 2. collect internal links in source ---------- */

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = sourceFiles(srcDir);
const links = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const rel = relative(root, file).replace(/\\/g, "/");

  // href="/x"  href={"/x"}  Link href="/x"  router.push("/x")  redirect("/x")
  const patterns2 = [
    /href\s*=\s*"([^"]+)"/g,
    /href\s*=\s*\{"([^"]+)"\}/g,
    /(?:push|replace|redirect)\s*\(\s*"([^"]+)"/g,
    /canonical:\s*"([^"]+)"/g,
  ];
  for (const re of patterns2) {
    for (const m of text.matchAll(re)) {
      const raw = m[1];
      if (!raw.startsWith("/")) continue; // external or anchor-only
      if (raw.startsWith("//")) continue; // protocol-relative external
      links.push({ file: rel, target: raw });
    }
  }

  // Template literals with no interpolation are still static paths.
  for (const m of text.matchAll(/href\s*=\s*\{`([^`$]*)`\}/g)) {
    links.push({ file: rel, target: m[1] });
  }
}

/* ---------- 3. resolve ---------- */

function matches(target) {
  const [pathPart] = target.split(/[?#]/);
  const path = pathPart.replace(/\/$/, "") || "/";
  for (const pattern of patterns) {
    if (pattern === path) return true;
    if (!pattern.includes(":param")) continue;
    const regex = new RegExp(
      "^" +
        pattern
          .split("/")
          .map((seg) => (seg.startsWith(":") ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
          .join("/") +
        "$",
    );
    if (regex.test(path)) return true;
  }
  return false;
}

const dead = [];
for (const l of links) {
  if (!matches(l.target)) dead.push(l);
}

/* ---------- 4. report ---------- */

console.log(`routes found : ${patterns.length}`);
console.log(`internal links checked : ${links.length}`);

if (dead.length) {
  console.log("\nDEAD LINKS");
  const seen = new Set();
  for (const d of dead) {
    const key = `${d.file} -> ${d.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  ${d.file}  ${d.target}`);
  }
  console.log(`\nFAIL - ${seen.size} link target(s) with no route.`);
  process.exit(1);
}

console.log("\nPASS - every literal internal link resolves to a route.");
console.log("\nroutes:");
for (const p of patterns) console.log(`  ${p}`);
