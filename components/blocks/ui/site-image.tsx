import Image from "next/image";
import type { CSSProperties } from "react";

export function SiteImage({ src, alt, className, style }: {
  src: string; alt: string; className?: string; style?: CSSProperties;
}) {
  let optimized = src.startsWith("/") && !src.startsWith("//");
  if (!optimized && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const source = new URL(src);
      const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
      optimized = source.origin === supabase.origin && source.pathname.startsWith("/storage/v1/object/public/");
    } catch {
      optimized = false;
    }
  }
  if (src.startsWith("//") || (!src.startsWith("/") && !/^https?:\/\//i.test(src))) {
    // Preserve legacy relative image URLs that next/image cannot accept.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading="lazy" className={className} style={style} />;
  }
  return <Image src={src} alt={alt} width={1600} height={1200} sizes="(max-width: 768px) 100vw, 50vw"
    loading="lazy" unoptimized={!optimized} className={className} style={{ height: "auto", ...style }} />;
}
