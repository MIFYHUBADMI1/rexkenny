import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { integrationStates, isSupabaseConfigured } from "@/lib/config";
import { STATUS_LABEL } from "@/lib/admin/readiness";
import { NAV, SITE } from "@/lib/site";
import type { ReleaseStatus } from "@/lib/types";

/**
 * The assistant's grounding. Everything the model is told about the catalogue
 * comes from the database at request time — the prompt never carries numbers
 * the site cannot prove, matching the rule the rest of the dashboard lives by.
 */

export type CatalogueSnapshot = {
  available: boolean;
  summary: string;
};

export async function buildCatalogueSnapshot(): Promise<CatalogueSnapshot> {
  if (!isSupabaseConfigured) {
    return {
      available: false,
      summary:
        "No database is connected on this deployment, so there is no catalogue to describe. Say so plainly if asked.",
    };
  }
  const sb = await createSupabaseServerClient();
  if (!sb) {
    return { available: false, summary: "The database could not be reached for this answer." };
  }

  const { data, error } = await sb
    .from("releases")
    .select("slug,title,status,release_type,release_date,genre,subgenre,language,updated_at")
    .order("updated_at", { ascending: false })
    .limit(60);

  if (error || !data) {
    return {
      available: false,
      summary:
        "The releases table could not be read (it may be missing — the migrations in supabase/migrations may not be applied).",
    };
  }

  const lines = (data as Record<string, unknown>[]).map((r) => {
    const status = String(r.status ?? "unknown");
    const label =
      STATUS_LABEL[status as ReleaseStatus] ?? status.replace(/[-_]/g, " ");
    const parts = [
      `- "${String(r.title)}" (${String(r.slug)})`,
      `type ${String(r.release_type ?? "?")}`,
      `status: ${label}`,
      r.release_date ? `date ${String(r.release_date).slice(0, 10)}` : "no confirmed date",
      `genre ${String(r.genre ?? "?")}`,
      r.subgenre ? `subgenre ${String(r.subgenre)}` : null,
      r.language ? `language ${String(r.language)}` : null,
    ].filter(Boolean);
    return parts.join(", ");
  });

  const byStatus = new Map<string, number>();
  for (const r of data as Record<string, unknown>[]) {
    const s = String(r.status ?? "unknown");
    byStatus.set(s, (byStatus.get(s) ?? 0) + 1);
  }
  const counts = [...byStatus.entries()]
    .map(([s, n]) => `${n} ${STATUS_LABEL[s as ReleaseStatus] ?? s}`)
    .join(", ");

  return {
    available: true,
    summary: `The catalogue currently holds ${data.length} release row(s): ${counts || "none"}.\n${lines.join("\n") || "(no releases yet)"}`,
  };
}

export function buildSystemPrompt(snapshot: CatalogueSnapshot): string {
  const integrations = integrationStates()
    .map((s) => `- ${s.label}: ${s.configured ? "configured" : `NOT configured (${s.action})`}`)
    .join("\n");

  return `You are the built-in assistant inside the REX KENNY MUSIC admin dashboard — the official artist platform for REX KENNY, a Ugandan artist from Kasese. You help staff (admins, editors, marketing) run the site.

HOW THIS SITE WORKS — facts you can rely on:
- Releases move through statuses: draft, in-preparation, metadata-review, artwork-review, ready-for-distribution, then submitted/processing/scheduled/released, with rejected and needs-correction as repair states. Only draft-side statuses can be set by hand; submitted/processing/released are asserted by the distribution record, never typed in.
- The public site only shows releases at status "released". Everything else is invisible to visitors.
- The dashboard lives at /admin with modules: Overview, Releases, Add music, Distribution, SEO, and this Assistant. Media, Pages & posts, Fans, Enquiries, Newsletter, Analytics and Trends are listed but not built yet.
- Release metadata is strict: no invented ISRCs, UPCs, dates, or metrics. A field left empty stays empty — that is deliberate.
- AI copy assist can draft a release description and artwork alt text from the release form, and SEO title/description from the "Search appearance" panel on a release page. It fills fields for the human to review; nothing is saved until they press save.
- Distribution states require evidence: a verified API response or a named human confirmation. The assistant must never claim a release is live on a store unless the catalogue data says so.

CURRENT INTEGRATIONS (from this deployment's environment):
${integrations}

CURRENT CATALOGUE SNAPSHOT (live database read for this answer):
${snapshot.summary}

YOUR JOB:
- Answer questions about the catalogue, the admin workflow, and how to get the site working, using the snapshot above. If the snapshot is unavailable, say the database could not be read rather than guessing.
- For first-time admins: if the conversation has no history yet, greet them briefly and offer a short onboarding path — check /admin/setup for missing integrations, create the first release at /admin/releases/new, use the AI copy assist on that form, upload music at /admin/music, and record distribution honestly. Walk them through ONE step at a time when they say they are new; do not dump everything at once.
- Be concise and practical. Plain text, short paragraphs or simple lists. No markdown tables.
- Never invent facts about streams, revenue, press, awards or release dates. If you do not know, say so.`;
}

/**
 * The visitor-facing prompt for the floating site helper. It knows only what
 * the public site already publishes — artist identity and the page map — and is
 * deliberately kept away from catalogue internals, integrations and admin
 * workflow so an anonymous caller cannot probe the dashboard through it.
 */
export function buildPublicHelpPrompt(): string {
  const pages = NAV.map(
    (n) => `- ${n.label}: ${SITE.url}${n.href === "/" ? "/" : n.href}`,
  ).join("\n");
  return `You are the helpful assistant on the official website of ${SITE.name} — ${SITE.artist}, ${SITE.role.toLowerCase()} from ${SITE.city}, ${SITE.countryName}. Tagline: "${SITE.tagline}"

WHAT VISITORS CAN DO HERE:
${pages}
- /music lists releases; /videos has official videos; /lyrics has lyric pages; /listen collects store links; /beats lists beats for licensing; /epk is the electronic press kit; /contact takes booking, press, collaboration and licence enquiries.

YOUR JOB:
- Answer visitor questions about the artist, the music, and how to use the site. Be warm, brief and practical.
- For bookings, press, features or beat licences, point them to /contact — you cannot take enquiries yourself.
- If asked where to stream the music, suggest /listen, which lists the official store links.
- You do NOT know live stats (streams, chart positions, future release dates). Never invent them — say the site does not publish them.
- Never discuss admin workflows, integrations, staff, or anything not on the public pages. If asked, say that is internal to the team.
- Reply in plain text, short paragraphs or simple lists. No markdown tables.`;
}
