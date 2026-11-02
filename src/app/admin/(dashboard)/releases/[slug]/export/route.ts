import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/session";
import { getReleaseForAdmin } from "@/lib/admin/catalogue";
import { buildExport, type ExportFormat } from "@/lib/admin/export";

export const dynamic = "force-dynamic";

/**
 * Metadata download for a release.
 *
 * Produces the sheet an editor carries to a distributor's own upload form. It
 * is metadata, not a delivery receipt — the file's own header says so — and the
 * row written here records only that this site generated the document, with a
 * checksum so the exact bytes can be recognised later.
 */
function safeFormat(value: string | null): ExportFormat {
  return value === "csv" ? "csv" : "json";
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const session = await requireStaff("/admin/releases");
  const { slug } = await context.params;
  const format = safeFormat(request.nextUrl.searchParams.get("format"));

  const result = await getReleaseForAdmin(slug);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: result.offline ? 503 : 500 },
    );
  }
  if (!result.data) {
    return NextResponse.json(
      { error: "No release with that address is visible to your role." },
      { status: 404 },
    );
  }

  const generatedAt = new Date().toISOString();
  const bundle = buildExport(result.data, format, generatedAt);
  const checksum = createHash("sha256").update(bundle.body, "utf8").digest("hex");

  const sb = await createSupabaseServerClient();
  if (sb) {
    // Recording the export is provenance, not a gate. If the insert fails the
    // file is still exactly what it claims to be, so it is served regardless.
    await sb.from("release_metadata_exports").insert({
      release_id: result.data.id,
      format,
      file_name: bundle.filename,
      payload:
        format === "json" ? JSON.parse(bundle.body) : null,
      row_count: result.data.tracks.length,
      checksum_sha256: checksum,
      generated_by: session.userId,
    });
  }

  return new NextResponse(bundle.body, {
    status: 200,
    headers: {
      "Content-Type": bundle.contentType,
      "Content-Disposition": `attachment; filename="${bundle.filename}"`,
      "Content-Length": String(Buffer.byteLength(bundle.body, "utf8")),
      "Cache-Control": "no-store",
      "X-Export-Checksum-Sha256": checksum,
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
