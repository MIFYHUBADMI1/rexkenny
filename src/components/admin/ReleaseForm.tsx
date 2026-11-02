import { AdminForm } from "@/components/admin/AdminForm";
import {
  Field,
  FormNote,
  Panel,
  Select,
  TextArea,
  TextInput,
} from "@/components/admin/ui";
import {
  LANGUAGE_CHOICES,
  RELEASE_TYPES,
  RELEASE_TYPE_LABEL,
  TERRITORY_CHOICES,
} from "@/lib/admin/options";
import { STATUS_LABEL } from "@/lib/admin/readiness";
import type { Release } from "@/lib/types";
import type { AdminFormState } from "@/lib/admin/form";

const EMPTY = {
  id: "",
  slug: "",
  title: "",
  releaseType: "single",
  releaseDate: null,
  genre: "African Dancehall",
  subgenre: null,
  language: null,
  description: null,
  artworkUrl: null,
  artworkAlt: "",
  featuredArtists: [] as string[],
  label: null,
  isrc: null,
  upc: null,
  copyright: null,
  publishing: null,
  territories: [] as string[],
  videoUrl: null,
} satisfies Partial<Release>;

function genreOptions(genres: { slug: string; name: string }[]) {
  return genres.length > 0
    ? genres.map((g) => ({ value: g.name, label: g.name }))
    : [
        { value: "African Dancehall", label: "African Dancehall" },
        { value: "Dancehall", label: "Dancehall" },
        { value: "Afrobeats", label: "Afrobeats" },
        { value: "Amapiano", label: "Amapiano" },
      ];
}

/**
 * The release detail form, used for both creating and editing. It renders one
 * field per column in `public.releases`, and an absent value renders as an
 * empty box rather than a plausible guess.
 */
export function ReleaseForm({
  release,
  action,
  genres,
}: {
  /** Null on the create screen, where every box starts empty. */
  release: Release | null;
  action: (prev: AdminFormState, fd: FormData) => Promise<AdminFormState>;
  genres: { slug: string; name: string }[];
}) {
  const r = release ?? EMPTY;

  return (
    <Panel
      title={release ? "Release details" : "New release"}
      description="These are the fields a distributor asks for. Leaving one empty keeps it empty in the database — the site never fills a gap with a guess."
    >
      <AdminForm
        action={action}
        submitLabel={release ? "Save release" : "Create as draft"}
        resetKey={release?.id ?? "new"}
        footnote="Writes to public.releases, which validates the same fields again."
      >
        <input type="hidden" name="id" value={release?.id ?? ""} />
        <input type="hidden" name="current_slug" value={release?.slug ?? ""} />
        {/* Honeypot. Hidden by CSS in the form, and never rendered as a field. */}
        <div aria-hidden className="absolute left-[-9999px] top-[-9999px]">
          <label htmlFor="release-website">Leave this field empty</label>
          <input id="release-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Title" name="title" required hint="As it should appear on stores.">
            <TextInput name="title" defaultValue={r.title} required />
          </Field>

          <Field
            label="Address (slug)"
            name="slug"
            hint={
              release
                ? `The public page lives at /music/${release.slug}. Changing it moves the URL, so old links stop working.`
                : "Leave empty to build one from the title."
            }
          >
            <TextInput name="slug" defaultValue={r.slug} />
          </Field>

          <Field label="Release type" name="release_type">
            <Select
              name="release_type"
              options={RELEASE_TYPES.map((t) => ({
                value: t,
                label: RELEASE_TYPE_LABEL[t] ?? t,
              }))}
              defaultValue={r.releaseType}
            />
          </Field>

          <Field
            label="Release date"
            name="release_date"
            hint="Only a date the artist has confirmed. A release cannot be marked scheduled without it."
          >
            <TextInput name="release_date" type="date" defaultValue={r.releaseDate} />
          </Field>

          <Field label="Primary genre" name="genre" required hint="What stores file the record under.">
            <Select
              name="genre"
              options={genreOptions(genres)}
              defaultValue={r.genre}
              required
            />
          </Field>

          <Field label="Sub-genre" name="subgenre">
            <TextInput name="subgenre" defaultValue={r.subgenre} />
          </Field>

          <Field label="Language" name="language" hint="The dominant vocal language.">
            <Select
              name="language"
              options={[
                { value: "", label: "— not set —" },
                ...LANGUAGE_CHOICES.map((l) => ({ value: l, label: l })),
              ]}
              defaultValue={r.language}
            />
          </Field>

          <Field label="Label of record" name="label" hint="An independent artist name counts as a label.">
            <TextInput name="label" defaultValue={r.label} />
          </Field>

          <Field
            label="Cover artwork URL"
            name="artwork_url"
            hint="Square art, 3000×3000 px preferred, 1400 px minimum. The media module is not built yet, so paste a storage URL."
          >
            <TextInput name="artwork_url" defaultValue={r.artworkUrl} placeholder="https://…" />
          </Field>

          <Field label="Artwork description" name="artwork_alt" hint="Read by screen readers and image search.">
            <TextInput name="artwork_alt" defaultValue={r.artworkAlt} />
          </Field>

          <Field
            label="Release ISRC"
            name="isrc"
            hint="Leave empty until a distributor issues one. An invented code corrupts the catalogue."
          >
            <TextInput name="isrc" defaultValue={r.isrc} placeholder="UG1ABC2400001" />
          </Field>

          <Field label="UPC / EAN" name="upc" hint="12 or 14 digits. Stores require it for EPs and albums.">
            <TextInput name="upc" defaultValue={r.upc} />
          </Field>

          <Field label="Copyright line" name="copyright" hint="Year and rights holder, exactly as registered.">
            <TextInput name="copyright" defaultValue={r.copyright} placeholder="2026 REX KENNY MUSIC" />
          </Field>

          <Field label="Publishing" name="publishing" hint="Publisher or administrator of the composition.">
            <TextInput name="publishing" defaultValue={r.publishing} />
          </Field>

          <Field
            label="Featured artists"
            name="featured_artists"
            hint="Display names, comma separated. Only credits that exist."
          >
            <TextInput
              name="featured_artists"
              defaultValue={r.featuredArtists.join(", ")}
              placeholder="Name, Name"
            />
          </Field>

          <Field
            label="Territories"
            name="territories"
            hint={`Comma separated. Pick from: ${TERRITORY_CHOICES.slice(0, 12).join(", ")} …`}
          >
            <TextInput
              name="territories"
              defaultValue={r.territories.join(", ")}
              placeholder="worldwide"
            />
          </Field>
        </div>

        <Field label="Description" name="description" hint="Used on the release page and in the EPK.">
          <TextArea name="description" rows={4} defaultValue={r.description} />
        </Field>

        <Field
          label="Official video URL"
          name="video_url"
          hint="https link. Video pages come from the videos table, not this field."
        >
          <TextInput name="video_url" defaultValue={r.videoUrl} placeholder="https://…" />
        </Field>

        <FormNote>
          Status is deliberately not on this form. Moving a release to{" "}
          <strong>{STATUS_LABEL.released}</strong> changes what the public site
          asserts about it, so that control sits on its own below.
        </FormNote>
      </AdminForm>
    </Panel>
  );
}
