import { z } from "zod";

/** what Claude must return for a new site's texts; checked on the server, and again on arrival */
export const ICONS = ["shop", "food", "transport", "park", "school", "sun", "key", "heart"] as const;
export const AiCopySchema = z.object({
  heroText: z.string(),
  aboutTitle: z.string(),
  aboutText: z.string(),
  advantagesTitle: z.string(),
  advantages: z.array(z.object({ icon: z.enum(ICONS), title: z.string(), text: z.string() })),
  contactText: z.string(),
  newsletterText: z.string(),
  posts: z.array(z.object({ title: z.string(), category: z.string(), excerpt: z.string(), body: z.string() })),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
  seo: z.object({ title: z.string(), description: z.string() }),
});
export type AiCopy = z.infer<typeof AiCopySchema>;

/** the part of the interview sent to the server; nothing else about the user or project leaves the browser */
export const CopyRequestSchema = z.object({
  kind: z.enum(["residential", "commercial", "shopping-centre", "booking", "blog", "other"]),
  name: z.string().max(120),
  description: z.string().max(4000),
  city: z.string().max(80).optional(),
  offer: z.enum(["rent", "sale"]).optional(),
  vibe: z.enum(["elegant", "bold", "friendly"]).optional(),
  features: z.array(z.string()).max(40),
});
export type CopyRequest = z.infer<typeof CopyRequestSchema>;
