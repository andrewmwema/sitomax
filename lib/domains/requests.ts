import { z } from "zod";
import { customDomainSchema } from "@/lib/domains";
import { providerIdSchema } from "./providers";

export const domainRequestStatusSchema = z.enum(["requested", "in_progress", "done", "needs_info"]);
export const domainRequestLabels = {
  requested: "Requested", in_progress: "In progress", done: "Done", needs_info: "Needs information",
} as const;
export const domainRequestSchema = z.object({
  id: z.uuid(), site_id: z.uuid(), domain: customDomainSchema, provider: providerIdSchema,
  status: domainRequestStatusSchema, notes: z.string(), created_at: z.string(),
});
export type DomainRequest = z.infer<typeof domainRequestSchema>;
export type DomainAssistanceData = {
  supportEmail: string | null;
  requests: DomainRequest[];
  canRequest: boolean;
  isSuperAdmin: boolean;
};

const genericSteps = [
  "Open your provider's account settings and look for Add us as a user, team members, or shared access.",
  "Invite the agency email below to manage DNS for this domain only, using the least-permissive DNS role available.",
  "Do not grant billing, transfers, ownership, or full-account administrator access.",
  "If your provider cannot safely limit access, use the self-service DNS instructions or contact us instead. Revoke access when setup is complete.",
];
export function delegationSteps(providerId: string): readonly string[] {
  switch (providerId) {
    case "godaddy": return [
      "Open Account Settings, then Delegate Access and Invite to Access.",
      "Invite the agency email below and choose Domains Only, not Products & Domains.",
      "Use domain folders to limit Management Access to this domain. Remove access to All Domains and leave Transfer Access off.",
      "Send the invitation, then submit your request here. Revoke delegated access after setup is complete.",
    ];
    case "namecheap": return [
      "Open Domain List, choose Manage next to this domain, then Sharing & Transfer.",
      "Under Share Access, enter the agency email below in New Manager.",
      "Grant only DNS management permissions. Leave contact, transfer and other account permissions off. The agency needs its own Namecheap account.",
      "Send the invitation, then submit your request here. Remove the domain manager when setup is complete.",
    ];
    case "cloudflare": return [
      "Open your Cloudflare account's Manage Account area, then Members and Invite member.",
      "Invite the agency email below and scope the invitation to this domain only.",
      "Choose the domain-scoped Domain DNS role for DNS editing only. Do not select Administrator, Super Administrator, billing or all-domain access.",
      "Send the invitation, then submit your request here. If DNS-only access is unavailable, use self-service instructions instead. Remove the member after setup.",
    ];
    case "squarespace": return [
      "Open your Squarespace Domains dashboard, select this domain, open Permissions and choose Add a domain manager (Invite domain manager).",
      "Invite the agency email below for this domain only. Do not grant billing access or make us a site administrator.",
      "This role is not DNS-only: domain managers can also initiate transfers. Keep ownership and transfer authorization with you; never send us transfer codes or approve an unexpected transfer.",
      "Only send the invitation if you are comfortable with that scope; otherwise use self-service DNS. Submit your request here after inviting us, and remove the manager when setup is complete.",
    ];
    default: return genericSteps;
  }
}
