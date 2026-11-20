"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEditor, type Session } from "@/lib/auth/session";
import {
  checkSlug,
  checkUrl,
  databaseFail,
  fail,
  nullable,
  str,
  type AdminFormState,
} from "@/lib/admin/form";
import {
  FILE_FIELD,
  normalizeAudioMime,
  normalizeImageMime,
  normalizeVideoMime,
  publicStorageUrl,
  REQUIRED_PREFIX,
  type StorageCoords,
} from "@/lib/admin/music-files";
import { slugify } from "@/lib/slug";

/**
 * "Add music" writes.
 *
 * The files themselves never pass through this action: the browser uploads
 * them straight to Supabase Storage under the editor's own token, so Row Level
 * Security decides whether each object may exist. This action receives only
 * the coordinates of what was uploaded plus the catalogue fields, re-checks
 * that every coordinate points where the upload rules allow, and writes the
 * release/track/asset rows. Nothing here uses the service-role key.
 */

const NO_DATABASE = fail(
  "No database is connected on this deployment, so nothing can be saved. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, apply supabase/migrations, then try again.",
);

type Supabase = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

function dateOrNull(value: string): string | null {
  if (value === "") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * Reads one uploaded file's coordinates from the form. The browser sends
 * bucket/path/name/mime/size as plain fields; every part is re-validated here
 * because a form field is a claim, not a fact. Returns null when the file was
 * optional and absent, or an error string when it claims something impossible.
 */
function readCoords(
  fd: FormData,
  kind: "master" | "preview" | "cover" | "video",
  normalise: (mime: string) => string | null,
  maxBytes: number,
  required: boolean,
): { coords: StorageCoords | null } | { error: string } {
  const bucket = str(fd, `${kind}_bucket`);
  const path = str(fd, `${kind}_path`);
  const fileName = str(fd, `${kind}_file_name`);
  const mime = normalise(str(fd, `${kind}_mime`));
  const rawBytes = str(fd, `${kind}_bytes`);
  const bytes = rawBytes === "" ? NaN : Number(rawBytes);

  const absent = bucket === "" && path === "" && fileName === "";
  if (absent) {
    return required
      ? { error: "The file was not uploaded. Choose it again and retry." }
      : { coords: null };
  }

  const expectedBucket = FILE_FIELD[kind];
  const problem =
    bucket !== expectedBucket
      ? `The ${kind} file claims bucket "${bucket || "—"}", not ${expectedBucket}.`
      : path === "" || fileName === ""
        ? `The ${kind} upload is missing its storage coordinates.`
        : path.includes("..") || path.startsWith("/")
          ? `The ${kind} path is not a plain storage key.`
          : !path.startsWith(REQUIRED_PREFIX[kind])
            ? `The ${kind} file is not inside the ${REQUIRED_PREFIX[kind]} folder the bucket rules allow.`
            : mime === null
              ? `The ${kind} file type is not one this catalogue accepts.`
              : !Number.isInteger(bytes) || bytes < 0 || bytes > maxBytes
                ? `The ${kind} file size is outside what the bucket accepts.`
                : null;
  if (problem) return { error: problem };

  return {
    coords: {
      bucket,
      path,
      fileName,
      mime: mime as string,
      bytes,
    },
  };
}

/**
 * First free slug for a table. Release slugs are globally unique, so a second
 * "Night Drive" becomes night-drive-2 rather than failing on the constraint.
 */
async function uniqueSlug(
  sb: Supabase,
  table: "releases" | "tracks" | "music_videos",
  base: string,
): Promise<string | null> {
  let candidate = base.slice(0, 80);
  for (let i = 2; i <= 50; i++) {
    const { data, error } = await sb
      .from(table)
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (error) return null;
    if (!data) return candidate;
    const suffix = `-${i}`;
    candidate = `${base.slice(0, 80 - suffix.length).replace(/-+$/, "")}${suffix}`;
  }
  return null;
}

async function audit(
  session: Session,
  action: string,
  entity: string,
  entityId: string,
  detail: Record<string, unknown>,
): Promise<void> {
  const sb = await createSupabaseServerClient();
  if (!sb) return;
  await sb.rpc("record_audit", {
    actor: session.userId,
    action,
    entity,
    entity_id: entityId,
    detail,
  });
}

function revalidateMusic(slug: string): void {
  revalidatePath("/admin");
  revalidatePath("/admin/releases");
  revalidatePath(`/admin/releases/${slug}`);
  revalidatePath("/admin/music");
  revalidatePath("/music");
  revalidatePath(`/music/${slug}`);
  revalidatePath("/videos");
  revalidatePath("/listen");
  revalidatePath("/");
  revalidatePath("/sitemap.xml");
}

export async function addMusicAction(
  _prev: AdminFormState,
  fd: FormData,
): Promise<AdminFormState> {
  const session = await requireEditor("/admin/music");

  // Honeypot, same convention as the release form: bots fill it, humans never see it.
  if (str(fd, "website") !== "") return fail("This submission was not accepted.");

  const title = str(fd, "title");
  const rawSlug = str(fd, "slug");
  const slugBase = rawSlug === "" ? slugify(title) : slugify(rawSlug);
  const genre = str(fd, "genre");
  const releaseDate = str(fd, "release_date");
  const videoLink = str(fd, "video_link");

  if (title === "") return fail("Give the song a title.", "title");
  if (title.length > 200) return fail("The title must be 200 characters or fewer.", "title");
  if (slugBase === "") {
    return fail(
      "This title has no letters or numbers to build an address from, so enter a slug yourself.",
      "slug",
    );
  }
  const slugProblem = checkSlug(slugBase);
  if (slugProblem) return fail(slugProblem, "slug");
  if (genre === "") return fail("Pick the genre.", "genre");
  if (releaseDate !== "" && dateOrNull(releaseDate) === null) {
    return fail("The release date must be a real calendar date.", "release_date");
  }

  const master = readCoords(fd, "master", normalizeAudioMime, 256 * 1024 * 1024, true);
  if ("error" in master) return fail(master.error, "song_file");
  const preview = readCoords(
    fd,
    "preview",
    normalizeAudioMime,
    10 * 1024 * 1024,
    false,
  );
  if ("error" in preview) return fail(preview.error, "song_file");
  const cover = readCoords(fd, "cover", normalizeImageMime, 15 * 1024 * 1024, false);
  if ("error" in cover) return fail(cover.error, "cover_file");
  const video = readCoords(fd, "video", normalizeVideoMime, 2 * 1024 * 1024 * 1024, false);
  if ("error" in video) return fail(video.error, "video_file");

  const videoProblem = checkUrl(videoLink);
  if (videoProblem) return fail(videoProblem, "video_link");
  // A pasted link and an uploaded file both end up as external_url; the file
  // wins when both are supplied because it is the copy the artist controls.
  const videoUrl = video.coords
    ? publicStorageUrl(video.coords.bucket, video.coords.path)
    : nullable(videoLink);

  const sb = await createSupabaseServerClient();
  if (!sb) return NO_DATABASE;

  const masterCoords = master.coords as StorageCoords;
  const slug = await uniqueSlug(sb, "releases", slugBase);
  if (!slug) return fail("Could not find a free address for this release. Try again.", "slug");

  /* ---------------------------------------------------------- the release */

  const { data: artist, error: artistError } = await sb
    .from("artists")
    .select("id")
    .eq("slug", "rex-kenny")
    .maybeSingle();
  if (artistError) return databaseFail(artistError);
  if (!artist) {
    return fail("There is no artist row to own this release. Apply migration 0010.");
  }

  const coverCoords = cover.coords;
  const artworkUrl = coverCoords
    ? publicStorageUrl(coverCoords.bucket, coverCoords.path)
    : null;
  const previewCoords = preview.coords;
  const previewUrl = previewCoords
    ? publicStorageUrl(previewCoords.bucket, previewCoords.path)
    : null;

  const { data: release, error: releaseError } = await sb
    .from("releases")
    .insert({
      artist_id: String(artist.id),
      slug,
      title,
      release_type: "single",
      status: "draft",
      release_date: dateOrNull(releaseDate),
      genre,
      description: nullable(str(fd, "description")),
      artwork_url: artworkUrl,
      artwork_alt: nullable(str(fd, "artwork_alt")) ?? `${title} cover art`,
      video_url: videoUrl,
      created_by: session.userId,
    })
    .select("id,slug")
    .single();
  if (releaseError) return databaseFail(releaseError);

  const releaseId = String(release.id);
  const releaseSlug = String(release.slug);

  /* ------------------------------------------------------------ the track */

  const trackSlug = await uniqueSlug(sb, "tracks", slugify(`${releaseSlug}-track`));
  if (!trackSlug) return fail("Could not build a track address. Try again.", "title");

  const { data: track, error: trackError } = await sb
    .from("tracks")
    .insert({
      release_id: releaseId,
      slug: trackSlug,
      title,
      track_number: 1,
      preview_url: previewUrl,
    })
    .select("id")
    .single();
  if (trackError) return databaseFail(trackError);
  const trackId = String(track.id);

  /* ------------------------------------------------- audio asset records */

  const { data: masterAsset, error: masterAssetError } = await sb
    .from("audio_assets")
    .insert({
      storage_bucket: masterCoords.bucket,
      storage_path: masterCoords.path,
      file_name: masterCoords.fileName,
      mime_type: masterCoords.mime,
      byte_size: masterCoords.bytes,
      is_master: true,
      uploaded_by: session.userId,
    })
    .select("id")
    .single();
  if (masterAssetError) return databaseFail(masterAssetError);

  const assetLinks: { track_id: string; asset_id: string; kind: string }[] = [
    { track_id: trackId, asset_id: String(masterAsset.id), kind: "master" },
  ];

  if (previewCoords) {
    const { data: previewAsset, error: previewAssetError } = await sb
      .from("audio_assets")
      .insert({
        storage_bucket: previewCoords.bucket,
        storage_path: previewCoords.path,
        file_name: previewCoords.fileName,
        mime_type: previewCoords.mime,
        byte_size: previewCoords.bytes,
        is_master: false,
        released_as_preview: true,
        uploaded_by: session.userId,
      })
      .select("id")
      .single();
    if (previewAssetError) return databaseFail(previewAssetError);
    assetLinks.push({
      track_id: trackId,
      asset_id: String(previewAsset.id),
      kind: "preview",
    });
  }

  const { error: linkError } = await sb.from("track_audio_assets").insert(assetLinks);
  if (linkError) return databaseFail(linkError);

  /* ---------------------------------------------------------- cover art */

  if (coverCoords) {
    const { data: art, error: artError } = await sb
      .from("artwork_assets")
      .insert({
        storage_bucket: coverCoords.bucket,
        storage_path: coverCoords.path,
        file_name: coverCoords.fileName,
        mime_type: coverCoords.mime,
        byte_size: coverCoords.bytes,
        alt_text: nullable(str(fd, "artwork_alt")) ?? `${title} cover art`,
        use_case: "release-cover",
        uploaded_by: session.userId,
      })
      .select("id")
      .single();
    if (artError) return databaseFail(artError);

    const { error: joinError } = await sb.from("release_artwork_assets").insert({
      release_id: releaseId,
      asset_id: String(art.id),
    });
    if (joinError) return databaseFail(joinError);
  }

  /* ------------------------------------------------------------- video */

  if (videoUrl) {
    const videoSlug = await uniqueSlug(
      sb,
      "music_videos",
      slugify(`${releaseSlug}-video`),
    );
    if (!videoSlug) return fail("Could not build a video page address. Try again.");

    const { error: videoError } = await sb.from("music_videos").insert({
      slug: videoSlug,
      title,
      category: "official-video",
      external_url: videoUrl,
      thumbnail_url: artworkUrl,
      release_date: dateOrNull(releaseDate),
      related_release_slug: releaseSlug,
      // The file (or link) the admin just supplied is real and hosted, so the
      // video page may show it now; the song itself stays a draft until the
      // release workflow says otherwise.
      published: true,
    });
    if (videoError) return databaseFail(videoError);
  }

  await audit(session, "music.uploaded", "releases", releaseSlug, {
    title,
    files: {
      master: masterCoords.path,
      preview: previewCoords?.path ?? null,
      cover: coverCoords?.path ?? null,
      video: video.coords?.path ?? videoUrl,
    },
  });

  revalidateMusic(releaseSlug);
  redirect(`/admin/releases/${releaseSlug}?created=1`);
}
