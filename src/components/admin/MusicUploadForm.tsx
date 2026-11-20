"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2, UploadCloud } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  AUDIO_ACCEPT,
  canBePublicPreview,
  coverPath,
  extFor,
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  MASTER_MAX_BYTES,
  masterPath,
  normalizeAudioMime,
  normalizeImageMime,
  normalizeVideoMime,
  previewPath,
  uploadDir,
  VIDEO_ACCEPT,
  VIDEO_MAX_BYTES,
  videoPath,
  type StorageCoords,
} from "@/lib/admin/music-files";
import { slugify } from "@/lib/slug";
import type { AdminFormState } from "@/lib/admin/form";
import { Field, FormNote, Panel, Select, TextArea, TextInput } from "@/components/admin/ui";

const IDLE: AdminFormState = { status: "idle", message: "" };

type Phase = { label: string } | null;

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * The "Add music" form. Files never travel through the server action — the
 * 1 MB body limit could not carry a song — so this component uploads each one
 * straight to Supabase Storage with the signed-in editor's own token, then
 * hands the action only the storage coordinates and the catalogue fields.
 * RLS decides whether each upload is allowed, exactly as it does for the rows.
 */
export function MusicUploadForm({
  genres,
  action,
}: {
  genres: { slug: string; name: string }[];
  action: (prev: AdminFormState, fd: FormData) => Promise<AdminFormState>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [phase, setPhase] = useState<Phase>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdminFormState>(IDLE);
  const [pending, startTransition] = useTransition();

  const busy = pending || phase !== null;

  async function put(
    sb: NonNullable<ReturnType<typeof createSupabaseBrowserClient>>,
    bucket: string,
    path: string,
    file: File,
    contentType: string,
  ): Promise<string | null> {
    const { error } = await sb.storage
      .from(bucket)
      .upload(path, file, { contentType, upsert: false });
    return error ? `${error.message} (${bucket}/${path})` : null;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = formRef.current;
    if (!form || busy) return;

    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const slugText = String(data.get("slug") ?? "").trim();

    const fileInput = (name: string) =>
      form.elements.namedItem(name) as HTMLInputElement | null;
    const song = fileInput("song_file")?.files?.[0];
    const cover = fileInput("cover_file")?.files?.[0];
    const video = fileInput("video_file")?.files?.[0];

    if (!title) {
      setError("Give the song a title first.");
      return;
    }
    if (!song) {
      setError("Choose the song file — it is the only required upload.");
      return;
    }

    const songMime = normalizeAudioMime(song.type);
    if (!songMime) {
      setError(
        `“${song.name}” is ${song.type || "an unknown type"}. Use MP3, WAV, FLAC, AAC, OGG or M4A.`,
      );
      return;
    }
    if (song.size > MASTER_MAX_BYTES) {
      setError(`The song is ${fmtBytes(song.size)}; masters cap at 256 MB.`);
      return;
    }
    if (cover) {
      const coverMime = normalizeImageMime(cover.type);
      if (!coverMime) {
        setError(`“${cover.name}” is not a JPEG, PNG, WebP or AVIF image.`);
        return;
      }
      if (cover.size > IMAGE_MAX_BYTES) {
        setError(`The cover is ${fmtBytes(cover.size)}; images cap at 15 MB.`);
        return;
      }
    }
    if (video) {
      const videoMime = normalizeVideoMime(video.type);
      if (!videoMime) {
        setError(`“${video.name}” is not an MP4 or WebM video.`);
        return;
      }
      if (video.size > VIDEO_MAX_BYTES) {
        setError(`The video is ${fmtBytes(video.size)}; videos cap at 2 GB.`);
        return;
      }
    }

    const sb = createSupabaseBrowserClient();
    if (!sb) {
      setError("Supabase is not configured in this deployment, so files cannot upload.");
      return;
    }

    setError(null);
    setResult(IDLE);
    const dir = uploadDir(slugify(slugText || title) || "track");
    const fd = new FormData();
    // Text fields only — the files travel to storage, not through the action.
    for (const key of [
      "title",
      "slug",
      "genre",
      "release_date",
      "description",
      "artwork_alt",
      "video_link",
      "website",
    ]) {
      const v = data.get(key);
      if (typeof v === "string") fd.append(key, v);
    }

    const appendCoords = (c: StorageCoords & { kind: string }) => {
      fd.append(`${c.kind}_bucket`, c.bucket);
      fd.append(`${c.kind}_path`, c.path);
      fd.append(`${c.kind}_file_name`, c.fileName);
      fd.append(`${c.kind}_mime`, c.mime);
      fd.append(`${c.kind}_bytes`, String(c.bytes));
    };

    startTransition(async () => {
      try {
        /* ------------------------------------------------ song: master + preview */
        const masterMime = songMime;
        const mPath = masterPath(dir, masterMime);
        setPhase({ label: `Uploading song (${fmtBytes(song.size)})…` });
        let failure = await put(sb, "music-private", mPath, song, masterMime);
        if (failure) throw new Error(`Song upload failed: ${failure}`);
        appendCoords({
          kind: "master",
          bucket: "music-private",
          path: mPath,
          fileName: `song.${extFor(masterMime)}`,
          mime: masterMime,
          bytes: song.size,
        });

        if (canBePublicPreview(song.type, song.size)) {
          const pMime = normalizeAudioMime(song.type) as string;
          const pPath = previewPath(dir, pMime);
          setPhase({ label: "Uploading public preview…" });
          failure = await put(sb, "music-public", pPath, song, pMime);
          if (failure) throw new Error(`Preview upload failed: ${failure}`);
          appendCoords({
            kind: "preview",
            bucket: "music-public",
            path: pPath,
            fileName: `song.${extFor(pMime)}`,
            mime: pMime,
            bytes: song.size,
          });
        }

        /* ------------------------------------------------------------- cover */
        if (cover) {
          const cMime = normalizeImageMime(cover.type) as string;
          const cPath = coverPath(dir, cMime);
          setPhase({ label: "Uploading cover art…" });
          failure = await put(sb, "artist-public", cPath, cover, cMime);
          if (failure) throw new Error(`Cover upload failed: ${failure}`);
          appendCoords({
            kind: "cover",
            bucket: "artist-public",
            path: cPath,
            fileName: `cover.${extFor(cMime)}`,
            mime: cMime,
            bytes: cover.size,
          });
        }

        /* ------------------------------------------------------------- video */
        if (video) {
          const vMime = normalizeVideoMime(video.type) as string;
          const vPath = videoPath(dir, vMime);
          setPhase({ label: `Uploading video (${fmtBytes(video.size)})…` });
          failure = await put(sb, "site-videos", vPath, video, vMime);
          if (failure) throw new Error(`Video upload failed: ${failure}`);
          appendCoords({
            kind: "video",
            bucket: "site-videos",
            path: vPath,
            fileName: `video.${extFor(vMime)}`,
            mime: vMime,
            bytes: video.size,
          });
        }

        /* ------------------------------------------------- write the rows */
        setPhase({ label: "Saving to the catalogue…" });
        const state = await action(IDLE, fd);
        setResult(state);
        if (state.status === "ok") {
          form.reset();
        }
      } catch (err) {
        // A successful save ends in redirect(), which arrives here as a
        // NEXT_REDIRECT error. It is not a failure — rethrow it so Next can
        // navigate to the new release's admin page.
        const digest = (err as { digest?: string } | null)?.digest;
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        setError(
          err instanceof Error
            ? `${err.message} Files already uploaded stay in storage; nothing was written to the catalogue.`
            : "The upload failed before anything was saved.",
        );
      } finally {
        setPhase(null);
      }
    });
  }

  return (
    <Panel
      title="Upload a song"
      description="Pick the audio file from this device. The song is stored as a private master, a public preview copy is made automatically when the format allows it, and the cover and video are optional."
    >
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
        {/* Honeypot — same convention as the release form. */}
        <div aria-hidden className="absolute left-[-9999px] top-[-9999px]">
          <label htmlFor="music-website">Leave this field empty</label>
          <input
            id="music-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Song title" name="title" required hint="Used for the release and the track.">
            <TextInput name="title" required placeholder="e.g. Night Drive" />
          </Field>

          <Field
            label="Address (slug)"
            name="slug"
            hint="Leave empty to build one from the title. A number is added automatically if it is taken."
          >
            <TextInput name="slug" placeholder="night-drive" />
          </Field>

          <Field label="Genre" name="genre" required>
            <Select
              name="genre"
              required
              options={[
                ...(genres.length > 0
                  ? genres.map((g) => ({ value: g.name, label: g.name }))
                  : [{ value: "African Dancehall", label: "African Dancehall" }]),
              ]}
              defaultValue={genres[0]?.name ?? "African Dancehall"}
            />
          </Field>

          <Field
            label="Release date"
            name="release_date"
            hint="Optional. Only a date the artist has confirmed."
          >
            <TextInput name="release_date" type="date" />
          </Field>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <Field
            label="Song file"
            name="song_file"
            required
            hint={`MP3, WAV, FLAC, AAC, OGG or M4A — up to 256 MB. Stored privately; an MP3/M4A preview under 10 MB is also published for on-site playback.`}
          >
            <input
              id="song_file"
              name="song_file"
              type="file"
              required
              accept={AUDIO_ACCEPT}
              className="mt-2 w-full rounded-md border border-ash bg-ink px-3 py-2 text-sm text-paper file:mr-3 file:rounded file:border-0 file:bg-gold/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gold"
            />
          </Field>

          <Field
            label="Cover photo"
            name="cover_file"
            hint="Square JPEG, PNG, WebP or AVIF — up to 15 MB. Optional; the placeholder art is used without one."
          >
            <input
              id="cover_file"
              name="cover_file"
              type="file"
              accept={IMAGE_ACCEPT}
              className="mt-2 w-full rounded-md border border-ash bg-ink px-3 py-2 text-sm text-paper file:mr-3 file:rounded file:border-0 file:bg-gold/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gold"
            />
          </Field>

          <Field
            label="Video file"
            name="video_file"
            hint="MP4 or WebM — up to 2 GB. Optional. Or paste a link below instead."
          >
            <input
              id="video_file"
              name="video_file"
              type="file"
              accept={VIDEO_ACCEPT}
              className="mt-2 w-full rounded-md border border-ash bg-ink px-3 py-2 text-sm text-paper file:mr-3 file:rounded file:border-0 file:bg-gold/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gold"
            />
          </Field>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Field
            label="Or video link"
            name="video_link"
            hint="https link to a hosted video (YouTube, etc.). Ignored when a video file is chosen."
          >
            <TextInput name="video_link" type="url" placeholder="https://…" />
          </Field>

          <Field
            label="Cover description"
            name="artwork_alt"
            hint="Read by screen readers and image search. Defaults to the song title."
          >
            <TextInput name="artwork_alt" placeholder="Song cover art" />
          </Field>
        </div>

        <Field label="Description" name="description" hint="Shown on the release page once it is released.">
          <TextArea name="description" rows={3} />
        </Field>

        {phase ? (
          <p className="flex items-center gap-2.5 rounded-md border border-gold/40 bg-gold/5 px-3 py-2.5 text-sm text-gold">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {phase.label}
          </p>
        ) : null}

        {error ? (
          <p className="flex items-start gap-2.5 rounded-md border border-blood/50 bg-blood/5 px-3 py-2.5 text-sm leading-relaxed text-blood">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        ) : null}

        {result.status === "ok" ? (
          <p className="flex items-start gap-2.5 rounded-md border border-gold/40 bg-gold/5 px-3 py-2.5 text-sm leading-relaxed text-gold">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{result.message}</span>
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" className="btn-gold" disabled={busy}>
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Working
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <UploadCloud className="h-4 w-4" aria-hidden />
                Upload &amp; add to catalogue
              </span>
            )}
          </button>
          <span className="text-xs text-smoke">
            Creates a draft release — nothing is public until you release it.
          </span>
        </div>

        <FormNote>
          The song file is uploaded to private storage as the master. When it is an
          MP3 or M4A under 10 MB, a copy also goes to the public preview bucket so
          the release page can play it. WAV and FLAC masters stay private only.
          A supplied video is published on the Videos page straight away, linked
          to this release.
        </FormNote>
      </form>
    </Panel>
  );
}
