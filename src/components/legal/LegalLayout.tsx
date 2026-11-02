import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildGraph, webPageNode, breadcrumbNode } from "@/lib/seo/jsonld";
import { PageHeader } from "@/components/ui/PageHeader";
import { SITE } from "@/lib/site";

export function LegalLayout({
  title,
  updated,
  intro,
  sections,
  path,
}: {
  title: string;
  updated: string;
  intro: string;
  path: string;
  sections: { heading: string; body: string[] }[];
}) {
  const crumbs = [
    { name: "Home", path: "/" },
    { name: title, path },
  ];

  return (
    <>
      <JsonLd
        data={buildGraph([
          webPageNode({ name: title, description: intro, path, updated }),
          breadcrumbNode(crumbs),
        ])}
      />

      <PageHeader crumbs={crumbs} title={title} lede={intro} />
      <div className="container-page max-w-3xl py-14">
            <p className="text-xs text-smoke">Last updated: {updated}</p>
            <div className="mt-8 space-y-9">
              {sections.map((s) => (
                <section key={s.heading}>
                  <h2 className="text-lg font-semibold text-gold">{s.heading}</h2>
                  {s.body.map((p, i) => (
                    <p key={i} className="mt-3 text-sm leading-relaxed text-smoke">
                      {p}
                    </p>
                  ))}
                </section>
              ))}
            </div>
            <p className="mt-12 border-t border-charcoal pt-6 text-xs leading-relaxed text-smoke">
              These documents are published templates for {SITE.legalName}. Have them
              reviewed against Uganda’s Data Protection Act 2019 and the law of any
              territory you actually release into before you rely on them.
            </p>
      </div>
    </>
  );
}

export function legalMeta(title: string, path: string, description: string): Metadata {
  return buildMetadata({ title, description, path, noindex: false });
}
