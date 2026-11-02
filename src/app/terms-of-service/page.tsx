import { LegalLayout, legalMeta } from "@/components/legal/LegalLayout";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return legalMeta(
    "Terms of Service",
    "/terms-of-service",
    `The rules for using ${SITE.url} — content ownership, permitted use, enquiries, availability and governing law in Uganda.`,
  );
}

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      path="/terms-of-service"
      updated="2026-10-30"
      intro={`By using ${SITE.url} you agree to these terms.`}
      sections={[
        {
          heading: "The site",
          body: [
            `${SITE.legalName} provides this website for information, listening and enquiry handling. We may change or remove any part of it at any time.`,
            "We aim to keep it available but do not promise uninterrupted operation.",
          ],
        },
        {
          heading: "Content and ownership",
          body: [
            `All music, lyrics, artwork, photographs and text on this site belong to ${SITE.shortName} or the credited rights holders.`,
            "You may listen, share links and quote short extracts with attribution for press or commentary. You may not re-upload audio or video, scrape the catalogue, mirror this site, or use content commercially without written permission.",
          ],
        },
        {
          heading: "Enquiries and bookings",
          body: [
            "Sending a form does not create a contract. Availability, fees and technical requirements are agreed in writing before a performance, licence or production engagement is confirmed.",
            "You must submit accurate details and only send enquiries you are authorised to make.",
          ],
        },
        {
          heading: "Third-party links",
          body: [
            "Streaming platforms, social networks and video hosts are third-party services with their own terms and privacy practices. We are not responsible for their content or conduct.",
          ],
        },
        {
          heading: "Accuracy",
          body: [
            "Biography, credits, release dates and catalogue entries are maintained by the artist's team. If something is wrong, tell us through the contact page and we will correct it.",
            "We do not publish unverified statistics, awards or endorsements.",
          ],
        },
        {
          heading: "Liability",
          body: [
            "To the extent allowed by law, we are not liable for indirect losses arising from use of the site. Nothing here limits liability for fraud or wilful misconduct.",
          ],
        },
        {
          heading: "Governing law",
          body: [
            `These terms are governed by the laws of ${SITE.countryName}. Disputes fall to the courts of ${SITE.country}.`,
          ],
        },
      ]}
    />
  );
}
