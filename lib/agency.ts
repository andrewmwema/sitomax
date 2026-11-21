import { createClient } from "@/lib/supabase/server";
import { brand } from "@/lib/brand";

export type AgencySettings = {
  name: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  supportEmail: string | null;
  showLeadEmailBranding?: boolean;
};

const FALLBACK_PRIMARY_COLOR = "#4f46e5";

/**
 * Agency branding from the single agency_settings row, with safe fallbacks
 * so the UI renders even before the row exists.
 */
export async function getAgencySettings(): Promise<AgencySettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agency_settings")
    .select("name, logo_url, favicon_url, primary_color, support_email")
    .eq("id", 1)
    .maybeSingle();

  const savedName = data?.name?.trim();
  const savedSupportEmail = data?.support_email?.trim();
  return {
    name: savedName && savedName !== "My Agency" ? savedName : brand.name,
    logoUrl: data?.logo_url ?? null,
    faviconUrl: data?.favicon_url ?? null,
    primaryColor: data?.primary_color ?? FALLBACK_PRIMARY_COLOR,
    supportEmail: savedSupportEmail && savedSupportEmail !== "support@example.com"
      ? savedSupportEmail
      : brand.supportEmail,
  };
}
