import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import "./globals.css";
import "./platform.css";

const siteUrl = new URL(brand.appUrl);

export const metadata: Metadata = {
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
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
};

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
