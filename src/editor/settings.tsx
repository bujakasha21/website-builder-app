"use client";
import type { TemplateId } from "@/lib/types";
import { createContext, useContext } from "react";

/** site-wide options, stored in the page's root props */
export interface SiteSettings {
  template: TemplateId;
  fontFamily: string;
  /** earlier per-pixel base sizes; replaced by the shared type scale and `textScale` */
  fontDesktop: number;
  fontMobile: number;
  textScale: "s" | "m" | "l";
  animations: boolean;
  dividers: boolean;
  navVariant: "classic" | "centered" | "overlay" | "minimal";
  unitDetail: "modal" | "page";
  modal: { enabled: boolean; title: string; text: string; image: string; cta: string; ctaHref: string; form: "none" | "contact" | "waitlist"; once: boolean };
  disturber: { enabled: boolean; text: string; href: string; position: "hero" | "corner"; shape: "round" | "pill" };
  cookie: { enabled: boolean; text: string };
  /** empty texts fall back to the starter wording in extras.tsx */
  legal: { email: string; imprint: string; privacy: string };
}

export const DEFAULTS: SiteSettings = {
  template: "t1",
  fontFamily: "template",
  fontDesktop: 16,
  fontMobile: 15,
  textScale: "m",
  animations: true,
  dividers: false,
  navVariant: "classic",
  unitDetail: "modal",
  modal: { enabled: false, title: "First letting from spring", text: "Register now and be the first to hear about viewings.", image: "", cta: "View apartments", ctaHref: "#units", form: "none", once: true },
  disturber: { enabled: false, text: "Move in from April", href: "#units", position: "hero", shape: "round" },
  cookie: { enabled: true, text: "We only store what this website needs to work. Videos and virtual tours from other providers load once you agree." },
  legal: { email: "", imprint: "", privacy: "" },
};

export function withDefaults(props: Record<string, unknown> | undefined): SiteSettings {
  const p = (props ?? {}) as Partial<SiteSettings>;
  return { ...DEFAULTS, ...p, modal: { ...DEFAULTS.modal, ...(p.modal ?? {}) }, disturber: { ...DEFAULTS.disturber, ...(p.disturber ?? {}) }, cookie: { ...DEFAULTS.cookie, ...(p.cookie ?? {}) }, legal: { ...DEFAULTS.legal, ...(p.legal ?? {}) } };
}

export interface SiteCtx {
  settings: SiteSettings;
  /** set on sub-pages (apartment page): prefix for "#anchor" links */
  base?: string;
  draft?: boolean;
  lang?: string;
  editing?: boolean;
}
export const SiteContext = createContext<SiteCtx>({ settings: DEFAULTS });
export const useSite = () => useContext(SiteContext);

/** optional per-block font sizes; empty = the site default */
export const sizeVars = (p: { titleSize?: number | string; textSize?: number | string }): React.CSSProperties => {
  const t = Number(p.titleSize), x = Number(p.textSize);
  return { ...(t ? { ["--fs-title" as string]: `${t}px` } : {}), ...(x ? { ["--fs-text" as string]: `${x}px` } : {}) };
};
