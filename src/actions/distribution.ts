"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin, requireEditor } from "@/lib/auth/session";
import {
  bool,
  databaseFail,
  fail,
  firstProblem,
  nullable,
  ok,
  str,
  type AdminFormState,
} from "@/lib/admin/form";
import { DISTRIBUTION_STATUSES } from "@/lib/admin/options";

/**
 * Distribution record writes.
 *
 * The table this touches is the one place the site is allowed to assert that a
 * release reached a store, so the rules here are the rules 0004_distribution.sql
 * enforces: a claim status needs a verified API response or a named human who
 * confirmed it. This file can supply the human. It can never supply the API
 * response, and it does not try — `api_verified` is not in any payload below.
 */

const SUBMISSION_STATUSES = DISTRIBUTION_STATUSES;

type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Every one of these says "the files physically got there". */
const CLAIM_STATUSES: SubmissionStatus[] = [
  "uploaded",
  "in-review",
  "approved",
  "rejected",
  "scheduled",
  "live",
  "delivered",
];

function asStatus(value: string): SubmissionStatus | null {
  return (SUBMISSION_STATUSES as readonly string[]).includes(value)
    ? (value as SubmissionStatus)
    : null;
}

/** A datetime-local string with no zone is stored as written, not converted. */
function timestampOrNull(value: string): string | null {
  if (value === "") return null;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) ? value : null;
}

function revalidateDistribution(slug: string): void {
  revalidatePath("/admin/releases");
  revalidatePath("/admin/distribution");
  revalidatePath("/admin");
  if (slug) revalidatePath(`/admin/releases/${slug}`);
}

