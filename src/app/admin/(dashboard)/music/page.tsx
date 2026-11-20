import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { buildMetadata } from "@/lib/seo/metadata";
import { requireEditor } from "@/lib/auth/session";
import { listGenres, listReleasesForAdmin } from "@/lib/admin/catalogue";
import { MusicUploadForm } from "@/components/admin/MusicUploadForm";
import { addMusicAction } from "@/actions/music";
import { DataTable, FormNote, Panel, StatusChip } from "@/components/admin/ui";
import { isSupabaseConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Add music",
    description: "Upload a song, its cover art and an optional video from your device.",
    path: "/admin/music",
    noindex: true,
  });
}

export default async function AddMusicPage() {
  await requireEditor("/admin/music");
  const [genres, releases] = await Promise.all([listGenres(), listReleasesForAdmin()]);
  const catalogue = releases.ok ? releases.data.slice(0, 15) : [];

  return (
    <div className="space-y-8">
      <Link
        href="/admin"
        className="inline-flex items-center gap-2 text-sm text-mist hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Overview
      </Link>

      <header>
        <p className="eyebrow">Catalogue</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black">
          Add music
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-smoke">
          Upload a song straight from your device — title, cover art and an
          optional video. The files go to Supabase Storage under your own
          account, and the catalogue rows are written with the same permissions
          as every other admin form.
        </p>
      </header>

      {!isSupabaseConfigured ? (
        <FormNote>
          No database or storage is connected on this deployment, so uploads
          cannot run. Set the Supabase environment variables and apply the
          migrations first.
        </FormNote>
      ) : null}

      <MusicUploadForm
        genres={genres.ok ? genres.data : []}
        action={addMusicAction}
      />

      <Panel
        title="Saved in the catalogue"
        description="Every release row in the database, newest first — drafts included. Open one to edit its details, set a release date and publish it to the public site."
        aside={
          <Link
            href="/admin/releases"
            className="inline-flex items-center gap-1.5 text-xs text-mist hover:text-gold"
          >
            Full release manager <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        }
      >
        {!releases.ok ? (
          <FormNote>{releases.message}</FormNote>
        ) : catalogue.length === 0 ? (
          <p className="text-sm text-smoke">
            Nothing saved yet. The first upload appears here as a draft.
          </p>
        ) : (
          <DataTable head={["Title", "Type", "Status", "Date", ""]}>
            {catalogue.map((r) => (
              <tr key={r.id} className="border-b border-charcoal last:border-0">
                <td className="px-4 py-3">
                  <span className="block font-medium text-paper">{r.title}</span>
                  <span className="block text-xs text-smoke">/music/{r.slug}</span>
                </td>
                <td className="px-4 py-3 text-sm text-mist">{r.releaseType}</td>
                <td className="px-4 py-3">
                  <StatusChip status={r.status} />
                </td>
                <td className="px-4 py-3 text-sm text-mist">
                  {r.releaseDate ?? "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/releases/${r.slug}`}
                    className="text-xs font-semibold text-gold hover:underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>

      <Panel
        title="What uploading does"
        description="So the effect is known before the button is pressed."
      >
        <ul className="space-y-2 text-sm leading-relaxed text-smoke">
          <li>· The song file is stored in the private <strong>music-private</strong> bucket as the master.</li>
          <li>· MP3 and M4A files under 10 MB also get a copy in the public preview bucket, so the release page can play them.</li>
          <li>· The cover goes to the public <strong>artist-public</strong> bucket and becomes the release artwork.</li>
          <li>· A video file is stored in <strong>site-videos</strong> (migration 0011) and published on the Videos page, linked to the release.</li>
          <li>· The release is created as a <strong>draft</strong> single — nothing appears on the public Music page until you release it through the normal workflow.</li>
        </ul>
      </Panel>
    </div>
  );
}
