import { z } from "zod";

export const blogSettingsDraftSchema = z.strictObject({
  timezone: z.string().trim().min(1).max(64),
  blog_path: z.string().trim().min(1).max(200),
  posts_per_page: z.number().int().min(1).max(100),
  index_layout: z.enum(["grid", "list", "magazine"]),
  default_post_layout: z.enum(["classic", "wide", "minimal"]),
  show_author: z.boolean(),
  show_date: z.boolean(),
  show_reading_time: z.boolean(),
  show_share_links: z.boolean(),
  show_in_menu: z.boolean(),
  noindex_tags: z.boolean(),
  cta_text: z.string().max(300),
  cta_button_text: z.string().max(80),
  cta_link: z.string().max(2048),
});
