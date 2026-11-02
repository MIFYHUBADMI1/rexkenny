import type { Metadata } from "next";
import Link from "next/link";
import { Disc3, Plus } from "lucide-react";
import { buildMetadata } from "@/lib/seo/metadata";
import { requireStaff } from "@/lib/auth/session";
import { listReleasesForAdmin } from "@/lib/admin/catalogue";
import { DataTable, StatusChip } from "@/components/admin/ui";
import { OfflineNotice } from "@/components/admin/OfflineNotice";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Releases",
    description: "Catalogue workflow for every release held in the admin.",
    path: "/admin/releases",
    noindex: true,
  });
}

/**
 * The catalogue list. Counts come from the rows this deployment's database
 * actually holds; when the tables are missing the page says so instead of
 * showing an empty table, which would read as "no releases".
 */
export default async function ReleasesPage() {
  const session = await requireStaff("/admin/releases");
  const result = await listReleasesForAdmin();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black">
            Releases
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-smoke">
            Draft to released, with the readiness checklist a distributor&apos;s
            submission will be measured against. Signed in as{" "}
            <span className="text-mist">{session.email ?? "an account without an email"}</span>.
          </p>
        </div>
        <Link href="/admin/releases/new" className="btn-gold">
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          New release
        </Link>
      </header>

      {!result.ok ? (
        <OfflineNotice offline={result.offline} message={result.message} />
      ) : result.data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ash p-8 text-center">
          <Disc3 className="mx-auto h-8 w-8 text-smoke" aria-hidden />
          <p className="mt-3 text-sm text-mist">
            The database has no releases yet.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-smoke">
            This is a fact about your catalogue, not a loading state. Create the
            first one and the public music page will stay empty until it is
            marked released.
          </p>
        </div>
      ) : (
        <DataTable
          head={["Release", "State", "Readiness", "Tracks", "Date", "Last edited"]}
        >
          {result.data.map((r) => (
            <tr
              key={r.id}
              className="border-b border-charcoal transition-colors last:border-0 hover:bg-ink-raised"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/admin/releases/${r.slug}`}
                  className="text-sm font-medium text-paper hover:text-gold"
                >
                  {r.title}
                </Link>
                <span className="mt-1 block text-xs text-smoke">
                  {r.releaseType} · /music/{r.slug}
                  {r.artistName ? ` · ${r.artistName}` : ""}
                </span>
              </td>
              <td className="px-4 py-3">
                <StatusChip status={r.status} />
              </td>
              <td className="px-4 py-3 text-sm text-mist">
                {r.readinessScore === null ? (
                  <span className="text-xs text-smoke">not evaluated</span>
                ) : (
                  `${Number(r.readinessScore)}%`
                )}
              </td>
              <td className="px-4 py-3 text-sm text-mist">{r.tracks.length}</td>
              <td className="px-4 py-3 text-sm text-mist">
                {r.releaseDate ?? (
                  <span className="text-xs text-smoke">no date set</span>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-smoke">
                {new Date(r.updatedAt).toLocaleString("en-GB", {
                  timeZone: "Africa/Kampala",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                (Kampala)
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <p className="text-xs leading-relaxed text-smoke">
        Readiness scores are recorded when an admin presses “Record score” on a
        release. They are not updated automatically, so a score can be older than
        the data behind it — open the release to see the live calculation.
      </p>
    </div>
  );
}
