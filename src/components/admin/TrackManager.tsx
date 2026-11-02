import { AdminForm } from "@/components/admin/AdminForm";
import {
  Checkbox,
  Field,
  FormNote,
  Panel,
  TextInput,
  TextArea,
} from "@/components/admin/ui";
import { upsertTrackAction, deleteTrackAction } from "@/actions/releases";
import { isEditableStage } from "@/lib/admin/readiness";
import type { Release, Track } from "@/lib/types";

function TrackFields({ track, releaseSlug }: { track: Track | null; releaseSlug: string }) {
  const t = track ?? {
    id: "",
    title: "",
    slug: "",
    durationSeconds: null,
    trackNumber: 1,
    isrc: null,
    explicit: false,
    previewUrl: null,
    lyrics: null,
    lyricsCleared: false,
    credits: { songwriter: [], composer: [], producer: [] },
  };

  return (
    <>
      <input type="hidden" name="release_slug" value={releaseSlug} />
      <input type="hidden" name="track_id" value={t.id} />

      <div className="grid gap-5 md:grid-cols-3">
        <Field label="Track number" name="track_number" required>
          <TextInput
            name="track_number"
            type="number"
            defaultValue={String(t.trackNumber)}
            required
          />
        </Field>
        <Field label="Title" name="title" required>
          <TextInput name="title" defaultValue={t.title} required />
        </Field>
        <Field label="Slug" name="slug" hint="Leave empty to build from the title. Track addresses are unique site-wide.">
          <TextInput name="slug" defaultValue={t.slug} />
        </Field>
        <Field label="Duration (seconds)" name="duration_seconds" hint="214 is 3:34.">
          <TextInput
            name="duration_seconds"
            type="number"
            defaultValue={t.durationSeconds === null ? "" : String(t.durationSeconds)}
          />
        </Field>
        <Field label="ISRC" name="isrc" hint="12 characters, issued per recording.">
          <TextInput name="isrc" defaultValue={t.isrc} placeholder="UG1ABC2400001" />
        </Field>
        <Field
          label="Preview URL"
          name="preview_url"
          hint="A public clip only. Masters live in the private bucket and are never linked here."
        >
          <TextInput name="preview_url" defaultValue={t.previewUrl} placeholder="https://…" />
        </Field>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Field label="Songwriters" name="songwriters" hint="Comma separated, as registered with the collection society.">
          <TextInput name="songwriters" defaultValue={t.credits.songwriter.join(", ")} />
        </Field>
        <Field label="Composers" name="composers">
          <TextInput name="composers" defaultValue={t.credits.composer.join(", ")} />
        </Field>
        <Field label="Producers" name="producers">
          <TextInput name="producers" defaultValue={t.credits.producer.join(", ")} />
        </Field>
      </div>

      <Checkbox
        name="explicit"
        label="Explicit content"
        defaultChecked={t.explicit}
        hint="Stores apply an advisory tag when this is ticked."
      />

      <Checkbox
        name="lyrics_cleared"
        label="I hold the rights to publish these lyrics"
        defaultChecked={t.lyricsCleared}
        hint="Until this is ticked the database refuses to store lyric text, and no lyric page is generated."
      />

      <Field label="Lyrics" name="lyrics" hint="Line breaks are kept. Published only with the clearance box above.">
        <TextArea name="lyrics" rows={8} defaultValue={t.lyrics} />
      </Field>
    </>
  );
}

/**
 * Tracks on a release. Editing is blocked once the release is at a stage where
 * a distributor holds the metadata — the same rule `release_is_editable()`
 * enforces in 0003, so the form cannot get out of sync with the policy.
 */
export function TrackManager({ release }: { release: Release }) {
  const editable = isEditableStage(release.status);

  return (
    <Panel
      title={`Tracks (${release.tracks.length})`}
      description="Each track carries the ISRC, credits and duration a distributor needs. A release with no tracks cannot be scored as ready."
    >
      {!editable ? (
        <div className="mb-5">
          <FormNote>
            This release is <strong>{release.status.replace(/-/g, " ")}</strong>, so
            its tracks are locked. The database rejects edits while metadata is with
            a distributor; move the release to “Needs correction” to change them.
          </FormNote>
        </div>
      ) : null}

      {release.tracks.length === 0 ? (
        <p className="text-sm text-smoke">
          No tracks recorded yet. Nothing is shown on the public page until a real
          track exists here.
        </p>
      ) : (
        <ul className="space-y-4">
          {release.tracks
            .slice()
            .sort((a, b) => a.trackNumber - b.trackNumber)
            .map((track) => (
              <li key={track.id} className="rounded-lg border border-charcoal bg-ink">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                    <span className="w-6 shrink-0 text-sm text-smoke">
                      {track.trackNumber}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-paper">
                      {track.title}
                    </span>
                    <span className="shrink-0 text-xs text-smoke">
                      {track.isrc ?? "no ISRC"} ·{" "}
                      {track.lyrics ? (track.lyricsCleared ? "lyrics live" : "lyrics held") : "no lyrics"}
                    </span>
                  </summary>

                  <div className="border-t border-charcoal p-4">
                    <AdminForm
                      action={upsertTrackAction}
                      submitLabel="Save track"
                      resetKey={track.id}
                      footnote={`Writes to public.tracks for release ${release.slug}.`}
                    >
                      <input type="hidden" name="release_id" value={release.id} />
                      <TrackFields track={track} releaseSlug={release.slug} />
                    </AdminForm>

                    <div className="mt-4 border-t border-charcoal pt-4">
                      <AdminForm
                        action={deleteTrackAction}
                        submitLabel="Delete this track"
                        resetKey={`delete-${track.id}`}
                        footnote="Admin role only. Deletion also removes the link to any audio assets on this track."
                      >
                        <input type="hidden" name="track_id" value={track.id} />
                        <input type="hidden" name="release_slug" value={release.slug} />
                        <Checkbox
                          name="confirm_delete"
                          label="I understand this removes the track and its credits from the catalogue"
                        />
                      </AdminForm>
                    </div>
                  </div>
                </details>
              </li>
            ))}
        </ul>
      )}

      <div className="mt-6 rounded-lg border border-dashed border-ash p-4">
        <h3 className="text-sm font-semibold text-paper">Add a track</h3>
        <p className="mt-1 text-xs text-smoke">
          The next free track number is filled in; change it if the order differs.
        </p>
        <div className="mt-4">
          <AdminForm
            action={upsertTrackAction}
            submitLabel="Add track"
            resetKey={`new-${release.id}`}
          >
            <input type="hidden" name="release_id" value={release.id} />
            <TrackFields
              track={{
                id: "",
                title: "",
                slug: "",
                durationSeconds: null,
                trackNumber: release.tracks.length + 1,
                isrc: null,
                explicit: false,
                previewUrl: null,
                lyrics: null,
                lyricsCleared: false,
                credits: { songwriter: [], composer: [], producer: [] },
              }}
              releaseSlug={release.slug}
            />
          </AdminForm>
        </div>
      </div>
    </Panel>
  );
}
