import { LegalLayout, legalMeta } from "@/components/legal/LegalLayout";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return legalMeta(
    "Copyright Policy",
    "/copyright-policy",
    `Copyright ownership, takedown process and repeat-infringement policy for ${SITE.legalName}, including music, lyrics, artwork and video.`,
  );
}

export default function CopyrightPage() {
  return (
    <LegalLayout
      title="Copyright Policy"
      path="/copyright-policy"
      updated="2026-10-30"
      intro={`${SITE.legalName} respects copyright and expects the same in return. This page explains ownership, how to report infringement and how counter-notices work.`}
      sections={[
        {
          heading: "What is owned here",
          body: [
            `Sound recordings and musical works performed or produced by ${SITE.shortName} are owned or controlled by ${SITE.legalName} unless a release page names a different copyright holder.`,
            "Lyrics published on this site are printed only where the writer or publisher has authorised publication, with credits shown on each lyrics page.",
            "Artwork and photographs are the property of the named creator and are licensed to this site.",
          ],
        },
        {
          heading: "Using this catalogue",
          body: [
            "Listening, sharing links and short attributed quotation for review, journalism or education are permitted.",
            "Re-uploading audio or video to streaming services, download sites or social platforms is not permitted without written permission. This includes distributing beats obtained from the site.",
            `Licensing enquiries go through ${SITE.url}/licensing.`,
          ],
        },
        {
          heading: "Reporting infringement on this site",
          body: [
            "Send a written notice through the contact page marked 'Copyright' containing: the work concerned, the exact URL, your relationship to the rights, a good-faith statement that the use is unauthorised, and your contact details.",
            "We review valid notices and unpublish the material while the claim is checked. We do not keep infringing content up to preserve a page rank.",
          ],
        },
        {
          heading: "Counter-notice",
          body: [
            "If you believe material was removed in error, reply with the URL, a statement of the facts and consent to the governing law stated below. We reinstate content that is legitimately ours to host.",
          ],
        },
        {
          heading: "Piracy elsewhere",
          body: [
            "Unauthorised copies of this catalogue appearing on other platforms are reported by the rights holders. Fans can help by reporting through the contact page rather than sharing leaks.",
          ],
        },
        {
          heading: "Governing law",
          body: [
            `Uganda's Copyright and Neighbouring Rights Act governs works created here; international treaties apply to overseas use. ${SITE.url} disputes are handled under ${SITE.countryName} law.`,
          ],
        },
      ]}
    />
  );
}
