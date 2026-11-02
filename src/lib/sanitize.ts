import sanitize from "sanitize-html";

/**
 * Admin-authored rich text is untrusted input rendered on public pages.
 * Allow-list only what a journalist-style editor actually produces: no
 * scripts, iframes, styles, form elements or event handler attributes.
 */
const OPTIONS: sanitize.IOptions = {
  allowedTags: [
    "p", "br", "strong", "em", "b", "i", "u", "s", "sup", "sub",
    "h2", "h3", "h4", "h5",
    "ul", "ol", "li",
    "blockquote", "cite", "pre", "code",
    "a", "img", "figure", "figcaption",
    "table", "thead", "tbody", "tr", "th", "td",
    "hr", "span",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    th: ["colspan", "rowspan", "scope"],
    td: ["colspan", "rowspan"],
    ol: ["start"],
    span: [],
    code: [],
  },
  allowedSchemes: ["https", "mailto", "tel"],
  allowProtocolRelative: false,
  transformTags: {
    // Never let editor-pasted markup become a tabnabbing or tracking vector.
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        ...(attribs.target === "_blank" ? { rel: "noopener noreferrer" } : {}),
      },
    }),
    // Force lazy loading on every embedded image (Core Web Vitals).
    img: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, loading: attribs.loading ?? "lazy" },
    }),
  },
  disallowedTagsMode: "recursiveEscape",
  enforceHtmlBoundary: true,
};

export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return "";
  return sanitize(dirty, OPTIONS);
}
