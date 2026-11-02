"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin, requireEditor, type Session } from "@/lib/auth/session";
import { EDITABLE_STATUSES, STATUS_LABEL, isEditableStage } from "@/lib/admin/readiness";
import {
  bool,
  checkIsrc,
  checkSlug,
  checkUpc,
  checkUrl,
  databaseFail,
  fail,
  firstProblem,
  list,
  nullable,
  num,
  ok,
  str,
  type AdminFormState,
} from "@/lib/admin/form";
import { slugify } from "@/lib/slug";
import { RELEASE_TYPES, STREAM_PLATFORMS } from "@/lib/admin/options";
import type { ReleaseStatus } from "@/lib/types";

/**
 * Release manager writes.
 *
 * Each action checks the caller's role, but that check is a courtesy to the UI:
 * the request reaches PostgREST with the signed-in user's own token, so Row
 * Level Security from 0003/0004 makes the actual decision. Nothing here uses the
 * service-role key, which means a bug in this file cannot outrun the policies.
 */

const NO_DATABASE = fail(
  "No database is connected on this deployment, so nothing can be saved. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, apply supabase/migrations, then try again.",
);

/** Every public surface a release can appear on, refreshed after a write. */
function revalidateRelease(slug: string): void {
  revalidatePath("/admin/releases");
  revalidatePath(`/admin/releases/${slug}`);
  revalidatePath("/admin/seo");
  revalidatePath("/music");
  revalidatePath(`/music/${slug}`);
  revalidatePath("/lyrics");
  revalidatePath("/listen");
  revalidatePath("/");
  revalidatePath("/sitemap.xml");
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
  // Best-effort: the write already happened, and failing to log it must not
  // look like the write itself failed. The policy on audit_logs forbids client
  // INSERT, so this goes through the SECURITY DEFINER record_audit() function.
  await sb.rpc("record_audit", {
    actor: session.userId,
    action,
    entity,
    entity_id: entityId,
    detail,
  });
}

