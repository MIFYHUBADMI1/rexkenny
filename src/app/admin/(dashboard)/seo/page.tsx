import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, TriangleAlert } from "lucide-react";
import { buildMetadata } from "@/lib/seo/metadata";
import { requireStaff } from "@/lib/auth/session";
import { auditSite, type SeoRow } from "@/lib/admin/seoAudit";
import { DataTable, Panel } from "@/components/admin/ui";
import { OfflineNotice } from "@/components/admin/OfflineNotice";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "SEO",
    description: "Search appearance, index controls and structured-data validation.",
    path: "/admin/seo",
    noindex: true,
  });
}

const KIND_LABEL: Record<SeoRow["kind"], string> = {
  release: "Releases",
  video: "Videos",
  post: "News posts",
  lyric: "Lyrics",
};

function StateIcon({ state }: { state: "ok" | "warn" | "fail" }) {
  if (state === "ok") {
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />;
  }
  const Icon = state === "fail" ? AlertTriangle : TriangleAlert;
  return <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${state === "fail" ? "text-blood" : "text-mist"}`} aria-hidden />;
}

function RowList({ rows }: { rows: SeoRow[] }) {
  return (
    <DataTable
      head={["Page", "Title a crawler sees", "Snippet", "Index", "Findings"]}
    >
      {rows.map((r) => (
        <tr key={r.path} className="border-b border-charcoal align-top last:border-0">
          <td className="px-4 py-3">
            <span className="block break-all text-sm text-paper">{r.path}</span>
            <span className="mt-1 block text-xs text-smoke">{r.label}</span>
            {r.editHref ? (
              <Link
                href={r.editHref}
                className="mt-2 inline-block text-xs text-mist underline underline-offset-4 hover:text-gold"
              >
                Edit
              </Link>
            ) : null}
          </td>
          <td className="px-4 py-3">
            <span className="block text-sm leading-snug text-mist break-words">
              {r.renderedTitle}
            </span>
            <span className="mt-1 block text-[11px] uppercase tracking-[0.14em] text-smoke">
              {r.titleLength} chars
            </span>
          </td>
          <td className="px-4 py-3">
            <span className="block text-xs leading-relaxed text-smoke break-words">
              {r.description}
            </span>
            <span className="mt-1 block text-[11px] uppercase tracking-[0.14em] text-smoke">
              {r.descriptionLength} chars
              {r.usesSiteDefaultImage ? " · default share image" : ""}
            </span>
          </td>
          <td className="px-4 py-3">
            {r.noindex ? (
              <span className="text-xs uppercase tracking-[0.14em] text-blood">
                noindex
              </span>
            ) : (
              <span className="text-xs uppercase tracking-[0.14em] text-gold">index</span>
            )}
            <span className="mt-1 block break-all text-[11px] text-smoke">{r.canonical}</span>
          </td>
          <td className="px-4 py-3">
            {r.issues.length === 0 ? (
              <span className="text-xs text-smoke">nothing flagged</span>
            ) : (
              <ul className="space-y-1.5">
                {r.issues.map((issue, i) => (
                  <li key={i} className="text-xs leading-relaxed text-mist">
                    · {issue}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      ))}
    </DataTable>
  );
}

export default async function SeoPage() {
  await requireStaff("/admin/seo");
  const audit = await auditSite();

  const flagged = audit.rows.filter((r) => r.issues.length > 0);
  const indexed = audit.rows.filter((r) => !r.noindex);
  const byKind = (kind: SeoRow["kind"]) => audit.rows.filter((r) => r.kind === kind);

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Discovery</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black">
          SEO manager
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-smoke">
          Every value below is produced by the same functions the pages themselves
          use, so this is what a crawler sees rather than a second copy of it.
          Pages whose copy lives in source are listed but not editable here.
        </p>
      </header>

      {!audit.rows.length ? (
        <OfflineNotice
          offline={audit.offline}
          message={
            audit.message ??
            "There are no data-driven pages to audit yet. Create a release and its page, tags and sitemap entry appear here."
          }
        />
      ) : null}

      <Panel
        title="Site-wide checks"
        description="Configuration facts about how this deployment presents itself to search engines and AI answer engines."
      >
        <ul className="space-y-3">
          {audit.site.map((check) => (
            <li key={check.label} className="flex items-start gap-3">
              <StateIcon state={check.state} />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-paper">
                  {check.label}
                  <span className="ml-2 text-[11px] uppercase tracking-[0.16em] text-smoke">
                    {check.state}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-smoke">
                  {check.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="Inventory"
        description={`${audit.rows.length} data-driven page(s): ${indexed.length} indexable, ${
          audit.rows.length - indexed.length
        } excluded. ${flagged.length} page(s) carry at least one finding.`}
        aside={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/sitemap.xml"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost px-3 py-2 text-xs"
            >
              Sitemap
            </Link>
            <Link
              href="/robots.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost px-3 py-2 text-xs"
            >
              robots.txt
            </Link>
            <Link
              href="/llms.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost px-3 py-2 text-xs"
            >
              llms.txt
            </Link>
          </div>
        }
      >
        <p className="mb-5 text-xs leading-relaxed text-smoke">
          Canonical origin in use: <span className="text-mist">{SITE.url}</span>. If that
          is a localhost address, every URL listed below points somewhere a crawler
          cannot reach.
        </p>

        {(["release", "video", "post", "lyric"] as const).map((kind) => {
          const rows = byKind(kind);
          if (rows.length === 0) return null;
          return (
            <section key={kind} className="mb-8 last:mb-0">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-smoke">
                {KIND_LABEL[kind]} ({rows.length})
              </h3>
              <RowList rows={rows} />
            </section>
          );
        })}
      </Panel>

      <Panel
        title="Structured data"
        description="The JSON-LD objects each page serialises, walked node by node: types collected, URLs checked for absoluteness, dates checked for parsability."
      >
        {audit.structured.checked.length === 0 ? (
          <p className="text-sm text-smoke">
            Nothing to validate yet — there is no released record to build a graph from.
          </p>
        ) : (
          <ul className="space-y-4">
            {audit.structured.checked.map((page) => (
              <li key={page.page} className="rounded-lg border border-charcoal bg-ink p-4">
                <p className="text-sm font-medium text-paper break-all">{page.page}</p>
                <p className="mt-1 text-xs text-smoke">
                  {page.types.length > 0
                    ? `Types: ${page.types.join(", ")}`
                    : "No @type found in the graph."}
                </p>
                {page.errors.length === 0 ? (
                  <p className="mt-2 text-xs text-gold">
                    Parsed cleanly. Every URL is absolute and on this origin where it
                    should be.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {page.errors.slice(0, 8).map((e, i) => (
                      <li key={i} className="text-xs leading-relaxed text-blood">
                        · {e}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs leading-relaxed text-smoke">
          {audit.structured.note}
        </p>
      </Panel>

      <p className="text-xs leading-relaxed text-smoke">
        Titles and descriptions for the pages above are edited on the release screen
        under “Search appearance”. News, video and lyric copy comes from the tables the
        content module will expose; until that module exists, this screen reports what
        those pages emit instead of offering a control that writes nowhere.
      </p>
    </div>
  );
}
