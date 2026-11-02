#!/usr/bin/env node
/**
 * Asset budget.
 *
 * Everything here is measured, not estimated: the script reads the byte length
 * and true pixel dimensions of each file the source actually references, so a
 * share image declared as 1200x630 in the metadata is checked against the file
 * a crawler will download.
 *
 * It runs without a server on purpose — the failure it exists to catch (a multi
 * megabyte JPEG wired into every page) is visible in the repository alone.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Windows paths are compared as URLs everywhere else in this script. */
const toPosix = (p) => p.split(sep).join("/");
const fromRoot = (f) => toPosix(relative(root, f));

/* ---------------------------------------------------------------- budgets */

/** A page image is downloaded by whoever lands on it. Nothing above this ships. */
const MAX_INLINE_IMAGE_BYTES = 250 * 1024;
/** Open Graph fetchers are patient but mobile networks are not. */
const MAX_OG_IMAGE_BYTES = 200 * 1024;
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
/** An unreferenced file is not shipped, but a huge one is worth naming. */
const WARN_UNREFERENCED_BYTES = 500 * 1024;

/* ------------------------------------------------------------ file walks */

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const sourceFiles = walk(join(root, "src")).filter((f) =>
  /\.(ts|tsx|css)$/.test(f),
);
const publicDir = join(root, "public");
/** URL path -> absolute path, for every file actually present in public/. */
const publicFiles = new Map(
  existsSync(publicDir)
    ? walk(publicDir).map((f) => {
        const rel = fromRoot(f);
        return [`/${rel.slice("public/".length)}`, f];
      })
    : [],
);

/* ------------------------------------------------------- dimension reading */

function dimensions(file, buffer) {
  const head = buffer.subarray(0, 2);
  if (head[0] === 0xff && head[1] === 0xd8) {
    let i = 2;
    while (i < buffer.length - 9) {
      if (buffer[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buffer[i + 1];
      // SOF0..SOF15 except DHT(0xC4), JPEG_EXT(0xC8), DAC(0xCC).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buffer.readUInt16BE(i + 7), height: buffer.readUInt16BE(i + 5) };
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      i += 2 + buffer.readUInt16BE(i + 2);
    }
    return null;
  }
  if (head[0] === 0x89 && buffer[1] === 0x50) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") {
    const vp8 = buffer.subarray(12).indexOf(Buffer.from("VP8"));
    if (vp8 >= 0 && buffer[12 + vp8 + 4 + 3] === 0x31) {
      // Lossy: dimensions live after the 10-byte frame header.
      const start = 12 + vp8 + 20;
      return {
        width: buffer.readUInt16LE(start) & 0x3fff,
        height: buffer.readUInt16LE(start + 2) & 0x3fff,
      };
    }
    return null;
  }
  if (buffer.subarray(0, 5).toString().includes("<svg")) {
    const viewBox = /viewBox="[^"]*\s([\d.]+)\s([\d.]+)"/.exec(buffer.toString("utf8"));
    const attrs = /width="([\d.]+)"[^>]*height="([\d.]+)"/.exec(buffer.toString("utf8"));
    if (attrs) return { width: Number(attrs[1]), height: Number(attrs[2]) };
    if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
    return null;
  }
  return null;
}

/* ---------------------------------------------------- referenced assets */

/**
 * Any absolute asset path written in source. This catches the files a browser
 * or crawler fetches without being told to by a link — favicon, apple icon,
 * webmanifest, structured-data logo — where a missing file is a silent 404.
 */
const ASSET =
  /["'`](\/[\w./-]*\.(?:ico|png|jpe?g|svg|webp|avif|gif|webmanifest))["'`]|url\(\s*["']?(\/[\w./-]*\.(?:ico|png|jpe?g|svg|webp|avif|gif|webmanifest))/g;
const referenced = new Map(); // asset path -> files that mention it

for (const file of sourceFiles) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(ASSET)) {
    const path = m[1] ?? m[2];
    if (!referenced.has(path)) referenced.set(path, new Set());
    referenced
      .get(path)
      .add(fromRoot(file));
  }
}