function dateOrNull(value: string): string | null {
  if (value === "") return null;
  // Postgres date columns accept YYYY-MM-DD. Anything else is refused here
  // rather than sent off to become a constraint error.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

type ReleasePayload = {
  slug: string;
  title: string;
  release_type: string;
  release_date: string | null;
  genre: string;
  subgenre: string | null;
  language: string | null;
  description: string | null;
  artwork_url: string | null;
  artwork_alt: string | null;
  featured_artists: string[];
  label: string | null;
  isrc: string | null;
  upc: string | null;
  copyright: string | null;
  publishing: string | null;
  territories: string[];
  video_url: string | null;
};

/** Shared by create and update. Returns the payload, or the first complaint. */
function readReleaseFields(fd: FormData): { payload: ReleasePayload } | { error: string } {
  const title = str(fd, "title");
  const rawSlug = str(fd, "slug");
  const slug = rawSlug === "" ? slugify(title) : slugify(rawSlug);
  const releaseType = str(fd, "release_type") || "single";
  const releaseDate = str(fd, "release_date");
  const genre = str(fd, "genre");
  const artworkUrl = str(fd, "artwork_url");
  const videoUrl = str(fd, "video_url");
  const isrc = str(fd, "isrc").toUpperCase();
  const upc = str(fd, "upc");

  const problem = firstProblem([
    title === "" ? "A title is required." : null,
    title.length > 200 ? "The title must be 200 characters or fewer." : null,
    slug === ""
      ? "This title has no letters or numbers to build an address from, so enter a slug yourself."
      : checkSlug(slug),
    (RELEASE_TYPES as readonly string[]).includes(releaseType)
      ? null
      : "Choose one of the listed release types.",
    releaseDate !== "" && dateOrNull(releaseDate) === null
      ? "The release date must be a real calendar date."
      : null,
    genre === "" ? "Pick the primary genre." : null,
    checkUrl(artworkUrl) ?? checkUrl(videoUrl) ?? checkIsrc(isrc) ?? checkUpc(upc),
  ]);
  if (problem) return { error: problem };

  return {
    payload: {
      slug,
      title,
      release_type: releaseType,
      release_date: dateOrNull(releaseDate),
      genre,
      subgenre: nullable(str(fd, "subgenre")),
      language: nullable(str(fd, "language")),
      description: nullable(str(fd, "description")),
      artwork_url: nullable(artworkUrl),
      artwork_alt: nullable(str(fd, "artwork_alt")),
      featured_artists: list(fd, "featured_artists"),
      label: nullable(str(fd, "label")),
      isrc: nullable(isrc),
      upc: nullable(upc),
      copyright: nullable(str(fd, "copyright")),
      publishing: nullable(str(fd, "publishing")),
      territories: list(fd, "territories").map((t) =>
        t.toLowerCase() === "worldwide" ? "worldwide" : t.toUpperCase(),
      ),
      video_url: nullable(videoUrl),
    },
  };
}

export async function createReleaseAction(
  _prev: AdminFormState,
  fd: FormData,
): Promise<AdminFormState> {
  const session = await requireEditor("/admin/releases/new");

  // Honeypot. A bot fills the hidden field; a human never sees it. Nothing is
  // stored in either case and the same generic message is returned, so an
  // automated submitter learns nothing about which check stopped it.
  if (str(fd, "website") !== "") return fail("This submission was not accepted.");

  const read = readReleaseFields(fd);
  if ("error" in read) return fail(read.error);

  const sb = await createSupabaseServerClient();
  if (!sb) return NO_DATABASE;

  const { data: artist, error: artistError } = await sb
    .from("artists")
    .select("id,slug,name")
    .eq("slug", "rex-kenny")
    .maybeSingle();
  if (artistError) return databaseFail(artistError);
  if (!artist) {
    return fail(
      "There is no artist row to own this release. Apply migration 0010, which seeds REX KENNY.",
    );
  }

  const { data, error } = await sb
    .from("releases")
    .insert({
      ...read.payload,
      artist_id: String(artist.id),
      // New work always starts as a draft. "released" is earned through the
      // status workflow, not granted by a create button.
      status: "draft",
      created_by: session.userId,
    })
    .select("slug")
    .single();
  if (error) return databaseFail(error);

  await audit(session, "release.created", "releases", String(data.slug), {
    title: read.payload.title,
  });

  revalidatePath("/admin/releases");
  redirect(`/admin/releases/${String(data.slug)}?created=1`);
}

export async function updateReleaseAction(
  _prev: AdminFormState,
  fd: FormData,
): Promise<AdminFormState> {
  const id = str(fd, "id");
  const currentSlug = str(fd, "current_slug");
  const session = await requireEditor(`/admin/releases/${currentSlug}`);
  if (id === "") return fail("This form is missing the release it belongs to.");

  const read = readReleaseFields(fd);
  if ("error" in read) return fail(read.error);

  const sb = await createSupabaseServerClient();
  if (!sb) return NO_DATABASE;

  const { data, error } = await sb
    .from("releases")
    .update(read.payload)
    .eq("id", id)
    .select("slug,status")
    .single();
  if (error) return databaseFail(error);

  await audit(session, "release.updated", "releases", String(data.slug), {
    changed: Object.keys(read.payload),
  });

  revalidateRelease(String(data.slug));
  return ok(
    `Saved. ${read.payload.title} now carries these values in the database, and the site reads them from there.`,
  );
}

export async function changeReleaseStatusAction(
  _prev: AdminFormState,
  fd: FormData,
): Promise<AdminFormState> {
  const id = str(fd, "id");
  const currentSlug = str(fd, "current_slug");
  const next = str(fd, "status") as ReleaseStatus;
  const session = await requireEditor(`/admin/releases/${currentSlug}`);

  if (!(EDITABLE_STATUSES as readonly string[]).includes(next)) {
    return fail(
      `"${next || "that"}" is not a state this screen may set. Submitted, processing and released describe what a distributor did. Only a verified API response or a named human confirmation on the distribution record can assert them (0004_distribution.sql), so the release manager will not offer them as a menu choice.`,
      "status",
    );
  }

  const sb = await createSupabaseServerClient();
  if (!sb) return NO_DATABASE;

  const { data: existing, error: readError } = await sb
    .from("releases")
    .select("release_date,status")
    .eq("id", id)
    .maybeSingle();
  if (readError) return databaseFail(readError);
  if (!existing) return fail("This release no longer exists, or your role cannot see it.");

  if (next === "scheduled" && !existing.release_date) {
    return fail(
      `A release cannot move to "${STATUS_LABEL[next]}" without a date. The database requires one, and so does this screen.`,
      "release_date",
    );
  }

  const { data, error } = await sb
    .from("releases")
    .update({ status: next })
    .eq("id", id)
    .select("slug,status")
    .single();
  if (error) return databaseFail(error);

  await audit(session, "release.status", "releases", String(data.slug), {
    from: String(existing.status),
    to: next,
  });

  revalidateRelease(String(data.slug));
  return ok(`Status set to ${STATUS_LABEL[next]}. The public site follows that state.`);
}

export async function updateReleaseSeoAction(
  _prev: AdminFormState,
  fd: FormData,
): Promise<AdminFormState> {
  const id = str(fd, "id");
  const currentSlug = str(fd, "current_slug");
  const session = await requireEditor(`/admin/releases/${currentSlug}`);

  const title = str(fd, "seo_title");
  const description = str(fd, "seo_description");
  const canonical = str(fd, "canonical_url");
  const ogImage = str(fd, "og_image");
  const noindex = bool(fd, "noindex");

  const problem = firstProblem([
    title.length > 70
      ? `This SEO title is ${title.length} characters. Search results cut near 60, so shorten it or leave it empty and let the site generate one.`
      : null,
    description !== "" && description.length < 50
      ? "A search description under 50 characters rarely wins a click. Write a fuller one, or leave it empty to use the release summary."
      : null,
    description.length > 300 ? "Keep the description under 300 characters." : null,
    checkUrl(canonical) ?? checkUrl(ogImage),
  ]);
  if (problem) return fail(problem, "seo_description");

  const sb = await createSupabaseServerClient();
  if (!sb) return NO_DATABASE;

  const { data, error } = await sb
    .from("releases")
    .update({
      seo_title: nullable(title),
      seo_description: nullable(description),
      canonical_url: nullable(canonical),
      og_image: nullable(ogImage),
      noindex,
    })
    .eq("id", id)
    .select("slug,status")
    .single();
  if (error) return databaseFail(error);

  await audit(session, "release.seo", "releases", String(data.slug), { noindex });
  revalidateRelease(String(data.slug));
  return ok(
    noindex
      ? "Saved. This release is marked noindex, so it leaves the sitemap and asks crawlers not to index it."
      : "Saved. The page re-renders with the new search tags.",
  );
}

/* ------------------------------------------------------------------ tracks */

export async function upsertTrackAction(
  _prev: AdminFormState,
  fd: FormData,
): Promise<AdminFormState> {
  const releaseId = str(fd, "release_id");
  const releaseSlug = str(fd, "release_slug");
  const trackId = str(fd, "track_id");
  const session = await requireEditor(`/admin/releases/${releaseSlug}`);

  const sb = await createSupabaseServerClient();
  if (!sb) return NO_DATABASE;

  const { data: release, error: readError } = await sb
    .from("releases")
    .select("status")
    .eq("id", releaseId)
    .maybeSingle();
  if (readError) return databaseFail(readError);
  if (!release) return fail("This release no longer exists, or your role cannot see it.");

  const status = release.status as ReleaseStatus;
  if (!isEditableStage(status)) {
    return fail(
      `Tracks are frozen while a release is ${STATUS_LABEL[status]}. The database blocks the edit so metadata cannot change after files reach a distributor. Move the release to "Needs correction" first.`,
    );
  }

  const title = str(fd, "title");
  const rawSlug = str(fd, "slug");
  const slug = rawSlug === "" ? slugify(title) : slugify(rawSlug);
  const isrc = str(fd, "isrc").toUpperCase();
  const previewUrl = str(fd, "preview_url");
  const lyrics = str(fd, "lyrics");
  const lyricsCleared = bool(fd, "lyrics_cleared");
  const duration = num(fd, "duration_seconds");

  const problem = firstProblem([
    title === "" ? "A track title is required." : null,
    checkSlug(slug),
    str(fd, "track_number") === "" ? "Set the track number." : null,
    duration !== null && (duration < 1 || duration > 36000)
      ? "Duration is in seconds and must be under 10 hours."
      : null,
    checkIsrc(isrc) ?? checkUrl(previewUrl),
    // 0003 refuses lyrics without clearance. Saying so here turns a constraint
    // violation into an instruction the artist can act on.
    lyrics !== "" && !lyricsCleared
      ? "Lyrics are stored only when cleared for publication. Tick the clearance box if you hold the rights, or leave the text empty."
      : null,
  ]);
  if (problem) return fail(problem, "lyrics");

  const payload = {
    release_id: releaseId,
    slug,
    title,
    track_number: num(fd, "track_number") ?? 1,
    duration_seconds: duration,
    isrc: nullable(isrc),
    explicit: bool(fd, "explicit"),
    preview_url: nullable(previewUrl),
    lyrics: lyrics === "" ? null : lyrics,
    lyrics_cleared: lyricsCleared,
    songwriters: list(fd, "songwriters"),
    composers: list(fd, "composers"),
    producers: list(fd, "producers"),
  };

  const result =
    trackId === ""
      ? await sb.from("tracks").insert(payload).select("id,slug").single()
      : await sb
          .from("tracks")
          .update(payload)
          .eq("id", trackId)
          .select("id,slug")
          .single();
  if (result.error) return databaseFail(result.error);

  await audit(
    session,
    trackId === "" ? "track.created" : "track.updated",
    "tracks",
    String(result.data.id),
    { release: releaseSlug, title },
  );

  revalidateRelease(releaseSlug);
  return ok(
    trackId === "" ? `Track "${title}" added.` : `Track "${title}" saved.`,
  );
}

export async function deleteTrackAction(
  _prev: AdminFormState,
  fd: FormData,
): Promise<AdminFormState> {
  const releaseSlug = str(fd, "release_slug");
  const session = await requireAdmin(`/admin/releases/${releaseSlug}`);

  const trackId = str(fd, "track_id");
  if (trackId === "") return fail("This form is missing the track to delete.");
  // A tick, not a JavaScript confirm(): the guard must survive a browser with
  // scripting disabled, and it makes an accidental submit harmless.
  if (!bool(fd, "confirm_delete")) {
    return fail("Nothing was deleted. Tick the confirmation box first.");
  }

  const sb = await createSupabaseServerClient();
  if (!sb) return NO_DATABASE;

  const { data, error } = await sb
    .from("tracks")
    .delete()
    .eq("id", trackId)
    .select("id,title");
  if (error) return databaseFail(error);
  if (!data || data.length === 0) {
    return fail(
      "Nothing was deleted. No row matched, which means the track is already gone or belongs to a release your role cannot edit.",
    );
  }

  await audit(session, "track.deleted", "tracks", trackId, {
    release: releaseSlug,
    title: String(data[0].title),
  });

  revalidateRelease(releaseSlug);
  return ok(`Track "${String(data[0].title)}" deleted.`);
}

/* --------------------------------------------------------- streaming links */

export async function upsertStreamingLinkAction(
  _prev: AdminFormState,
  fd: FormData,
): Promise<AdminFormState> {
  const releaseId = str(fd, "release_id");
  const releaseSlug = str(fd, "release_slug");
  const platform = str(fd, "platform");
  const url = str(fd, "url");
  const session = await requireEditor(`/admin/releases/${releaseSlug}`);

  const problem = firstProblem([
    (STREAM_PLATFORMS as readonly string[]).includes(platform)
      ? null
      : "Choose a platform from the list.",
    url === "" ? "Paste the link to this release on that platform." : checkUrl(url),
  ]);
  if (problem) return fail(problem, "url");

  const sb = await createSupabaseServerClient();
  if (!sb) return NO_DATABASE;

  const { data, error } = await sb
    .from("streaming_links")
    .upsert(
      { release_id: releaseId, platform, url, verified: false },
      { onConflict: "release_id,platform" },
    )
    .select("id");
  if (error) return databaseFail(error);
  if (!data || data.length === 0) {
    return fail("The link was not written: the request was accepted but no row came back.");
  }

  await audit(session, "streaming_link.saved", "streaming_links", String(data[0].id), {
    release: releaseSlug,
    platform,
  });
  revalidateRelease(releaseSlug);
  return ok(`${platform} link saved for ${releaseSlug}.`);
}

export async function deleteStreamingLinkAction(
  _prev: AdminFormState,
  fd: FormData,
): Promise<AdminFormState> {
  const releaseSlug = str(fd, "release_slug");
  const session = await requireEditor(`/admin/releases/${releaseSlug}`);

  const linkId = str(fd, "link_id");
  if (linkId === "") return fail("This form is missing the link to remove.");
  if (!bool(fd, "confirm_delete")) {
    return fail("Nothing was removed. Tick the confirmation box first.");
  }

  const sb = await createSupabaseServerClient();
  if (!sb) return NO_DATABASE;

  const { data, error } = await sb
    .from("streaming_links")
    .delete()
    .eq("id", linkId)
    .select("id");
  if (error) return databaseFail(error);

  await audit(session, "streaming_link.deleted", "streaming_links", linkId, {
    release: releaseSlug,
  });
  revalidateRelease(releaseSlug);
  return ok(data && data.length > 0 ? "Link removed." : "That link is already gone.");
}

/* ------------------------------------------------------- readiness snapshot */

/**
 * Caches the score the admin just saw in `releases.readiness_score` so the
 * release list can sort by it. It is a snapshot of a real calculation performed
 * in the browser-rendered readiness panel, not a metric from an outside system.
 */
export async function cacheReadinessAction(
  _prev: AdminFormState,
  fd: FormData,
): Promise<AdminFormState> {
  const id = str(fd, "id");
  const currentSlug = str(fd, "current_slug");
  const session = await requireEditor(`/admin/releases/${currentSlug}`);

  const score = num(fd, "score");
  if (score === null || score < 0 || score > 100) {
    return fail("Readiness must be a number between 0 and 100.");
  }

  const sb = await createSupabaseServerClient();
  if (!sb) return NO_DATABASE;

  const { error } = await sb
    .from("releases")
    .update({
      readiness_score: score,
      readiness_evaluated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return databaseFail(error);

  await audit(session, "release.readiness", "releases", currentSlug, { score });
  revalidateRelease(currentSlug);
  return ok(`Readiness ${score}% recorded for ${currentSlug}.`);
}
