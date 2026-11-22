import { submissionContact, submissionFields } from "@/lib/forms/submissions";
import type { Lead } from "@/lib/forms/submissions";

const AVATAR_TONES = [
  ["#e8eeff", "#1740c4"], ["#e6f5ec", "#0b6238"], ["#fdf1dc", "#7a4b00"], ["#f7e9f5", "#86236f"],
  ["#e3f4f7", "#0b5b6b"], ["#fdeaea", "#96281f"], ["#ecebfd", "#4534b8"], ["#eef0f5", "#3a3f55"],
] as const;

export function leadInitials(name: string) {
  const words = name.trim().split(/[\s@._-]+/).filter(Boolean);
  const letters = words.length > 1 ? `${words[0][0]}${words[1][0]}` : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

export function avatarTone(seed: string) {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  const [background, color] = AVATAR_TONES[hash % AVATAR_TONES.length];
  return { background, color };
}

/** The lead's name from the form's name field, falling back to the email. */
export function leadDisplayName(data: unknown) {
  const contact = submissionContact(data);
  return contact.name?.trim() || contact.email?.trim() || "Unknown sender";
}

export function leadIsUnread(lead: Pick<Lead, "unread" | "has_unread_reply" | "is_read">) {
  return Boolean(lead.unread || lead.has_unread_reply || !lead.is_read);
}

export function leadPreview(lead: Lead) {
  const latest = lead.last_message_preview?.replace(/\s+/g, " ").trim();
  if (latest) return lead.last_message_direction === "out" ? `You: ${latest}` : latest;
  const message = submissionFields(lead.data).find(([field, value]) =>
    typeof value === "string" && value.trim() && /message|inquiry|enquiry|comment|question|details|notes/i.test(field))?.[1];
  if (typeof message === "string") return message.replace(/\s+/g, " ").trim();
  return submissionContact(lead.data).email || lead.form_name || "New inquiry";
}

const DAY = 86_400_000;
const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);

/** "now", "12m", "2h", "3d", then "Nov 21". */
export function relativeLeadTime(value: string | null | undefined, now: number) {
  const time = value ? new Date(value).getTime() : NaN;
  if (Number.isNaN(time)) return "";
  const elapsed = now - time;
  if (elapsed < 60_000) return "now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / 3_600_000)}h`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d`;
  const date = new Date(time);
  return date.toLocaleDateString("en", {
    month: "short", day: "numeric", ...(date.getFullYear() === new Date(now).getFullYear() ? {} : { year: "numeric" }),
  });
}

/** "Today", "Yesterday", then "Nov 21". */
export function dayLabel(value: string, now: number) {
  const time = new Date(value).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(time)) / DAY);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const date = new Date(time);
  return date.toLocaleDateString("en", {
    month: "short", day: "numeric", ...(date.getFullYear() === new Date(now).getFullYear() ? {} : { year: "numeric" }),
  });
}

export function dayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** "in 3 days", "in 5 hours", "tomorrow"; "now" once the time has passed. */
export function untilLabel(value: string, now: number) {
  const remaining = new Date(value).getTime() - now;
  if (Number.isNaN(remaining) || remaining <= 0) return "now";
  if (remaining < 3_600_000) return `in ${Math.max(1, Math.round(remaining / 60_000))} min`;
  if (remaining < DAY) {
    const hours = Math.round(remaining / 3_600_000);
    return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.round(remaining / DAY);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}
