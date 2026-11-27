import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { getAgencySettings } from "@/lib/agency";
import "./globals.css";
import "./platform.css";
import "./leads.css";

const siteUrl = new URL(brand.appUrl);

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { faviconUrl } = await getAgencySettings();
  const icon = faviconUrl || "/icon.svg";
  return {
    metadataBase: siteUrl,
    title: brand.name,
    description: brand.tagline,
    openGraph: {
      type: "website",
      title: brand.name,
      description: brand.tagline,
      siteName: brand.name,
      url: siteUrl,
    },
    twitter: {
      card: "summary",
      title: brand.name,
      description: brand.tagline,
    },
    icons: { icon, shortcut: icon },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
