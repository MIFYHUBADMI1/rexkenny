import type { Metadata } from "next";
import Link from "next/link";
import { Globe2, Plus } from "lucide-react";
import { buildMetadata } from "@/lib/seo/metadata";
import { requireStaff } from "@/lib/auth/session";
import {
  listAllSubmissions,
  listDistributors,
  type SubmissionRow,
} from "@/lib/admin/catalogue";
import { adapterFor } from "@/lib/admin/distributors";
import { DISTRIBUTION_STATUS_LABEL } from "@/lib/admin/options";
import { DataTable, Panel, StatusChip } from "@/components/admin/ui";
import { OfflineNotice } from "@/components/admin/OfflineNotice";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Distribution",
    description:
      "Per-distributor submission records and what each state is actually backed by.",
    path: "/admin/distribution",
    noindex: true,
  });
}

type Submission = SubmissionRow & {
  releaseId: string;
  releaseSlug: string;
  releaseTitle: string;
};

function Kampala({ iso }: { iso: string }) {
  return (
    <>
      {new Date(iso).toLocaleString("en-GB", {
        timeZone: "Africa/Kampala",
        dateStyle: "medium",
        timeStyle: "short",
      })}{" "}
      <span className="text-smoke">(Kampala)</span>
    </>
  );
}

/**
 * What a recorded state is worth. `claims_must_be_backed` in
 * 0004_distribution.sql refuses an unsupported claim at the database, so
 * anything that lands in the third branch was written by direct SQL and is
 * reported as unsupported rather than being dressed up.
 */
function evidenceOf(s: Submission): { label: string; detail: string; strong: boolean } {
  if (s.status === "prepared") {
    return {
      label: "No outside claim",
      detail:
        "A record of what you intend to send. Nothing here says the files reached anyone.",
      strong: false,
    };
  }
  if (s.apiVerified) {
    return {
      label: "Verified by API",
      detail:
        "api_verified is true, which only a webhook or API handler may set. Treat this as the distributor's own statement.",
      strong: true,
    };
  }
  if (s.confirmedBy && s.confirmedAt) {
    return {
      label: "Confirmed by a person",
      detail:
        "A staff account ticked the evidence statement. It is a human report of what a dashboard showed, not a message from the distributor.",
      strong: true,
    };
  }
  return {
    label: "Unsupported",
    detail:
      "This row asserts a distributor action with neither an API verification nor a named confirmation. The database constraint should have refused it — check for writes made by direct SQL.",
    strong: false,
  };
}

