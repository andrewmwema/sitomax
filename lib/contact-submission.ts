import { z } from "zod";

export const contactSubmissionSchema = z.object({
  formName: z.string().trim().min(1).max(120),
  path: z.string().max(2048).regex(/^\/(?!\/)[^?#\x00-\x1f]*$/),
  honeypot: z.string().max(1000),
  fields: z.array(z.object({
    name: z.string().trim().min(1).max(120).regex(/^[^\x00-\x1f]+$/),
    value: z.string().trim().max(5000),
  })).min(1).max(30).refine((fields) => fields.some((field) => field.value.length > 0)),
});

export function submissionData(fields: { name: string; value: string }[]): Record<string, string> {
  const entries = new Map<string, string>();
  for (const { name, value } of fields) entries.set(name, entries.has(name) ? `${entries.get(name)}\n${value}` : value);
  return Object.fromEntries(entries);
}
