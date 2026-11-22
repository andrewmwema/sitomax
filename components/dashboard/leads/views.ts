import type { LeadInboxView } from "@/lib/forms/inbox";

export const primaryViews: { value: LeadInboxView; label: string }[] = [
  { value: "needs_reply", label: "Needs reply" },
  { value: "waiting", label: "Waiting" },
  { value: "all_open", label: "All" },
];
export const moreViews: { value: LeadInboxView; label: string }[] = [
  { value: "starred", label: "Starred" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "archived", label: "Archived" },
  { value: "trash", label: "Trash" },
];
export const allViews = [...primaryViews, ...moreViews];

export function parseLeadView(value: string | null): LeadInboxView {
  return allViews.find((view) => view.value === value)?.value ?? "needs_reply";
}

export function leadQueryString(query: { view: LeadInboxView; q: string; site: string }) {
  const params = new URLSearchParams();
  if (query.view !== "needs_reply") params.set("view", query.view);
  if (query.q) params.set("q", query.q);
  if (query.site) params.set("site", query.site);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export const emptyViewCopy: Record<LeadInboxView, { title: string; body: string }> = {
  needs_reply: { title: "You're all caught up ✓", body: "No leads are waiting for a reply." },
  waiting: { title: "Nothing waiting on customers", body: "Leads you have replied to stay here until they answer." },
  all_open: { title: "No open leads yet", body: "New form submissions from your websites appear here." },
  starred: { title: "No starred leads", body: "Star a lead to find it again quickly." },
  won: { title: "No leads marked Won", body: "Leads you mark as Won are kept here." },
  lost: { title: "No leads marked Lost", body: "Leads you mark as Lost are kept here." },
  archived: { title: "Nothing archived", body: "Archived leads move here, out of your open views." },
  trash: { title: "Trash is empty", body: "Deleted leads stay here for 30 days before they are removed." },
};