/** site.ts declares the share image; metadata.ts states its dimensions. */
const siteText = readFileSync(join(root, "src", "lib", "site.ts"), "utf8");
const ogMatch = /ogImage:\s*["'`](\/[^"'`]+)["'`]/.exec(siteText);
const ogPath = ogMatch ? ogMatch[1] : null;

/* ------------------------------------------------------------- reporting */

const problems = [];
const notes = [];
const table = [];

for (const [path, users] of [...referenced.entries()].sort()) {
  const abs = publicFiles.get(path);
  if (!abs) {
    problems.push(`${path}  referenced by ${[...users].join(", ")} but not in public/`);
    continue;
  }
  const bytes = statSync(abs).size;
  const dims = dimensions(abs, readFileSync(abs));
  table.push({ path, bytes, dims: dims ? `${dims.width}x${dims.height}` : "-", from: [...users] });

  const isOg = path === ogPath;
  const limit = isOg ? MAX_OG_IMAGE_BYTES : MAX_INLINE_IMAGE_BYTES;
  if (/\.(jpg|jpeg|png|webp|avif)$/i.test(path) && bytes > limit) {
    problems.push(
      `${path}  ${(bytes / 1024).toFixed(0)} KB — over the ${limit / 1024} KB budget for a ${
        isOg ? "share image" : "page image"
      }`,
    );
  }
  if (isOg) {
    if (!dims) {
      problems.push(`${path}  dimensions unreadable, but metadata declares 1200x630`);
    } else if (dims.width !== OG_WIDTH || dims.height !== OG_HEIGHT) {
      problems.push(
        `${path}  is ${dims.width}x${dims.height}; buildMetadata tells every crawler it is ${OG_WIDTH}x${OG_HEIGHT}`,
      );
    }
  }
  if (/\.(jpg|jpeg|png|webp|avif)$/i.test(path) && dims && dims.width * dims.height > 4_000_000) {
    problems.push(
      `${path}  is ${dims.width}x${dims.height} — larger than any viewport on this site renders`,
    );
  }
}

/* ------------------------------------------------- declared boxes vs pixels */

/**
 * An image whose CSS box disagrees with the file it loads is either stretched
 * or cropped. A crop can be deliberate, so object-cover / object-contain is
 * accepted; anything else must state a ratio the file actually has. The box is
 * read from where the source states it — a hand-written class in a stylesheet
 * or a Tailwind aspect-* utility — and compared against the real dimensions.
 */
const ASPECT_CLASSES = new Map();
for (const file of sourceFiles.filter((f) => /\.css$/.test(f))) {
  const css = readFileSync(file, "utf8");
  for (const block of css.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
    const ratio = /aspect-ratio:\s*([\d.]+)\s*\/\s*([\d.]+)/.exec(block[2]);
    const w = /width:\s*([\d.]+)px/.exec(block[2]);
    const h = /height:\s*([\d.]+)px/.exec(block[2]);
    if (ratio) ASPECT_CLASSES.set(`.${block[1]}`, Number(ratio[1]) / Number(ratio[2]));
    else if (w && h) ASPECT_CLASSES.set(`.${block[1]}`, Number(w[1]) / Number(h[1]));
  }
}

function declaredAspect(className) {
  if (/\baspect-square\b/.test(className)) return 1;
  if (/\baspect-video\b/.test(className)) return 16 / 9;
  const arbitrary = /aspect-\[([\d.]+)\/([\d.]+)\]/.exec(className);
  if (arbitrary) return Number(arbitrary[1]) / Number(arbitrary[2]);
  for (const token of className.split(/\s+/)) {
    const fromCss = ASPECT_CLASSES.get(`.${token}`);
    if (fromCss !== undefined) return fromCss;
  }
  return null;
}

const assetDimensions = new Map();
for (const [path, abs] of publicFiles) {
  if (!/\.(jpg|jpeg|png|webp|avif)$/i.test(path)) continue;
  const dims = dimensions(abs, readFileSync(abs));
  if (dims) assetDimensions.set(path, dims);
}

let boxesChecked = 0;
const unsized = [];
for (const file of sourceFiles.filter((f) => /\.tsx$/.test(f))) {
  const text = readFileSync(file, "utf8");
  for (const tag of text.matchAll(/<img\b([\s\S]{0,1200}?)\/>/g)) {
    const classMatch = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([\s\S]*?)\})/.exec(tag[1]);
    const className = classMatch?.[1] ?? classMatch?.[2] ?? classMatch?.[3] ?? "";
    const srcPaths = [...tag[1].matchAll(/["'`](\/[\w./-]+\.(?:jpg|jpeg|png|webp|avif))["'`]/g)]
      .map((m) => m[1]);
    if (srcPaths.length === 0) continue;

    // An image that is decorative or absolutely positioned cannot shift the
    // layout, so it is not required to state its size.
    const decorative = /aria-hidden/.test(tag[1]);
    const takenOutOfFlow = /absolute/.test(className) && /inset-/.test(className);
    const attrs =
      /width=(?:"\d+"|\{\d+\})/.test(tag[1]) && /height=(?:"\d+"|\{\d+\})/.test(tag[1]);
    if (!decorative && !takenOutOfFlow && !attrs && declaredAspect(className) === null) {
      unsized.push(
        `${fromRoot(file)}  <img src=${JSON.stringify(srcPaths[0])}> has no width/height, no aspect box and is not cropped — the layout jumps when it loads`,
      );
    }

    // object-fit chosen in the source means the crop is the design, not an accident.
    if (/object-(cover|contain|fill|none|scale-down)/.test(className)) continue;
    const declared = declaredAspect(className);
    if (declared === null) continue;
    for (const path of srcPaths) {
      const dims = assetDimensions.get(path);
      if (!dims) continue;
      boxesChecked++;
      const real = dims.width / dims.height;
      if (Math.abs(real - declared) / real > 0.015) {
        problems.push(
          `${fromRoot(file)}  <img src="${path}"> is ${dims.width}x${dims.height} (${real.toFixed(3)}) but its box states ${declared.toFixed(3)} — it will be stretched`,
        );
      }
    }
  }
}
problems.push(...unsized);

