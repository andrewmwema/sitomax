import { z } from "zod";

export const photoSearchSchema = z.object({
  query: z.string().trim().min(1, "Enter a photo search.").max(100).transform((value) => value.replace(/\s+/g, " ").toLowerCase()),
  orientation: z.enum(["all", "horizontal", "vertical"]).default("all"),
});
export type PhotoSearch = z.output<typeof photoSearchSchema>;
export type StockPhoto = {
  id: number;
  previewUrl: string;
  alt: string;
  width: number;
  height: number;
  downloadUrls: string[];
};
export type StoredPhoto = { url: string; alt: string };
export interface PhotoProvider {
  name: string;
  url: string;
  cacheKey(): string;
  search(input: PhotoSearch): Promise<StockPhoto[]>;
  download(photo: StockPhoto): Promise<{ bytes: Uint8Array; contentType: string; extension: string }>;
}
export class PhotoError extends Error {
  override name = "PhotoError";
}
