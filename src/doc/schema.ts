import { z } from "zod";

/**
 * The site document. One `Project` is one website: pages hold Puck data (root props + a list of blocks),
 * the theme holds the design tokens every block reads, images live in the asset store (src/doc/assets.ts).
 * The editor and Pascal read and write this same document, and only through the operations in ops.ts.
 */
export const DOC_VERSION = 3;

export const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/, "colour must be #RRGGBB");

/** what kind of site this is; real-estate projects first, the other kinds Streamnow also builds next to it */
export const SITE_KINDS = ["residential", "commercial", "shopping-centre", "booking", "blog", "other"] as const;
export type SiteKind = (typeof SITE_KINDS)[number];
export const SITE_KIND_LABEL: Record<SiteKind, string> = {
  residential: "Residential project",
  commercial: "Commercial / offices",
  "shopping-centre": "Shopping centre",
  booking: "Booking (rooms, desks, viewings)",
  blog: "Blog / news",
  other: "Other",
};

export const RADII = ["none", "small", "medium", "large"] as const;
export const SHADOWS = ["none", "soft", "strong"] as const;
export const SPACINGS = ["compact", "normal", "airy"] as const;
export const TYPE_SCALES = ["s", "m", "l"] as const;

/**
 * Theme overrides. A missing value means "what the template says", so switching the template keeps the brand
 * and a site nobody touched looks exactly like its template. The primary colour is `Project.accent`.
 */
export const ThemeColorsSchema = z.object({ secondary: HEX, background: HEX, surface: HEX, text: HEX, muted: HEX }).partial().strict();
export const ThemeTokensSchema = z
  .object({
    colors: ThemeColorsSchema.optional(),
    /** keys of FONTS in src/lib/fonts.ts, or "template" */
    fonts: z.object({ heading: z.string(), body: z.string() }).partial().strict().optional(),
    typeScale: z.enum(TYPE_SCALES).optional(),
    radius: z.enum(RADII).optional(),
    shadow: z.enum(SHADOWS).optional(),
    spacing: z.enum(SPACINGS).optional(),
  })
  .strict();
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>;
export type ThemeColors = z.infer<typeof ThemeColorsSchema>;

export const SeoSchema = z
  .object({ title: z.string().max(120), description: z.string().max(320), ogImage: z.string(), noindex: z.boolean() })
  .partial()
  .strict();
export type SeoMeta = z.infer<typeof SeoSchema>;

export const BlockSchema = z.object({ type: z.string().min(1), props: z.object({ id: z.string().min(1) }).passthrough() });
export type BlockDoc = z.infer<typeof BlockSchema>;

export const PageDataSchema = z.object({
  root: z.object({ props: z.record(z.string(), z.unknown()).optional() }).passthrough(),
  content: z.array(BlockSchema),
  zones: z.record(z.string(), z.array(BlockSchema)).optional(),
});

/** the parts of a Project that make up the website itself (units, plans and leads are checked by their own screens) */
export const SiteDocSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    accent: HEX,
    template: z.string(),
    kind: z.enum(SITE_KINDS).optional(),
    docVersion: z.number().optional(),
    theme: ThemeTokensSchema.optional(),
    seo: SeoSchema.optional(),
    draft: PageDataSchema,
    published: PageDataSchema.nullable(),
    pages: z.array(z.object({ id: z.string(), slug: z.string(), title: z.string(), draft: PageDataSchema, published: PageDataSchema.nullable(), seo: SeoSchema.optional() }).passthrough()).optional(),
    drafts: z.record(z.string(), PageDataSchema).optional(),
  })
  .passthrough();

/** problems in a stored site, as readable lines; empty = valid */
export function validateSite(p: unknown): string[] {
  const r = SiteDocSchema.safeParse(p);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".") || "site"}: ${i.message}`);
}
