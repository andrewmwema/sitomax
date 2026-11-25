import { z } from "zod";

export const aiImageSuggestionSchema = z.strictObject({
  query: z.string().trim().min(1).max(100),
  alt: z.string().trim().min(1).max(500),
});

export function imageFieldPath(parts: (string | number)[]): string {
  return parts.map((part, index) => typeof part === "number" ? `[${part}]` : `${index ? "." : ""}${part}`).join("");
}

export function aiImageSuggestion(props: Record<string, unknown> | undefined, name: string) {
  const suggestions = z.record(z.string(), aiImageSuggestionSchema).safeParse(props?.__aiImageSuggestions);
  return suggestions.success ? suggestions.data[name] : undefined;
}
