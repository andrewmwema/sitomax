import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { SocialProviderTest } from "@/components/dashboard/social-provider-test";

export default async function SocialProviderTestPage() {
  const { supabase } = await requireSuperAdmin();
  const { data, error } = await supabase.from("sites").select("id, name, subdomain").order("name");
  if (error) throw new Error("Could not load sites for social testing.");
  const sites = z.array(z.object({ id: z.uuid(), name: z.string().nullable(), subdomain: z.string() })).parse(data ?? []);
  return <div className="space-y-6">
    <header><h1 className="text-3xl font-semibold">Social provider test</h1>
      <p className="mt-2 text-sm text-[var(--platform-secondary)]">Agency-only live diagnostics. Posts and review replies are public. Sites in the same client account share one social profile.</p>
    </header>
    <SocialProviderTest sites={sites} />
  </div>;
}
