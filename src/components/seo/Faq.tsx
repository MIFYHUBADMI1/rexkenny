import { JsonLd } from "@/components/seo/JsonLd";
import { faqNode } from "@/lib/seo/jsonld";
import type { FaqItem } from "@/lib/seo/faq";

/**
 * Renders the questions as text people can read, and the identical list as
 * FAQPage markup. Both come from one array and this one component, so the
 * structured data cannot claim an answer the page does not print — which is the
 * usual way FAQ markup turns into spam.
 */
export function Faq({
  items,
  path,
  heading = "Questions about this page",
}: {
  items: FaqItem[];
  path: string;
  heading?: string;
}) {
  if (items.length === 0) return null;

  return (
    <>
      <JsonLd data={faqNode(items, path)} />
      <section className="mt-12" aria-labelledby="faq-heading">
        <h2
          id="faq-heading"
          className="font-[family-name:var(--font-display)] text-xl font-bold text-paper"
        >
          {heading}
        </h2>
        <dl className="mt-4 divide-y divide-charcoal rounded-lg border border-charcoal">
          {items.map((f) => (
            <div key={f.question} className="px-4 py-3.5">
              <dt className="text-sm font-semibold text-mist">{f.question}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-smoke">{f.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
