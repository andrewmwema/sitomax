import { z } from "zod";

export const clientDirectorySchema = z.object({
  q: z.string().max(200).default(""),
  access: z.enum(["all", "owner", "unassigned"]).default("all"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  client: z.uuid().optional(),
});

export type ClientDirectoryFilters = Pick<z.infer<typeof clientDirectorySchema>, "q" | "access" | "page">;

export function clientDirectoryHref(filters: ClientDirectoryFilters, client?: string) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.access !== "all") params.set("access", filters.access);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (client) params.set("client", client);
  const query = params.toString();
  return `/dashboard/clients${query ? `?${query}` : ""}`;
}
