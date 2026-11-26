import { luminance } from "@/doc/theme";
import type { ThemeTokens } from "@/doc/schema";
import type { Brief } from "./profile";

/**
 * What the interview's logo means for a new site: the picked logo colour becomes the primary colour, a dark logo
 * colour (if there is one) becomes the secondary colour for footer and dark bands; everything else stays the template's.
 */
export function brandFromBrief(b: Brief | undefined, templateAccent: string): { accent: string; logo?: string; logoOnDark?: boolean; theme: ThemeTokens } {
  const accent = b?.accent ?? templateAccent;
  const dark = (b?.palette ?? []).filter((c) => c !== accent && luminance(c) < 0.05).sort((x, y) => luminance(x) - luminance(y))[0];
  return { accent, logo: b?.logo, logoOnDark: b?.logoOnDark || undefined, theme: dark ? { colors: { secondary: dark } } : {} };
}
