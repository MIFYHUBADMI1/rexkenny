import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapRelease, type Row } from "@/lib/content";
import type { Release } from "@/lib/types";

/**
 * Admin-side reads. The public data layer (src/lib/content.ts) filters to
 * `status = 'released'` because that is all a visitor may see; the dashboard
 * needs every state, which the `releases: staff read all` policy in 0003
 * allows and nothing in this file decides.
 */
export type Query<T> =
  | { ok: true; data: T }
  | { ok: false; offline: boolean; message: string };

const failed = (message: string, offline = false): Query<never> => ({
  ok: false,
  offline,
  message,
});

/** Postgres/PostgREST messages are technical; the dashboard gets a plain one. */
function describeError(error: { code?: string; message?: string }): string {
  if (error.code === "42501") {
    return "The database refused this read. Your role does not cover it.";
  }
  if (error.code === "PGRST205" || /does not exist|not find the table/i.test(error.message ?? "")) {
    return "The catalogue tables are missing. Apply the migrations in supabase/migrations.";
  }
  return `The database could not be reached (${error.code ?? "unknown"}). Nothing here is estimated in its place.`;
}

const RELEASE_SELECT = "*, tracks(*), streaming_links(*)";

export async function listReleasesForAdmin(): Promise<Query<Release[]>> {
  const sb = await createSupabaseServerClient();
  if (!sb) {
    return failed(
      "No database is connected, so there are no releases to list.",
      true,
    );
  }
  const { data, error } = await sb
    .from("releases")
    .select(RELEASE_SELECT)
    .order("updated_at", { ascending: false });
  if (error) return failed(describeError(error));
  return { ok: true, data: (data ?? []).map((r) => mapRelease(r as Row)) };
}

export async function getReleaseForAdmin(
  slug: string,
): Promise<Query<Release | null>> {
  const sb = await createSupabaseServerClient();
  if (!sb) {
    return failed("No database is connected, so this release cannot be read.", true);
  }
  const { data, error } = await sb
    .from("releases")
    .select(RELEASE_SELECT)
    .eq("slug", slug)
    .maybeSingle();
  if (error) return failed(describeError(error));
  return { ok: true, data: data ? mapRelease(data as Row) : null };
}

export async function getReleaseByIdForAdmin(
  id: string,
): Promise<Query<Release | null>> {
  const sb = await createSupabaseServerClient();
  if (!sb) return failed("No database is connected.", true);
  const { data, error } = await sb
    .from("releases")
    .select(RELEASE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) return failed(describeError(error));
  return { ok: true, data: data ? mapRelease(data as Row) : null };
}

export type Distributor = {
  id: string;
  code: string;
  name: string;
  website: string | null;
  deliveryMode: "manual" | "api" | "sftp" | "none";
  apiConnected: boolean;
  requiresIsrc: boolean;
  requiresUpc: boolean;
  minArtworkPx: number;
  supportedTerritories: string[];
  notes: string | null;
  active: boolean;
};

export async function listDistributors(): Promise<Query<Distributor[]>> {
  const sb = await createSupabaseServerClient();
  if (!sb) return failed("No database is connected.", true);
  const { data, error } = await sb
    .from("distributors")
    .select("*")
    .eq("active", true)
    .order("name");
  if (error) return failed(describeError(error));
  return {
    ok: true,
    data: (data ?? []).map((d) => ({
      id: String(d.id),
      code: String(d.code),
      name: String(d.name),
      website: (d.website as string | null) ?? null,
      deliveryMode: (d.delivery_mode as Distributor["deliveryMode"]) ?? "manual",
      apiConnected: Boolean(d.api_connected),
      requiresIsrc: Boolean(d.requires_isrc),
      requiresUpc: Boolean(d.requires_upc),
      minArtworkPx: Number(d.min_artwork_px ?? 1400),
      supportedTerritories: Array.isArray(d.supported_territories)
        ? (d.supported_territories as string[])
        : [],
      notes: (d.notes as string | null) ?? null,
      active: Boolean(d.active),
    })),
  };
}

export type SubmissionRow = {
  id: string;
  distributorId: string;
  distributorName: string;
  status: string;
  apiVerified: boolean;
  confirmedBy: string | null;
  confirmedAt: string | null;
  submittedAt: string | null;
  firstLiveAt: string | null;
  rejectedReason: string | null;
  externalRef: string | null;
  deliveryMode: string;
};

/**
 * Reads a release's submission rows. They are shown exactly as recorded:
 * `api_verified` and `confirmed_by` decide whether the UI may call a state
 * fact or an intention.
 */
