import { z } from "zod";
import { photoCreditSchema } from "@/lib/ai/photo-credit";

export function PhotoCredits({ credits }: { credits: unknown }) {
  if (credits === undefined) return null;
  const result = z.array(photoCreditSchema).safeParse(credits);
  if (!result.success) {
    console.error("Invalid photo attribution data.");
    return <p className="p-4 text-xs">Photo attribution is unavailable. Please contact the site owner.</p>;
  }
  const unique = [...new Map(result.data.map((credit) => [credit.url, credit])).values()];
  if (!unique.length) return null;
  return <aside aria-label="Photo credits" className="px-6 py-4 text-center text-xs" style={{ color: "var(--color-muted)" }}>
    Photos: {unique.map((credit, index) => <span key={credit.url}>
      {index ? "; " : null}<a className="underline" href={credit.photographerUrl} target="_blank" rel="noopener noreferrer">{credit.photographer}</a>
      {" on "}<a className="underline" href={credit.sourceUrl} target="_blank" rel="noopener noreferrer">Unsplash</a>
    </span>)}
  </aside>;
}
