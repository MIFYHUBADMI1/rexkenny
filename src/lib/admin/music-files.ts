import { env } from "@/lib/config";

/**
 * Shared rules for the "Add music" upload screen. These run in the browser
 * (to pick and label files) and again in the server action (to decide what the
 * database rows may claim), so they live outside server-only modules. The
 * database and the storage bucket policies still have the final say — this
 * file only keeps the two sides agreeing on names, types and sizes.
 */

/* ------------------------------------------------------------------ audio */

/**
 * Browser File.type values mapped onto the mime types public.audio_assets
 * accepts (0003). Browsers report the same audio as audio/x-wav, audio/wave,
 * audio/x-m4a and friends depending on platform, so the upload sends the
 * normalised type as the object's Content-Type and the row stores it too.
 */
const AUDIO_MIME: Record<string, string> = {
  "audio/mpeg": "audio/mpeg",
  "audio/mp3": "audio/mpeg",
  "audio/wav": "audio/wav",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/flac": "audio/flac",
  "audio/x-flac": "audio/flac",
  "audio/aac": "audio/aac",
  "audio/x-aac": "audio/aac",
  "audio/x-hx-aac": "audio/aac",
  "audio/ogg": "audio/ogg",
  "audio/mp4": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
};

export function normalizeAudioMime(mime: string): string | null {
  return AUDIO_MIME[mime.toLowerCase()] ?? null;
}

export const AUDIO_ACCEPT = Object.keys(AUDIO_MIME).join(",");

/** music-private allows 256 MB per object; music-public previews cap at 10 MB. */
export const MASTER_MAX_BYTES = 256 * 1024 * 1024;
export const PREVIEW_MAX_BYTES = 10 * 1024 * 1024;

/**
 * The public preview bucket only accepts audio/mpeg and audio/mp4, so a WAV or
 * FLAC master is stored privately and simply has no on-site preview — the
 * release page then shows no player rather than a broken one.
 */
export function canBePublicPreview(mime: string, bytes: number): boolean {
  const normalised = normalizeAudioMime(mime);
  return (
    (normalised === "audio/mpeg" || normalised === "audio/mp4") &&
    bytes <= PREVIEW_MAX_BYTES
  );
}

/* ------------------------------------------------------------------ image */

const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export function normalizeImageMime(mime: string): string | null {
  const m = mime.toLowerCase();
  return IMAGE_MIME.has(m) ? m : null;
}

export const IMAGE_ACCEPT = [...IMAGE_MIME].join(",");

/** artist-public caps objects at 15 MB. */
export const IMAGE_MAX_BYTES = 15 * 1024 * 1024;

/* ------------------------------------------------------------------ video */

const VIDEO_MIME = new Set(["video/mp4", "video/webm"]);

export function normalizeVideoMime(mime: string): string | null {
  const m = mime.toLowerCase();
  return VIDEO_MIME.has(m) ? m : null;
}

export const VIDEO_ACCEPT = [...VIDEO_MIME].join(",");

/** site-videos allows 2 GB per object; the Supabase plan may cap it lower. */
export const VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/* ------------------------------------------------------------- paths/urls */

export type StorageCoords = {
  bucket: string;
  path: string;
  fileName: string;
  mime: string;
  bytes: number;
};

const EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/flac": "flac",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export function extFor(mime: string): string {
  return EXT[mime] ?? "bin";
}

/**
 * One directory per submission keeps a re-upload from ever overwriting an
 * earlier file: storage has no UPDATE policy by design (0009), so replacing
 * bytes in place is impossible anyway.
 */
export function uploadDir(slug: string): string {
  return `${slug}-${Date.now().toString(36)}`;
}

export function masterPath(dir: string, mime: string): string {
  return `masters/${dir}/song.${extFor(mime)}`;
}

export function previewPath(dir: string, mime: string): string {
  return `previews/${dir}/song.${extFor(mime)}`;
}

export function coverPath(dir: string, mime: string): string {
  return `press/covers/${dir}/cover.${extFor(mime)}`;
}

export function videoPath(dir: string, mime: string): string {
  return `uploads/${dir}/video.${extFor(mime)}`;
}

/** The URL a public bucket serves. Private buckets never produce one here. */
export function publicStorageUrl(bucket: string, path: string): string {
  return `${env.supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}

/** First path segment a kind of file must live under, per the 0009/0011 rules. */
export const REQUIRED_PREFIX: Record<string, string> = {
  master: "masters/",
  preview: "previews/",
  cover: "press/covers/",
  video: "uploads/",
};

export const FILE_FIELD = {
  master: "music-private",
  preview: "music-public",
  cover: "artist-public",
  video: "site-videos",
} as const;
