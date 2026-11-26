import type { Project } from "@/lib/types";
import { DOC_VERSION, type SiteKind, type ThemeTokens } from "./schema";

/**
 * Brings a stored project up to the current document format. Runs on every load, is idempotent,
 * and never changes how a site looks: values only move to where the theme expects them.
 *
 * v2 → v3: site kind, theme tokens (font + text size moved out of the home page's root props).
 */
export function migrateProject(p: Project): Project {
  if ((p.docVersion ?? 0) >= DOC_VERSION) return p;
  const root = (p.draft?.root?.props ?? {}) as { fontFamily?: string; textScale?: string };
  const theme: ThemeTokens = { ...(p.theme ?? {}) };
  if (root.fontFamily && root.fontFamily !== "template" && !theme.fonts) theme.fonts = { heading: root.fontFamily, body: root.fontFamily };
  if (root.textScale && root.textScale !== "m" && !theme.typeScale) theme.typeScale = root.textScale as ThemeTokens["typeScale"];
  const uses = p.uses ?? ["apartment"];
  const kind: SiteKind = p.kind ?? (uses.length === 1 && uses[0] === "commercial" ? "commercial" : "residential");
  return { ...p, kind, theme, docVersion: DOC_VERSION };
}

export const migrateAll = (projects: Project[]) => projects.map(migrateProject);