export async function listSubmissions(
  releaseId: string,
): Promise<Query<SubmissionRow[]>> {
  const sb = await createSupabaseServerClient();
  if (!sb) return failed("No database is connected.", true);
  const { data, error } = await sb
    .from("distribution_submissions")
    .select("*, distributors(name)")
    .eq("release_id", releaseId);
  if (error) return failed(describeError(error));
  return {
    ok: true,
    data: (data ?? []).map((d) => {
      const row = d as Row;
      const distributor = (row.distributors as Row | null) ?? null;
      return {
        id: String(row.id),
        distributorId: String(row.distributor_id),
        distributorName: distributor ? String(distributor.name) : String(row.distributor_id),
        status: String(row.status),
        apiVerified: Boolean(row.api_verified),
        confirmedBy: (row.confirmed_by as string | null) ?? null,
        confirmedAt: (row.confirmed_at as string | null) ?? null,
        submittedAt: (row.submitted_at as string | null) ?? null,
        firstLiveAt: (row.first_live_at as string | null) ?? null,
        rejectedReason: (row.rejected_reason as string | null) ?? null,
        externalRef: (row.external_ref as string | null) ?? null,
        deliveryMode: String(row.delivery_mode ?? "manual"),
      };
    }),
  };
}

/**
 * Every submission across the catalogue, for the distribution overview.
 * `confirmed_by` is an auth.users id and this table has no FK to `profiles`, so
 * the confirmer is reported as "a named account" plus the timestamp instead of
 * an email this read cannot prove.
 */
export async function listAllSubmissions(): Promise<
  Query<
    (SubmissionRow & {
      releaseId: string;
      releaseSlug: string;
      releaseTitle: string;
    })[]
  >
> {
  const sb = await createSupabaseServerClient();
  if (!sb) return failed("No database is connected.", true);
  const { data, error } = await sb
    .from("distribution_submissions")
    .select("*, distributors(name), releases(id,slug,title)")
    .order("updated_at", { ascending: false });
  if (error) return failed(describeError(error));
  return {
    ok: true,
    data: (data ?? []).map((d) => {
      const row = d as Row;
      const distributor = (row.distributors as Row | null) ?? null;
      const release = (row.releases as Row | null) ?? null;
      return {
        id: String(row.id),
        distributorId: String(row.distributor_id),
        distributorName: distributor
          ? String(distributor.name)
          : String(row.distributor_id),
        releaseId: release ? String(release.id) : String(row.release_id),
        releaseSlug: release ? String(release.slug) : "",
        releaseTitle: release ? String(release.title) : "(release not returned)",
        status: String(row.status),
        apiVerified: Boolean(row.api_verified),
        confirmedBy: (row.confirmed_by as string | null) ?? null,
        confirmedAt: (row.confirmed_at as string | null) ?? null,
        submittedAt: (row.submitted_at as string | null) ?? null,
        firstLiveAt: (row.first_live_at as string | null) ?? null,
        rejectedReason: (row.rejected_reason as string | null) ?? null,
        externalRef: (row.external_ref as string | null) ?? null,
        deliveryMode: String(row.delivery_mode ?? "manual"),
      };
    }),
  };
}

export type ExportRecord = {
  id: string;
  format: string;
  fileName: string;
  createdAt: string;
  checksum: string | null;
};

/**
 * Documents this site generated for a release, so the admin can see which file
 * was produced, when, and the checksum identifying those bytes.
 */
export async function listExportsForRelease(
  releaseId: string,
): Promise<Query<ExportRecord[]>> {
  const sb = await createSupabaseServerClient();
  if (!sb) return failed("No database is connected.", true);
  const { data, error } = await sb
    .from("release_metadata_exports")
    .select("id,format,file_name,checksum_sha256,created_at")
    .eq("release_id", releaseId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return failed(describeError(error));
  return {
    ok: true,
    data: (data ?? []).map((e) => ({
      id: String(e.id),
      format: String(e.format),
      fileName: String(e.file_name),
      createdAt: String(e.created_at),
      checksum: (e.checksum_sha256 as string | null) ?? null,
    })),
  };
}

/** The roster artist new releases belong to. Seeded in 0010. */
export async function getArtistRowId(): Promise<Query<string>> {
  const sb = await createSupabaseServerClient();
  if (!sb) return failed("No database is connected.", true);
  const { data, error } = await sb
    .from("artists")
    .select("id,slug,name")
    .eq("slug", "rex-kenny")
    .maybeSingle();
  if (error) return failed(describeError(error));
  if (!data) {
    return failed("No artist row exists. Apply migration 0010, which seeds REX KENNY.");
  }
  return { ok: true, data: String(data.id) };
}

export async function listGenres(): Promise<Query<{ slug: string; name: string }[]>> {
  const sb = await createSupabaseServerClient();
  if (!sb) return failed("No database is connected.", true);
  const { data, error } = await sb
    .from("genres")
    .select("slug,name")
    .order("sort_order");
  if (error) return failed(describeError(error));
  return {
    ok: true,
    data: (data ?? []).map((g) => ({
      slug: String(g.slug),
      name: String(g.name),
    })),
  };
}
