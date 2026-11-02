import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ArrowLeft } from "lucide-react";
import { buildMetadata } from "@/lib/seo/metadata";
import { requireStaff } from "@/lib/auth/session";
import {
  getReleaseForAdmin,
  listDistributors,
  listExportsForRelease,
  listGenres,
  listSubmissions,
} from "@/lib/admin/catalogue";
import { adapterFor } from "@/lib/admin/distributors";
import { ReleaseForm } from "@/components/admin/ReleaseForm";
import { TrackManager } from "@/components/admin/TrackManager";
import {
  DistributionPanel,
  ExportPanel,
  ReadinessPanel,
  SearchAppearancePanel,
  StreamingLinkPanel,
} from "@/components/admin/ReleasePanels";
import { OfflineNotice } from "@/components/admin/OfflineNotice";
import { Panel, StatusChip } from "@/components/admin/ui";
import { updateReleaseAction, changeReleaseStatusAction } from "@/actions/releases";
import { EDITABLE_STATUSES, STATUS_LABEL, evaluateReadiness } from "@/lib/admin/readiness";
import { AdminForm } from "@/components/admin/AdminForm";
import { Select, Field, FormNote } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Release",
    description: "Edit a release: metadata, tracks, readiness and distribution record.",
    path: "/admin/releases",
    noindex: true,
  });
}

export default async function ReleaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { slug } = await params;
  const { created } = await searchParams;
  await requireStaff(`/admin/releases/${slug}`);

  const releaseResult = await getReleaseForAdmin(slug);
  if (!releaseResult.ok) {
    return (
      <div className="space-y-6">
        <BackToList />
        <OfflineNotice offline={releaseResult.offline} message={releaseResult.message} />
      </div>
    );
  }
  if (!releaseResult.data) {
    notFound();
  }
  const release = releaseResult.data;

  const [distributors, submissions, exports, genres] = await Promise.all([
    listDistributors(),
    listSubmissions(release.id),
    listExportsForRelease(release.id),
    listGenres(),
  ]);

  const blockers = evaluateReadiness(release).blockers;

  return (
    <div className="space-y-8">
      <BackToList />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">{release.releaseType}</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black break-words">
            {release.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StatusChip status={release.status} />
            <span className="text-xs text-smoke">/music/{release.slug}</span>
            {release.status === "released" ? (
              <Link
                href={`/music/${release.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-mist underline underline-offset-4 hover:text-gold"
              >
                Open the public page
              </Link>
            ) : (
              <span className="text-xs text-smoke">
                Not public until the status is released
              </span>
            )}
          </div>
        </div>
      </header>

      {created === "1" ? (
        <p className="flex items-start gap-2.5 rounded-md border border-gold/40 bg-gold/5 px-4 py-3 text-sm text-gold">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Created as a draft. A new release stays out of the public site until its
          status says otherwise — nothing was announced by creating it.
        </p>
      ) : null}

      {blockers.length > 0 ? (
        <FormNote>
          {blockers.length} blocking item{blockers.length === 1 ? "" : "s"} before this
          release is ready to send: {blockers.map((b) => b.label.toLowerCase()).join(", ")}.
        </FormNote>
      ) : null}

      <Panel
        title="Status"
        description="What the site asserts about this release. Only states you may set are offered."
      >
        <AdminForm
          action={changeReleaseStatusAction}
          submitLabel="Change status"
          resetKey={`status-${release.id}`}
          footnote="A released record appears on the public site within one request cycle."
        >
          <input type="hidden" name="id" value={release.id} />
          <input type="hidden" name="current_slug" value={release.slug} />
          <div className="grid gap-5 md:grid-cols-2">
            <Field
              label="Move this release to"
              name="status"
              hint="Submitted, processing and released are set by the distribution record, not here, because they describe what a store did."
            >
              <Select
                name="status"
                options={EDITABLE_STATUSES.map((s) => ({
                  value: s,
                  label: STATUS_LABEL[s],
                }))}
                defaultValue={
                  EDITABLE_STATUSES.includes(release.status) ? release.status : "draft"
                }
              />
            </Field>
          </div>
          <p className="text-xs leading-relaxed text-smoke">
            Current state: <strong>{STATUS_LABEL[release.status]}</strong>. The
            database refuses a scheduled or released row with no date, so set one in
            the details below first.
          </p>
        </AdminForm>
      </Panel>

      <ReleaseForm
        release={release}
        action={updateReleaseAction}
        genres={genres.ok ? genres.data : []}
      />

      {genres.ok ? null : (
        <p className="text-xs text-smoke">
          Genre list unavailable: {genres.message}. The form still offers the seeded
          default, and any genre you type is validated by the database, not by this list.
        </p>
      )}

      <ReadinessPanel
        release={release}
        distributors={distributors.ok ? distributors.data : []}
      />

      <TrackManager release={release} />

      <StreamingLinkPanel release={release} />

      <DistributionPanel
        release={release}
        distributors={distributors.ok ? distributors.data : []}
        submissions={submissions.ok ? submissions.data : []}
        unreadable={
          distributors.ok && submissions.ok
            ? undefined
            : `${distributors.ok ? "" : `Distributors: ${distributors.message}. `}${
                submissions.ok ? "" : `Submissions: ${submissions.message}.`
              }`
        }
      />

      <SearchAppearancePanel release={release} />

      <ExportPanel release={release} history={exports.ok ? exports.data : []} />

      {distributors.ok && distributors.data.length > 0 ? (
        <Panel
          title="How a release reaches stores from this site"
          description="Each row is what the distributors table says about that route to market — not a claim that anything was sent."
        >
          <ul className="space-y-4">
            {distributors.data.map((d) => {
              const adapter = adapterFor(d);
              return (
                <li key={d.id} className="rounded-lg border border-charcoal bg-ink p-4">
                  <p className="text-sm font-semibold text-paper">{d.name}</p>
                  <p className="mt-1 text-xs text-smoke">{adapter.label}</p>
                  <ul className="mt-2 space-y-1 text-xs leading-relaxed text-mist">
                    {adapter.steps.map((step, i) => (
                      <li key={i}>· {step}</li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

function BackToList() {
  return (
    <Link
      href="/admin/releases"
      className="inline-flex items-center gap-2 text-sm text-mist hover:text-gold"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      All releases
    </Link>
  );
}
