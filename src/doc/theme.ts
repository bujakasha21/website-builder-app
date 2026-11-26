import { templateOf } from "@/lib/templates";
import type { ThemeTokens } from "./schema";

/** a template's own values; the theme only stores what the owner changed on top of these */
export interface ResolvedTheme {
  colors: { primary: string; secondary: string; background: string; surface: string; text: string; muted: string; onPrimary: string };
  fonts: { heading: string; body: string };
  typeScale: "s" | "m" | "l";
  radius: "none" | "small" | "medium" | "large";
  shadow: "none" | "soft" | "strong";
  spacing: "compact" | "normal" | "airy";
}

type Base = Omit<ResolvedTheme, "colors" | "typeScale"> & { colors: Omit<ResolvedTheme["colors"], "primary" | "onPrimary" | "surface"> & { surface: string | ((accent: string) => string) } };

const plain: Base = { colors: { secondary: "#1c1b19", background: "#fbfaf8", surface: "#f1eee8", text: "#1c1b19", muted: "#6b665f" }, fonts: { heading: "geist", body: "geist" }, radius: "small", shadow: "none", spacing: "normal" };

/** colours read off the template CSS in globals.css (fonts come from TEMPLATES); keep in step when a template changes there */
export const TEMPLATE_THEME: Record<string, Partial<Base>> = {
  atelier: { colors: { secondary: "#1d1a16", background: "#f7f3ec", surface: "#ede7db", text: "#1d1a16", muted: "#6b665f" }, radius: "none" },
  kontrast: { colors: { secondary: "#0b0b0b", background: "#ffffff", surface: "#f2f2ef", text: "#0b0b0b", muted: "#5f5f5c" }, radius: "none" },
  lumen: { colors: { secondary: "#16211d", background: "#fbfaf6", surface: (a) => mix(a, "#fbfaf6", 0.07), text: "#16211d", muted: "#5d6b65" }, radius: "large", shadow: "soft" },
};

/** the values a site actually shows: template defaults with the owner's overrides on top */
export function resolveTheme(template: string | undefined, accent: string, theme: ThemeTokens | undefined, legacy?: { fontFamily?: string; textScale?: string }): ResolvedTheme {
  const tp = templateOf(template);
  const b = { ...plain, ...(TEMPLATE_THEME[template ?? ""] ?? {}), fonts: { heading: tp?.head ?? plain.fonts.heading, body: tp?.body ?? plain.fonts.body } };
  const c = { ...plain.colors, ...b.colors };
  const t = theme ?? {};
  const surface = typeof c.surface === "function" ? c.surface(accent) : c.surface;
  const legacyFont = legacy?.fontFamily && legacy.fontFamily !== "template" ? legacy.fontFamily : undefined;
  const pick = (v: string | undefined, d: string) => (v && v !== "template" ? v : d);
  return {
    colors: { primary: accent, secondary: t.colors?.secondary ?? c.secondary, background: t.colors?.background ?? c.background, surface: t.colors?.surface ?? surface, text: t.colors?.text ?? c.text, muted: t.colors?.muted ?? c.muted, onPrimary: onColor(accent) },
    fonts: { heading: pick(t.fonts?.heading ?? legacyFont, b.fonts.heading), body: pick(t.fonts?.body ?? legacyFont, b.fonts.body) },
    typeScale: t.typeScale ?? ((legacy?.textScale as ResolvedTheme["typeScale"]) || "m"),
    radius: t.radius ?? b.radius,
    shadow: t.shadow ?? b.shadow,
    spacing: t.spacing ?? b.spacing,
  };
}

const RADIUS: Record<ResolvedTheme["radius"], [string, string, string]> = { none: ["0px", "0px", "0px"], small: ["4px", "6px", "4px"], medium: ["10px", "16px", "12px"], large: ["999px", "28px", "26px"] };
const SHADOW: Record<ResolvedTheme["shadow"], string> = { none: "none", soft: "0 1px 0 rgba(0,0,0,0.04), 0 18px 40px -28px rgba(0,0,0,0.35)", strong: "0 2px 4px rgba(0,0,0,0.06), 0 28px 60px -24px rgba(0,0,0,0.5)" };
const SPACE: Record<ResolvedTheme["spacing"], number> = { compact: 0.7, normal: 1, airy: 1.3 };

/**
 * CSS custom properties and data attributes for the `.site` element. Only overridden tokens are written,
 * so a site with an empty theme renders exactly as its template's CSS says.
 */
export function themeVars(theme: ThemeTokens | undefined, r: ResolvedTheme): { style: Record<string, string>; attrs: Record<string, string> } {
  const t = theme ?? {};
  const style: Record<string, string> = { "--c-on-primary": r.colors.onPrimary };
  const attrs: Record<string, string> = {};
  if (t.colors?.background) style["--s-bg"] = r.colors.background;
  if (t.colors?.surface) style["--s-alt"] = r.colors.surface;
  if (t.colors?.text) { style["--c-text"] = r.colors.text; style.color = r.colors.text; }
  // lead text and hairlines are shades between text and background; only recomputed when one of them changed
  if (t.colors?.text || t.colors?.background || t.colors?.surface) attrs["data-colors"] = "custom";
  if (t.colors?.text || t.colors?.background) { style["--c-lead"] = mix(r.colors.text, r.colors.background, 0.82); style["--c-line"] = mix(r.colors.text, r.colors.background, 0.14); }
  if (t.colors?.muted) style["--c-muted"] = r.colors.muted;
  if (t.colors?.secondary) style["--c-secondary"] = r.colors.secondary;
  if (t.radius) { const [btn, card, img] = RADIUS[t.radius]; Object.assign(style, { "--r-btn": btn, "--r-card": card, "--r-img": img }); attrs["data-radius"] = t.radius; }
  if (t.shadow) { style["--shadow"] = SHADOW[t.shadow]; attrs["data-shadow"] = t.shadow; }
  if (t.spacing) { style["--space-k"] = String(SPACE[t.spacing]); attrs["data-space"] = t.spacing; }
  return { style, attrs };
}

// ── colour maths ─────────────────────────────────────────────
const rgb = (hex: string): [number, number, number] => { const h = hex.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]; };
const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
export const toHex = ([r, g, b]: [number, number, number]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
/** `t` of `a` mixed into `b` (like CSS color-mix(in srgb, a t, b)) */
export function mix(a: string, b: string, t: number) { const x = rgb(a), y = rgb(b); return toHex([0, 1, 2].map((i) => x[i] * t + y[i] * (1 - t)) as [number, number, number]); }
export function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG 2 contrast ratio, 1–21 */
export function contrast(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
/** white or near-black text, whichever reads better on `bg` */
export const onColor = (bg: string) => (contrast(bg, "#ffffff") >= contrast(bg, "#141414") ? "#ffffff" : "#141414");

export interface ContrastIssue { pair: string; fg: string; bg: string; ratio: number; need: number }
/** WCAG AA pairs every block relies on: body text, small grey text, button label */
export function checkContrast(r: ResolvedTheme): ContrastIssue[] {
  const pairs: [string, string, string, number][] = [
    ["Text on background", r.colors.text, r.colors.background, 4.5],
    ["Text on surface", r.colors.text, r.colors.surface, 4.5],
    ["Grey text on background", r.colors.muted, r.colors.background, 4.5],
    ["Button label on primary", r.colors.onPrimary, r.colors.primary, 4.5],
  ];
  return pairs.map(([pair, fg, bg, need]) => ({ pair, fg, bg, need, ratio: Math.round(contrast(fg, bg) * 100) / 100 })).filter((x) => x.ratio < x.need);
}