export async function createSubmissionAction(
  _prev: AdminFormState,
  fd: FormData,
): Promise<AdminFormState> {
  const releaseId = str(fd, "release_id");
  const releaseSlug = str(fd, "release_slug");
  const distributorId = str(fd, "distributor_id");
  const session = await requireEditor(`/admin/releases/${releaseSlug}`);

  if (distributorId === "") return fail("Choose the distributor this record is for.", "distributor_id");

  const sb = await createSupabaseServerClient();
  if (!sb) {
    return fail(
      "No database is connected, so no submission can be recorded. Nothing is remembered locally.",
    );
  }

  const { data: distributor, error: dError } = await sb
    .from("distributors")
    .select("id,name,delivery_mode,api_connected")
    .eq("id", distributorId)
    .maybeSingle();
  if (dError) return databaseFail(dError);
  if (!distributor) return fail("That distributor is not in the list.");

  const mode =
    distributor.api_connected && distributor.delivery_mode === "api" ? "api" : "manual";

  const { data, error } = await sb
    .from("distribution_submissions")
    .insert({
      release_id: releaseId,
      distributor_id: distributorId,
      // 'prepared' is the only state a fresh record may start in: it means the
      // admin intends to submit, which is true by construction. Anything beyond
      // that needs the evidence the update action asks for.
      status: "prepared",
      delivery_mode: mode,
      api_verified: false,
      external_ref: nullable(str(fd, "external_ref")),
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (error) return databaseFail(error);

  await sb.rpc("record_audit", {
    actor: session.userId,
    action: "submission.created",
    entity: "distribution_submissions",
    entity_id: String(data.id),
    detail: { release: releaseSlug, distributor: String(distributor.name) },
  });

  revalidateDistribution(releaseSlug);
  return ok(
    `Record created for ${String(distributor.name)} at status "prepared". This says nothing has been delivered yet — update the record with evidence when the distributor tells you otherwise.`,
  );
}

export async function updateSubmissionStatusAction(
  _prev: AdminFormState,
  fd: FormData,
): Promise<AdminFormState> {
  const id = str(fd, "submission_id");
  const releaseSlug = str(fd, "release_slug");
  const session = await requireEditor(`/admin/releases/${releaseSlug}`);

  if (id === "") return fail("This form is missing the submission it belongs to.");

  const status = asStatus(str(fd, "status"));
  if (!status) {
    return fail(
      `Unknown status "${str(fd, "status")}". The allowed states are ${SUBMISSION_STATUSES.join(", ")}.`,
      "status",
    );
  }

  const submittedAt = timestampOrNull(str(fd, "submitted_at"));
  const firstLiveAt = timestampOrNull(str(fd, "first_live_at"));
  const reason = str(fd, "rejected_reason");
  const evidence = bool(fd, "evidence");

  const problem = firstProblem([
    status === "prepared"
      ? null
      : submittedAt === null
        ? status === "scheduled"
          ? 'Pick the "scheduled at" date and time shown by the distributor.'
          : 'Enter the submission date and time shown by the distributor — the database requires it before a record can leave "prepared".'
        : null,
    status === "live" && firstLiveAt === null
      ? "A record cannot be marked live without the moment you saw it playing. Enter the date and time you checked."
      : null,
    status === "rejected" && reason === ""
      ? "A rejection needs the distributor's stated reason. Without it, nobody later can tell a policy problem from a metadata problem."
      : null,
    CLAIM_STATUSES.includes(status) && !evidence
      ? "Tick the confirmation line: this site only records that a release reached a store when a named person has actually looked."
      : null,
  ]);
  if (problem) return fail(problem, "evidence");

  const sb = await createSupabaseServerClient();
  if (!sb) return fail("No database is connected, so this cannot be recorded.");

  const { data, error } = await sb
    .from("distribution_submissions")
    .update({
      status,
      submitted_at: status === "prepared" ? null : submittedAt,
      first_live_at: status === "live" ? firstLiveAt : null,
      rejected_reason: status === "rejected" ? reason : null,
      external_ref: nullable(str(fd, "external_ref")) ?? undefined,
      // The human assertion. Both columns together are what the
      // claims_must_be_backed constraint accepts as evidence.
      confirmed_by: CLAIM_STATUSES.includes(status) ? session.userId : null,
      confirmed_at: CLAIM_STATUSES.includes(status)
        ? new Date().toISOString()
        : null,
      takedown_requested: bool(fd, "takedown_requested"),
    })
    .eq("id", id)
    .select("id,status,api_verified")
    .single();
  if (error) return databaseFail(error);

  await sb.rpc("record_audit", {
    actor: session.userId,
    action: "submission.status",
    entity: "distribution_submissions",
    entity_id: String(data.id),
    detail: { to: status, release: releaseSlug },
  });

  revalidateDistribution(releaseSlug);
  return ok(
    data.api_verified
      ? `Recorded as ${status}. This row also carries an API verification, which came from a webhook, not from this form.`
      : `Recorded as ${status}, confirmed by your account. Anyone reading this release sees who confirmed it and when.`,
  );
}

export async function deleteSubmissionAction(
  _prev: AdminFormState,
  fd: FormData,
): Promise<AdminFormState> {
  const releaseSlug = str(fd, "release_slug");
  const session = await requireAdmin(`/admin/releases/${releaseSlug}`);

  const id = str(fd, "submission_id");
  if (id === "") return fail("This form is missing the submission to delete.");
  if (!bool(fd, "confirm_delete")) {
    return fail("Nothing was deleted. Tick the confirmation box first.");
  }

  const sb = await createSupabaseServerClient();
  if (!sb) return fail("No database is connected.");

  const { data, error } = await sb
    .from("distribution_submissions")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return databaseFail(error);

  await sb.rpc("record_audit", {
    actor: session.userId,
    action: "submission.deleted",
    entity: "distribution_submissions",
    entity_id: id,
    detail: { release: releaseSlug },
  });
  revalidateDistribution(releaseSlug);
  return ok(
    data && data.length > 0
      ? "Submission record deleted. Its status history went with it, because the history rows belong to that record."
      : "No matching record was deleted.",
  );
}