export default async function DistributionPage() {
  await requireStaff("/admin/distribution");
  const [submissions, distributors] = await Promise.all([
    listAllSubmissions(),
    listDistributors(),
  ]);

  const adapters = distributors.ok ? distributors.data.map(adapterFor) : [];
  const connected = adapters.filter((a) => a.canSubmitProgrammatically);

  const rows = submissions.ok ? submissions.data : null;
  const backed = rows
    ? rows.filter((s) => s.apiVerified || (s.confirmedBy && s.confirmedAt)).length
    : 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Distribution</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black">
            Submissions
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-smoke">
            One row per release and distributor. A state above “prepared” is a
            claim about somebody else&apos;s service, so each row shows what
            backs it.
          </p>
        </div>
        <Link href="/admin/releases" className="btn-ghost">
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          Add a submission from a release
        </Link>
      </header>

      {!submissions.ok ? (
        <OfflineNotice
          offline={submissions.offline}
          message={submissions.message}
        />
      ) : rows && rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ash p-8 text-center">
          <Globe2 className="mx-auto h-8 w-8 text-smoke" aria-hidden />
          <p className="mt-3 text-sm text-mist">
            No submission has been recorded for any release.
          </p>
          <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-smoke">
            Open a release and use “Record a submission” once you have started it
            with a distributor. This page stays empty until you do — it will not
            pre-fill a delivery you have not confirmed.
          </p>
        </div>
      ) : (
        <>
          <section
            className={`rounded-lg border p-5 ${
              connected.length > 0
                ? "border-gold/40 bg-gold/5"
                : "border-charcoal bg-ink-raised"
            }`}
          >
            <h2 className="text-sm font-semibold text-paper">
              {connected.length > 0
                ? `${connected.length} distributor${connected.length === 1 ? "" : "s"} connected for programmatic delivery`
                : "No distributor API is connected to this site"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-smoke">
              {connected.length > 0
                ? "Connected distributors can be submitted from a release page, and the response sets api_verified. Every other row below was recorded by a person."
                : "distributors.api_connected is false for every row this deployment can read, and no server action holds distributor credentials. That means nothing on this site has ever sent a file to a store — the states below are human reports of what you saw in a distributor account, and they are labelled as such."}
            </p>
            {adapters.length > 0 ? (
              <ul className="mt-4 grid gap-2 text-xs text-mist sm:grid-cols-2">
                {adapters.map((a) => (
                  <li
                    key={a.distributor.code}
                    className="rounded border border-charcoal px-3 py-2"
                  >
                    <span className="text-paper">{a.distributor.name}</span>
                    <span className="mt-1 block text-smoke">{a.label}</span>
                    <span className="mt-1 block text-smoke">
                      Needs ISRC: {a.requirements.isrc ? "yes" : "not recorded"} ·
                      UPC: {a.requirements.upc ? "yes" : "not recorded"} · artwork
                      {" ≥ "}
                      {a.requirements.minArtworkPx}px
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <Panel
            title={`Every submission (${rows?.length ?? 0})`}
            description={
              rows
                ? `${backed} of ${rows.length} ${rows.length === 1 ? "row is" : "rows are"} backed by an API verification or a named confirmation.`
                : undefined
            }
          >
            <DataTable
              head={["Release", "Distributor", "Recorded state", "Evidence", "Dates"]}
            >
              {(rows ?? []).map((s) => {
                const ev = evidenceOf(s);
                return (
                  <tr
                    key={s.id}
                    className="border-b border-charcoal align-top last:border-0 hover:bg-ink"
                  >
                    <td className="px-4 py-3">
                      {s.releaseSlug ? (
                        <Link
                          href={`/admin/releases/${s.releaseSlug}`}
                          className="text-sm font-medium text-paper hover:text-gold"
                        >
                          {s.releaseTitle}
                        </Link>
                      ) : (
                        <span className="text-sm text-mist">{s.releaseTitle}</span>
                      )}
                      {s.releaseSlug ? (
                        <span className="mt-1 block text-xs text-smoke">
                          /music/{s.releaseSlug}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-sm text-mist">
                      {s.distributorName}
                      <span className="mt-1 block text-xs text-smoke">
                        {s.deliveryMode === "api" ? "API delivery" : "Manual delivery"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={s.status} />
                      <span className="mt-1 block text-xs text-smoke">
                        {DISTRIBUTION_STATUS_LABEL[s.status] ?? s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs uppercase tracking-[0.12em] ${
                          ev.strong ? "text-gold" : "text-smoke"
                        }`}
                      >
                        {ev.label}
                      </span>
                      <p className="mt-1 max-w-md text-xs leading-relaxed text-smoke">
                        {ev.detail}
                      </p>
                      {s.externalRef ? (
                        <p className="mt-1 break-all text-xs text-mist">
                          Distributor reference: {s.externalRef}
                        </p>
                      ) : null}
                      {s.rejectedReason ? (
                        <p className="mt-1 text-xs text-blood">
                          Rejection reason recorded: {s.rejectedReason}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-mist">
                      {s.submittedAt ? (
                        <span className="block">
                          Submitted <Kampala iso={s.submittedAt} />
                        </span>
                      ) : (
                        <span className="block text-smoke">not submitted</span>
                      )}
                      {s.firstLiveAt ? (
                        <span className="mt-1 block">
                          First live <Kampala iso={s.firstLiveAt} />
                        </span>
                      ) : null}
                      {s.confirmedAt ? (
                        <span className="mt-1 block">
                          Confirmed <Kampala iso={s.confirmedAt} />
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          </Panel>
        </>
      )}

      <p className="max-w-3xl text-xs leading-relaxed text-smoke">
        Distribution status changes are appended to{" "}
        <code className="text-mist">distribution_status_history</code> by the
        database, so “when did this go live?” has a recorded answer. Nothing on
        this page is inferred from a release&apos;s own date: a release marked
        released on the public site says nothing about any store until a row
        exists here.
      </p>
    </div>
  );
}
