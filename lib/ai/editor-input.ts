import { z } from "zod";

export const editorAiInput = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("section"), pageId: z.uuid(), section: z.unknown(),
    instruction: z.string().trim().min(1).max(2000),
    large: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("add"), pageId: z.uuid(), instruction: z.string().trim().min(1).max(2000),
  }),
  z.strictObject({
    kind: z.literal("text"), pageId: z.uuid(), text: z.string().max(8000).refine((value) => value.trim().length > 0),
    instruction: z.string().trim().min(1).max(2000),
    large: z.boolean().default(false),
  }),
]);
export type EditorAiInput = z.infer<typeof editorAiInput>;
