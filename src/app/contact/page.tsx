import type { Metadata } from "next";
import { getArtistProfile } from "@/lib/content";
import { buildMetadata, CORE_KEYWORDS } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildGraph, personNode, breadcrumbNode } from "@/lib/seo/jsonld";
import { PageHeader } from "@/components/ui/PageHeader";
import { ContactForm } from "@/components/forms/ContactForm";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Contact — Bookings, Press & Licensing",
    description: `Book ${SITE.shortName} for shows, festivals and events. Collaboration, production, beat licensing, press and business enquiries from Kasese, Uganda.`,
    path: "/contact",
    keywords: [
      ...CORE_KEYWORDS,
      "REX KENNY booking",
      "book REX KENNY Uganda",
      "African Dancehall booking East Africa",
    ],
  });
}

const KINDS = [
  { value: "booking", label: "Booking & performances" },
  { value: "collaboration", label: "Collaboration" },
  { value: "production", label: "Production services" },
  { value: "beat-licence", label: "Beat licensing" },
  { value: "press", label: "Press & media" },
  { value: "business", label: "Business" },
];

export default async function ContactPage() {
  const { data: artist } = await getArtistProfile();

  return (
    <>
      <JsonLd
        data={buildGraph([
          personNode(artist),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Contact", path: "/contact" },
          ]),
        ])}
      />

      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Contact", path: "/contact" },
        ]}
        title="Contact & Bookings"
        lede={`Promoters, journalists, artists and labels — this is the direct route to ${SITE.shortName}'s desk.`}
      />

      <div className="container-page grid gap-12 py-14 lg:grid-cols-[1.5fr_1fr]">
        <ContactForm kinds={KINDS} />

        <aside className="space-y-6">
          <div className="rounded-lg border border-charcoal bg-ink-raised p-6">
            <h2 className="eyebrow">Based in</h2>
            <p className="mt-2 font-[family-name:var(--font-display)] text-2xl">
              {SITE.city}
            </p>
            <p className="text-smoke">{SITE.country} — available for travel across East Africa and internationally.</p>
          </div>

          <div className="rounded-lg border border-charcoal bg-ink-raised p-6 text-sm">
            <h2 className="eyebrow">Direct</h2>
            <dl className="mt-3 space-y-2">
              <div>
                <dt className="text-smoke">Bookings</dt>
                <dd className="text-mist">
                  {artist.bookingEmail ?? "Not published yet — set it in the admin Artist profile."}
                </dd>
              </div>
              <div>
                <dt className="text-smoke">Press</dt>
                <dd className="text-mist">
                  {artist.pressEmail ?? "Not published yet — set it in the admin Artist profile."}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-charcoal bg-ink-raised p-6 text-sm leading-relaxed text-smoke">
            <h2 className="eyebrow">Response times</h2>
            <p className="mt-3">
              Enquiries sent through this form are stored in the artist’s private
              dashboard. There is no automated reply and no guarantee of a specific
              turnaround — dates and fees are confirmed by a human, in writing, before
              anything is treated as booked.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
