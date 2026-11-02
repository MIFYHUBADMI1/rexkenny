/**
 * Renders schema.org JSON-LD. `dangerouslySetInnerHTML` is safe here because
 * the payload is produced by our own builders and re-escaped below; the
 * escape also blocks `</script>` breakout from any admin-entered string.
 */
function withContext(data: unknown): unknown {
  if (
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    !("@context" in (data as Record<string, unknown>))
  ) {
    return { "@context": "https://schema.org", ...(data as Record<string, unknown>) };
  }
  return data;
}

export function JsonLd({ data }: { data: unknown }) {
  const json = JSON.stringify(withContext(data)).replace(
    /[<>&]/g,
    (c) => ({ "<": "\\u003c", ">": "\\u003e", "&": "\\u0026" })[c] as string,
  );
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
