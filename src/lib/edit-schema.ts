import { z } from "zod";

/**
 * Claude's answer to an edit request in the editor. Prop values travel as JSON strings, because a structured-output
 * schema cannot describe "any object"; the server parses them and the command layer validates them.
 */
export const EditAnswerSchema = z.object({
  /** one or two sentences to the owner: what will change, or a question when the request is unclear */
  reply: z.string(),
  changes: z.array(z.object({
    kind: z.enum(["update", "add", "move", "remove"]),
    /** existing section id for update / move / remove; empty for add */
    blockId: z.string(),
    /** section type for add; empty otherwise */
    blockType: z.string(),
    /** target position (0 = first) for add / move; -1 otherwise */
    position: z.number().int(),
    props: z.array(z.object({ field: z.string(), json: z.string() })),
  })),
});
export type EditAnswer = z.infer<typeof EditAnswerSchema>;

export const EditRequestSchema = z.object({
  text: z.string().min(1).max(2000),
  site: z.object({ name: z.string(), locale: z.string(), hasLogo: z.boolean(), kind: z.string().optional() }),
  /** the page as it is: id, type and current values (long strings and images shortened) */
  page: z.array(z.object({ id: z.string(), type: z.string(), props: z.record(z.string(), z.unknown()) })).max(80),
  /** what every section type can hold: field name → kind and allowed values */
  catalog: z.record(z.string(), z.object({ label: z.string(), fields: z.record(z.string(), z.object({ type: z.string(), options: z.array(z.string()).optional() })) })),
  selectedId: z.string().nullable().optional(),
});
export type EditRequest = z.infer<typeof EditRequestSchema>;
