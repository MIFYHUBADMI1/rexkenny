import Script from "next/script";
import { env } from "@/lib/config";

/**
 * GA4 loads only when a measurement ID is configured. There is no
 * placeholder tag and no simulated traffic — an unconfigured analytics
 * integration records nothing at all.
 */
export function Analytics() {
  if (!env.ga4Id) return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${env.ga4Id}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${env.ga4Id}',{send_page_view:true,anonymize_ip:true});`}
      </Script>
    </>
  );
}
