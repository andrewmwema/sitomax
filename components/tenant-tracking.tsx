import Script from "next/script";
import type { SiteSeo } from "@/lib/seo";

export function TenantTracking({ seo }: { seo: SiteSeo }) {
  return <>
    {seo.googleAnalyticsId ? <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(seo.googleAnalyticsId)}`} strategy="afterInteractive" />
      <Script id="tenant-google-analytics" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){window.dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', ${JSON.stringify(seo.googleAnalyticsId)});
      `}</Script>
    </> : null}
    {seo.metaPixelId ? <Script id="tenant-meta-pixel" strategy="afterInteractive">{`
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
      (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', ${JSON.stringify(seo.metaPixelId)});fbq('track', 'PageView');
    `}</Script> : null}
  </>;
}
