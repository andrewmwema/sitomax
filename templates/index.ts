import { generalBusinessTemplate } from "./general-business";
import { plumberTemplate } from "./plumber";
import { restaurantTemplate } from "./restaurant";
import { salonTemplate } from "./salon";
import type { SiteCreationInput } from "@/lib/site-creation";
import type { WebsiteTemplate } from "./shared";

export const templates: Record<SiteCreationInput["template"], WebsiteTemplate> = {
  plumber: plumberTemplate,
  salon: salonTemplate,
  restaurant: restaurantTemplate,
  "general-business": generalBusinessTemplate,
};
