import { z } from "zod";

const sourceLink = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "unsplash.com" && !url.username && !url.password;
});
export const photoCreditSchema = z.object({
  url: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "images.unsplash.com";
  }),
  alt: z.string(), photographer: z.string(), photographerUrl: sourceLink, sourceUrl: sourceLink,
});
export type PhotoCredit = z.infer<typeof photoCreditSchema>;
