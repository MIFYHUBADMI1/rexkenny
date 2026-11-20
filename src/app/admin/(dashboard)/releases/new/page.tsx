import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buildMetadata } from "@/lib/seo/metadata";
import { requireEditor } from "@/lib/auth/session";
import { listGenres } from "@/lib/admin/catalogue";
import { ReleaseForm } from "@/components/admin/ReleaseForm";
import { createReleaseAction } from "@/actions/releases";
import { FormNote, Panel } from "@/components/admin/ui";
import { isAiConfigured, isSupabaseConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "New release",
    description: "Create a release row as a draft.",
    path: "/admin/releases/new",
    noindex: true,
  });
}

export default async function NewReleasePage() {
  await requireEditor("/admin/releases/new");
  const genres = await listGenres();

  return (
    <div className="space-y-8">
      <Link
        href="/admin/releases"
        className="inline-flex items-center gap-2 text-sm text-mist hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All releases
      </Link>

      <header>
        <p className="eyebrow">Catalogue</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black">
          New release
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-smoke">
          Every box starts empty on purpose. A field left blank stays blank in the
          database, and the readiness checklist reports it as missing rather than
          filling it with something plausible.
        </p>
      </header>

      {!isSupabaseConfigured ? (
        <FormNote>
          No database is connected on this deployment, so pressing the button will
          report that the write could not happen rather than pretending to succeed.
        </FormNote>
      ) : null}

      <ReleaseForm
        release={null}
        action={createReleaseAction}
        genres={genres.ok ? genres.data : []}
        aiEnabled={isAiConfigured}
      />

      <Panel
        title="What creating this does"
        description="So the effect is known before the button is pressed."
      >
        <ul className="space-y-2 text-sm leading-relaxed text-smoke">
          <li>· One row in public.releases at status <strong>draft</strong>, owned by the seeded artist row.</li>
          <li>· Nothing appears on the public site: the music page only reads releases at status <strong>released</strong>.</li>
          <li>· No distributor is contacted, no date is assumed, and no ISRC is generated.</li>
          <li>· The write happens with your own signed-in token, so the database policies decide whether it is allowed.</li>
        </ul>
      </Panel>
    </div>
  );
}
