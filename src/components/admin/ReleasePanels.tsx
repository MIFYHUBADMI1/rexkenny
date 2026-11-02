import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { AdminForm } from "@/components/admin/AdminForm";
import {
  Checkbox,
  DataTable,
  Field,
  FormNote,
  Panel,
  ReadinessMeter,
  Select,
  TextInput,
} from "@/components/admin/ui";
import {
  cacheReadinessAction,
  deleteStreamingLinkAction,
  updateReleaseSeoAction,
  upsertStreamingLinkAction,
} from "@/actions/releases";
import {
  createSubmissionAction,
  deleteSubmissionAction,
  updateSubmissionStatusAction,
} from "@/actions/distribution";
import { evaluateReadiness } from "@/lib/admin/readiness";
import { adapterFor } from "@/lib/admin/distributors";
import {
  DISTRIBUTION_STATUSES,
  PLATFORM_LABEL,
  STATUS_EVIDENCE_LABEL,
  STREAM_PLATFORMS,
} from "@/lib/admin/options";
import type { Distributor, SubmissionRow } from "@/lib/admin/catalogue";
import type { ExportRecord } from "@/lib/admin/catalogue";
import type { Release } from "@/lib/types";

/* ------------------------------------------------------------- listen links */

export function StreamingLinkPanel({ release }: { release: Release }) {
  const used = new Set(release.streaming.map((l) => l.platform));
  const remaining = STREAM_PLATFORMS.filter((p) => !used.has(p));

  return (
    <Panel
      title={`Listening links (${release.streaming.length})`}
      description="These URLs appear on the release page and on /listen. A link is published only once the store page exists, so an empty list means the record is not out — the site never points at a placeholder."
    >
      {release.streaming.length === 0 ? (
        <p className="text-sm text-smoke">No store links recorded yet.</p>
      ) : (
        <ul className="divide-y divide-charcoal rounded-lg border border-charcoal">
          {release.streaming.map((link) => (
            <li key={link.platform} className="flex flex-wrap items-center gap-3 p-3">
              <span className="w-32 shrink-0 text-sm font-medium text-paper">
                {PLATFORM_LABEL[link.platform] ?? link.platform}
              </span>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="min-w-0 flex-1 truncate text-sm text-mist hover:text-gold"
              >
                {link.url}
                <ExternalLink className="ml-1 inline h-3 w-3" aria-hidden />
              </a>
              <AdminForm
                action={deleteStreamingLinkAction}
                submitLabel="Remove"
                className="flex items-center gap-3"
                resetKey={`unlink-${link.platform}`}
              >
                <input type="hidden" name="link_id" value={link.id} />
                <input type="hidden" name="release_slug" value={release.slug} />
                <Checkbox name="confirm_delete" label="Confirm removal" />
              </AdminForm>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5">
        {remaining.length === 0 ? (
          <FormNote>Every platform in the list already has a link for this release.</FormNote>
        ) : (
          <AdminForm
            action={upsertStreamingLinkAction}
            submitLabel="Save link"
            resetKey={`link-${release.id}`}
            footnote="One link per platform per release; saving again replaces that platform's URL."
          >
            <input type="hidden" name="release_id" value={release.id} />
            <input type="hidden" name="release_slug" value={release.slug} />
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Platform" name="platform" required>
                <Select
                  name="platform"
                  options={remaining.map((p) => ({
                    value: p,
                    label: PLATFORM_LABEL[p] ?? p,
                  }))}
                />
              </Field>
              <Field label="URL" name="url" required hint="The store page for this release.">
                <TextInput name="url" placeholder="https://…" required />
              </Field>
            </div>
          </AdminForm>
        )}
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- readiness */

export function ReadinessPanel({
  release,
  distributors,
}: {
  release: Release;
  distributors: Distributor[];
}) {
  // Score against the first distributor's recorded requirements when there is
  // one, because that is the store this release is being prepared for. The
  // panel names which distributor shaped the score.
  const target = distributors.length > 0 ? adapterFor(distributors[0]) : null;
  const readiness = evaluateReadiness(
    release,
    target
      ? {
          name: target.distributor.name,
          requiresIsrc: target.requirements.isrc,
          requiresUpc: target.requirements.upc,
          supportedTerritories: target.requirements.territories,
        }
      : undefined,
  );

  return (
    <Panel
      title="Readiness"
      description="A score out of 100 computed from the values stored on this release right now. It is not a promise a store will accept the submission; it says the metadata this site holds is complete."
    >
      <ReadinessMeter
        score={readiness.score}
        blockers={readiness.blockers.length}
        missing={readiness.missing.length}
      />

      <p className="mt-3 text-xs leading-relaxed text-smoke">
        {release.readinessScore === null
          ? "No score has been recorded for this release yet."
          : `Last recorded score: ${Number(release.readinessScore)}%${
              release.readinessEvaluatedAt
                ? ` on ${new Date(release.readinessEvaluatedAt).toLocaleString("en-GB", {
                    timeZone: "Africa/Kampala",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })} (Kampala time)`
                : ""
            }. The number above is calculated now, so the two can differ.`}
      </p>

      <div className="mt-4">
        <AdminForm
          action={cacheReadinessAction}
          submitLabel={`Record ${readiness.score}%`}
          resetKey={`score-${release.id}`}
          footnote="Writes readiness_score and the evaluation moment to this release row."
        >
          <input type="hidden" name="id" value={release.id} />
          <input type="hidden" name="current_slug" value={release.slug} />
          <input type="hidden" name="score" value={String(readiness.score)} />
        </AdminForm>
      </div>

      <ul className="mt-5 space-y-2">
        {readiness.items.map((item) => (
          <li
            key={item.key}
            className="flex items-start gap-3 rounded-md border border-charcoal bg-ink px-3 py-2.5"
          >
            <span
              aria-hidden
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                item.passed ? "bg-gold" : item.blocking ? "bg-blood" : "bg-ash"
              }`}
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className={`text-sm font-medium ${
                    item.passed ? "text-mist" : "text-paper"
                  }`}
                >
                  {item.label}
                </span>
                <span className="text-[11px] uppercase tracking-[0.14em] text-smoke">
                  {item.weight > 0 ? `${item.weight} pts` : "distributor rule"}
                  {item.blocking ? " · blocking" : ""}
                </span>
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-smoke">
                {item.passed ? item.detail : `${item.detail} — ${item.requirement}`}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs leading-relaxed text-smoke">
        {target
          ? `Blocking rules also checked against ${target.distributor.name} as recorded in the distributors table. Nothing was fetched from the distributor; if their rules changed, that row needs updating.`
          : "No distributor rows are available, so only the general checklist is scored."}
      </p>
    </Panel>
  );
}

/* --------------------------------------------------------------- submission */

function SubmissionEditor({
  submission,
  releaseSlug,
}: {
  submission: SubmissionRow;
  releaseSlug: string;
}) {
  return (
    <AdminForm
      action={updateSubmissionStatusAction}
      submitLabel="Update state"
      resetKey={`upd-${submission.id}`}
      footnote={`Recorded state right now: "${submission.status}".`}
    >
      <input type="hidden" name="submission_id" value={submission.id} />
      <input type="hidden" name="release_slug" value={releaseSlug} />

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          label="State reported by the distributor"
          name="status"
          hint="Choose what their dashboard says, not what you hope happens."
        >
          <Select
            name="status"
            options={DISTRIBUTION_STATUSES.map((v) => ({ value: v, label: v }))}
            defaultValue={submission.status}
          />
        </Field>
        <Field label="Their reference" name="external_ref">
          <TextInput name="external_ref" defaultValue={submission.externalRef} />
        </Field>
        <Field
          label="Submitted at"
          name="submitted_at"
          hint="Required for any state beyond prepared. Enter it as the distributor shows it."
        >
          <TextInput name="submitted_at" type="datetime-local" />
        </Field>
        <Field
          label="First seen live"
          name="first_live_at"
          hint="Required before a record may say live."
        >
          <TextInput name="first_live_at" type="datetime-local" />
        </Field>
      </div>

      <Field
        label="Reason, if rejected"
        name="rejected_reason"
        hint="Stored verbatim so a later correction has something to work from."
      >
        <TextInput name="rejected_reason" defaultValue={submission.rejectedReason} />
      </Field>

      <div className="space-y-3">
        <Checkbox
          name="evidence"
          label="I checked this in the distributor's own account"
          hint="Any state beyond prepared, uploaded or withdrawn needs this tick, and the confirmation is stored against your account."
        />
        <Checkbox name="takedown_requested" label="A takedown has been requested" />
      </div>

      <p className="mt-2 text-xs leading-relaxed text-smoke">
        {STATUS_EVIDENCE_LABEL[submission.status]
          ? `Current state asserts: “${STATUS_EVIDENCE_LABEL[submission.status]}”`
          : "Current state asserts nothing about delivery."}
      </p>
    </AdminForm>
  );
}

export function DistributionPanel({
  release,
  distributors,
  submissions,
  unreadable,
}: {
  release: Release;
  distributors: Distributor[];
  submissions: SubmissionRow[];
  /** Set when the distributors or submissions table could not be read. */
  unreadable?: string;
}) {
  const byId = new Map(distributors.map((d) => [d.id, d]));
  const notRecorded = distributors.filter(
    (d) => !submissions.some((s) => s.distributorId === d.id),
  );
  const connected = distributors.filter((d) => d.apiConnected);

  return (
    <Panel
      title="Distribution record"
      description="What this site can honestly say about getting the release to stores. A state such as live or approved requires a verified API response or a named confirmation from someone who looked."
    >
      {unreadable ? (
        <FormNote>{unreadable}</FormNote>
      ) : (
        <>
          <div className="space-y-4">
            <FormNote>
              {connected.length === 0
                ? `No distributor API is connected on this deployment. Every submission below is recorded from a human looking at ${
                    distributors.length === 1
                      ? distributors[0].name
                      : "the distributor's own site"
                  }, and the api_verified column stays false because nothing here can produce one.`
                : `${connected.map((d) => d.name).join(", ")} reports a tested API connection. Delivery states for those come from webhook responses, never from this form.`}
            </FormNote>

            {submissions.length === 0 ? (
              <p className="text-sm text-smoke">
                No submission recorded for any distributor. The public site does not
                claim otherwise.
              </p>
            ) : (
              <DataTable head={["Distributor", "Recorded state", "Evidence", "Times"]}>
                {submissions.map((s) => {
                  const distributor = byId.get(s.distributorId);
                  const backed = s.apiVerified || Boolean(s.confirmedBy && s.confirmedAt);
                  const asserting = s.status !== "prepared" && s.status !== "withdrawn";
                  return (
                    <tr key={s.id} className="border-b border-charcoal align-top last:border-0">
                      <td className="px-4 py-3 text-sm text-paper">
                        {s.distributorName}
                        {distributor && distributor.deliveryMode !== "api" ? (
                          <span className="mt-1 block text-xs text-smoke">
                            manual upload
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={
                            asserting && !backed ? "text-blood" : "text-paper"
                          }
                        >
                          {s.status.replace(/[-_]/g, " ")}
                        </span>
                        <span className="mt-1 block text-xs text-smoke">
                          {s.apiVerified
                            ? "verified by API response"
                            : s.confirmedBy
                              ? `confirmed by account ${s.confirmedBy.slice(0, 8)}…`
                              : asserting
                                ? "no confirmation on file"
                                : "intention only"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-smoke">
                        {s.rejectedReason
                          ? `Reason: ${s.rejectedReason}`
                          : s.externalRef
                            ? `Ref ${s.externalRef}`
                            : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs leading-relaxed text-smoke">
                        {s.submittedAt ? `submitted ${s.submittedAt.slice(0, 16)}` : "not submitted"}
                        {s.firstLiveAt ? ` · live ${s.firstLiveAt.slice(0, 16)}` : ""}
                        {s.confirmedAt ? ` · confirmed ${s.confirmedAt.slice(0, 16)}` : ""}
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
            )}

            {submissions.length > 0 ? (
              <div className="space-y-5">
                <h3 className="text-sm font-semibold text-paper">Update a record</h3>
                <p className="text-xs leading-relaxed text-smoke">
                  Timestamps are stored exactly as entered, in your own time zone. The
                  site does not convert them and will not fill one in for you.
                </p>
                {submissions.map((s) => (
                  <div key={s.id} className="rounded-lg border border-ash p-4">
                    <p className="mb-4 text-sm font-medium text-paper">
                      {s.distributorName}
                    </p>
                    <SubmissionEditor submission={s} releaseSlug={release.slug} />
                    <div className="mt-4 border-t border-charcoal pt-4">
                      <AdminForm
                        action={deleteSubmissionAction}
                        submitLabel="Delete this record"
                        resetKey={`del-${s.id}`}
                        footnote="Admin role only. The status history belongs to this row and goes with it."
                      >
                        <input type="hidden" name="submission_id" value={s.id} />
                        <input type="hidden" name="release_slug" value={release.slug} />
                        <Checkbox
                          name="confirm_delete"
                          label="I understand this deletes the record of what was reported"
                        />
                      </AdminForm>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {notRecorded.length > 0 ? (
              <div className="rounded-lg border border-dashed border-ash p-4">
                <h3 className="text-sm font-semibold text-paper">Record a submission</h3>
                <p className="mt-1 text-xs leading-relaxed text-smoke">
                  Starts at “prepared”, which means only that the release is going
                  there. Nothing about delivery is asserted.
                </p>
                <div className="mt-4">
                  <AdminForm
                    action={createSubmissionAction}
                    submitLabel="Create record"
                    resetKey={`sub-${release.id}`}
                  >
                    <input type="hidden" name="release_id" value={release.id} />
                    <input type="hidden" name="release_slug" value={release.slug} />
                    <div className="grid gap-5 md:grid-cols-2">
                      <Field label="Distributor" name="distributor_id" required>
                        <Select
                          name="distributor_id"
                          options={notRecorded.map((d) => ({
                            value: d.id,
                            label: `${d.name} — ${d.deliveryMode === "api" && d.apiConnected ? "API" : "manual"}`,
                          }))}
                        />
                      </Field>
                      <Field label="Their reference (optional)" name="external_ref">
                        <TextInput name="external_ref" />
                      </Field>
                    </div>
                  </AdminForm>
                </div>
                <ol className="mt-5 space-y-1.5 text-xs leading-relaxed text-smoke">
                  {adapterFor(notRecorded[0]).steps.map((step, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-gold">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-3 border-t border-charcoal pt-5">
            <Link href="/admin/distribution" className="btn-ghost text-xs">
              All submissions
            </Link>
          </div>
        </>
      )}
    </Panel>
  );
}

/* --------------------------------------------------------------------- SEO */

export function SearchAppearancePanel({ release }: { release: Release }) {
  const publicUrl = `/music/${release.slug}`;
  return (
    <Panel
      title="Search appearance"
      description="Overrides for this release page. Left empty, the site generates the tags from the title and description above, so an empty field is not a gap in the data."
      aside={
        <Link
          href={publicUrl}
          className="btn-ghost px-3 py-2 text-xs"
          target="_blank"
          rel="noopener noreferrer"
        >
          View live page
        </Link>
      }
    >
      <AdminForm
        action={updateReleaseSeoAction}
        submitLabel="Save search tags"
        resetKey={`seo-${release.id}`}
        footnote="The sitemap and the robots directive both follow the noindex box."
      >
        <input type="hidden" name="id" value={release.id} />
        <input type="hidden" name="current_slug" value={release.slug} />
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            label="SEO title"
            name="seo_title"
            hint="Under about 60 characters. The site appends “| REX KENNY”."
          >
            <TextInput name="seo_title" defaultValue={release.seo.title} />
          </Field>
          <Field
            label="Canonical URL"
            name="canonical_url"
            hint={`Only set this if the page officially lives elsewhere. Default: site URL + ${publicUrl}.`}
          >
            <TextInput
              name="canonical_url"
              defaultValue={release.seo.canonical}
              placeholder="https://…"
            />
          </Field>
          <Field label="Open Graph image" name="og_image" hint="1200×630 for link previews.">
            <TextInput name="og_image" defaultValue={release.seo.ogImage} placeholder="https://…" />
          </Field>
          <div className="flex items-end pb-1">
            <Checkbox
              name="noindex"
              label="Keep this release out of search engines"
              defaultChecked={release.seo.noindex}
              hint="Also removes it from the sitemap."
            />
          </div>
        </div>
        <Field
          label="Meta description"
          name="seo_description"
          hint="50–160 characters, written for the person deciding whether to click."
        >
          <TextInput name="seo_description" defaultValue={release.seo.description} />
        </Field>
      </AdminForm>
    </Panel>
  );
}

/* ------------------------------------------------------------------ export */

export function ExportPanel({
  release,
  history,
}: {
  release: Release;
  history: ExportRecord[];
}) {
  return (
    <Panel
      title="Metadata export"
      description="The sheet an editor carries to a distributor's upload form. Downloading generates it from the values on this page right now and stores the checksum, so a later question about what was handed over has an answer."
    >
      <div className="flex flex-wrap gap-3">
        <a href={`/admin/releases/${release.slug}/export?format=json`} className="btn-gold">
          Download JSON
        </a>
        <a href={`/admin/releases/${release.slug}/export?format=csv`} className="btn-ghost">
          Download CSV
        </a>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-smoke">
        Neither file is a DDEX ERN and neither proves delivery. Each carries a header
        saying it is metadata prepared for upload.
      </p>

      {history.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-smoke">
            Generated here
          </h3>
          <ul className="mt-2 space-y-1.5 text-xs text-mist">
            {history.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-3 gap-y-1">
                <span className="uppercase tracking-[0.1em] text-paper">{e.format}</span>
                <span>{e.fileName}</span>
                <span className="text-smoke">
                  {new Date(e.createdAt).toLocaleString("en-GB", {
                    timeZone: "Africa/Kampala",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  (Kampala)
                </span>
                <span className="text-smoke">
                  sha256 {e.checksum ? `${e.checksum.slice(0, 12)}…` : "not recorded"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-5 text-xs text-smoke">Nothing has been downloaded yet.</p>
      )}
    </Panel>
  );
}
