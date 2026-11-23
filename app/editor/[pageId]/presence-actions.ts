"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";

export async function heartbeatPageEditor(pageId: string, sessionId: string, close = false): Promise<{ error: string } | { others: number }> {
  const parsed = z.object({ pageId: z.uuid(), sessionId: z.uuid(), close: z.boolean() }).safeParse({ pageId, sessionId, close });
  if (!parsed.success) return { error: "Could not check other editors: invalid editor session." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("heartbeat_page_editor", {
    p_page_id: parsed.data.pageId, p_session_id: parsed.data.sessionId, p_close: parsed.data.close,
  });
  const count = z.number().int().nonnegative().safeParse(data);
  if (error || !count.success) {
    console.error("Could not check editor presence", { code: error?.code });
    return { error: "Could not check for other editors. Version checks still protect your saves." };
  }
  return { others: count.data };
}