/** A manifest that names icons which do not exist installs nothing. */
const manifestAbs = publicFiles.get("/site.webmanifest");
if (manifestAbs) {
  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(manifestAbs, "utf8"));
  } catch {
    problems.push("/site.webmanifest  is not valid JSON, so no browser will read it");
  }
  if (manifest) {
    if (!manifest.start_url) problems.push("/site.webmanifest  has no start_url");
    if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
      problems.push("/site.webmanifest  declares no icons, so it cannot be installed to");
    }
    for (const icon of manifest.icons ?? []) {
      if (!publicFiles.has(icon.src)) {
        problems.push(`/site.webmanifest  names ${icon.src}, which is not in public/`);
      }
    }
  }
}

for (const [path, abs] of publicFiles) {
  if (referenced.has(path)) continue;
  const bytes = statSync(abs).size;
  if (bytes > WARN_UNREFERENCED_BYTES) {
    notes.push(
      `${path}  ${(bytes / 1024 / 1024).toFixed(1)} MB, not referenced by any page — still downloadable at that URL`,
    );
  }
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`assets referenced : ${referenced.size}`);
for (const row of table) {
  console.log(
    `  ${row.path.padEnd(42)} ${kb(row.bytes).padStart(8)}  ${row.dims.padStart(10)}`,
  );
}

if (notes.length) {
  console.log(`\nNOT SHIPPED BY ANY PAGE (${notes.length}):`);
  for (const n of notes) console.log(`  ${n}`);
}

if (problems.length) {
  console.log(`\nFAIL - ${problems.length} asset problem(s):`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  `\nPASS - every referenced asset exists and is inside its budget (page ${
    MAX_INLINE_IMAGE_BYTES / 1024
  } KB, share image ${MAX_OG_IMAGE_BYTES / 1024} KB at ${OG_WIDTH}x${OG_HEIGHT}); ${boxesChecked} uncropped image box(es) match their file's real ratio.`,
);
