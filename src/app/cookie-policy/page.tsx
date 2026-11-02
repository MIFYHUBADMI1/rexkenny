import { LegalLayout, legalMeta } from "@/components/legal/LegalLayout";
import { SITE } from "@/lib/site";
import { env } from "@/lib/config";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return legalMeta(
    "Cookie Policy",
    "/cookie-policy",
    `Exactly which cookies and storage ${SITE.url} uses — session cookies, optional analytics and nothing else.`,
  );
}

export default function CookiePage() {
  const ga = Boolean(env.ga4Id);
  return (
    <LegalLayout
      title="Cookie Policy"
      path="/cookie-policy"
      updated="2026-10-30"
      intro="This site is deliberately minimal about tracking. Here is the complete list of what is set."
      sections={[
        {
          heading: "Strictly necessary",
          body: [
            "Authentication session cookies set by Supabase (sb-* cookies) when you sign in or register. Without them, no account features work.",
            "A CSRF/session binding cookie for form submissions.",
            "These are not marketing cookies and are not used for profiling.",
          ],
        },
        {
          heading: `Analytics ${ga ? "(enabled)" : "(currently disabled)"}`,
          body: [
            ga
              ? "Google Analytics 4 is configured on this deployment. It sets _ga and _ga_* cookies to count sessions and page views. IP addresses are anonymised before storage."
              : "No analytics provider is currently configured on this site, so no analytics cookies are set and no cross-site tracking occurs. This paragraph changes if the owner enables Google Analytics.",
            "You can block these in your browser settings; the site still works.",
          ],
        },
        {
          heading: "Not used",
          body: [
            "No advertising cookies, no ad personalisation, no third-party marketing pixels, no cross-site trackers.",
          ],
        },
        {
          heading: "Embedded media",
          body: [
            "Music video pages embed YouTube. YouTube may set its own cookies once you press play. Until you interact, the embed does not load the player.",
          ],
        },
        {
          heading: "Managing cookies",
          body: [
            "Browsers let you block or delete cookies. Deleting session cookies signs you out.",
            `Questions: use the contact page at ${SITE.url}/contact.`,
          ],
        },
      ]}
    />
  );
}
