import { LegalLayout, legalMeta } from "@/components/legal/LegalLayout";
import { SITE } from "@/lib/site";
import { env } from "@/lib/config";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return legalMeta(
    "Privacy Policy",
    "/privacy-policy",
    `How ${SITE.legalName} collects, uses and protects personal data from fans, subscribers and booking enquiries. Aligned to Uganda's Data Protection Act 2019 and GDPR where applicable.`,
  );
}

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      path="/privacy-policy"
      updated="2026-10-30"
      intro={`How ${SITE.legalName} handles personal information for visitors of ${SITE.url}.`}
      sections={[
        {
          heading: "Who we are",
          body: [
            `${SITE.legalName} is an independent music operation run by ${SITE.shortName}, based in ${SITE.city}, ${SITE.country}. We are the data controller for information collected through this website.`,
          ],
        },
        {
          heading: "What we collect",
          body: [
            "Newsletter subscribers: email address, a consent timestamp and a status flag. Nothing else.",
            "Contact and booking enquiries: your name, email, optional phone, organisation, event date, budget range and your message.",
            "Registered fans: email and, if you use Google sign-in, the profile data Google shares with you chosen to disclose.",
            `Website analytics: ${env.ga4Id ? "Google Analytics 4 is enabled on this site and collects standard usage data (pages, approximate region, device type) with IP anonymisation on." : "No analytics provider is currently configured, so this site records no visitor analytics at all."}`,
            "We do not sell or rent any of the above.",
          ],
        },
        {
          heading: "Legal basis and consent",
          body: [
            "Marketing emails are sent only after double opt-in: you submit an address, then confirm through a link we email you. Unsubscribing removes you from the list.",
            "Enquiry handling is based on taking steps at your request. Analytics is based on legitimate interest in operating the site.",
          ],
        },
        {
          heading: "Where data is stored",
          body: [
            "Content and personal data are stored in Supabase (PostgreSQL), hosted in the region selected for our project, with row-level security limiting access to staff accounts and to you.",
            "Media files are held in Supabase Storage. Private masters and documents sit in buckets that anonymous requests cannot read.",
          ],
        },
        {
          heading: "Your rights",
          body: [
            "You can ask for a copy of what we hold, correction of errors, deletion, or withdrawal of consent, at any time by writing through the contact page.",
            "These rights exist under Uganda's Data Protection Act 2019 and, where you are in the EEA/UK, under the GDPR. We respond within 30 days.",
          ],
        },
        {
          heading: "Retention",
          body: [
            "Subscriber records are kept until you unsubscribe. Enquiries are kept for 24 months after the last exchange unless you ask us to delete them sooner.",
          ],
        },
        {
          heading: "Children",
          body: [
            "This site is not directed at children under 13 and we do knowingly collect their data. If you believe a child has sent us information, contact us and we will delete it.",
          ],
        },
        {
          heading: "Changes",
          body: [
            "Material changes are posted on this page with a new date. Continued use after a change means acceptance of it.",
          ],
        },
      ]}
    />
  );
}
