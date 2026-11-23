import { z } from "zod";

export const editorAiInput = z.strictObject({
  kind: z.literal("text"), pageId: z.uuid(), text: z.string().max(8000).refine((value) => value.trim().length > 0),
  instruction: z.string().trim().min(1).max(2000),
  large: z.boolean().default(false),
});
