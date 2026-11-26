import type { Data } from "@puckeditor/core";
import type { Project, SitePage } from "./types";

/** the page for a language: its own copy if it exists, otherwise the main one */
export function pageData(p: Project, draft: boolean, lang?: string | null): Data | null {
  const other = lang && lang !== p.locale && (p.locales ?? []).includes(lang);
  if (draft) return (other ? p.drafts?.[lang!] : undefined) ?? p.draft;
  return (other ? p.publishedByLocale?.[lang!] : undefined) ?? p.published;
}
export const siteQuery = (draft: boolean, lang?: string | null, main?: string) => [draft ? "draft=1" : "", lang && lang !== main ? `lang=${lang}` : ""].filter(Boolean).join("&");

// ── more than one page ───────────────────────────────────────────
/** addresses under /site/[id]/ that are taken by the app itself */
export const RESERVED_SLUGS = ["legal", "unit", "home", "index"];
export const slugify = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
export function freeSlug(p: Pick<Project, "pages">, title: string, except?: string) {
  const base = slugify(title) || "page";
  const taken = (s: string) => RESERVED_SLUGS.includes(s) || (p.pages ?? []).some((x) => x.slug === s && x.id !== except);
  let s = base, n = 2;
  while (taken(s)) s = `${base}-${n++}`;
  return s;
}
export const findPage = (p: Pick<Project, "pages">, slug?: string | null): SitePage | undefined => (slug ? (p.pages ?? []).find((x) => x.slug === slug) : undefined);

type Block = Data["content"][number];
const SHARED = ["Header", "Footer"];
const isShared = (c: Block) => SHARED.includes(c.type as string);

/** a further page as it is shown and edited: its own blocks between the menu bar and the footer of the home page */
export function composePage(home: Data, page: Data): Data {
  const top = home.content.filter((c) => c.type === "Header"), bottom = home.content.filter((c) => c.type === "Footer");
  return { root: home.root, content: [...top, ...page.content.filter((c) => !isShared(c)), ...bottom], zones: {} } as Data;
}
/** the reverse after editing: what belongs to the page itself, and the home page with the edited menu bar and footer */
export function splitPage(home: Data, edited: Data): { own: Data; home: Data } {
  const own = { root: { props: {} }, content: edited.content.filter((c) => !isShared(c)), zones: {} } as Data;
  const next = (type: string) => edited.content.find((c) => c.type === type);
  return { own, home: { ...home, root: edited.root, content: home.content.map((c) => (isShared(c) ? next(c.type as string) ?? c : c)) } as Data };
}
/** what a visitor gets under /site/[id]/[slug] */
export function subPageData(p: Project, slug: string, draft: boolean, lang?: string | null): Data | null {
  const pg = findPage(p, slug), home = pageData(p, draft, lang);
  const own = pg ? (draft ? pg.draft : pg.published) : null;
  return home && own ? composePage(home, own) : null;
}
/** where a page lives in this preview */
export function pageUrl(p: Pick<Project, "id" | "locale">, slug: string | null | undefined, draft: boolean, lang?: string | null) {
  const q = siteQuery(draft, lang, p.locale);
  return `/site/${p.id}${slug ? `/${slug}` : ""}${q ? `?${q}` : ""}`;
}
/**
 * Links are stored the way they will work on the real domain ("/contact", "#units"). In this preview the site
 * lives under /site/[id], so they are pointed there; returns null when the link needs no change.
 */
export function previewHref(href: string, p: Pick<Project, "id" | "locale" | "pages">, current: string | null | undefined, draft: boolean, lang?: string | null): string | null {
  const [path, hash = ""] = href.split("#");
  const tail = hash ? `#${hash}` : "";
  if (href.startsWith("#")) return current ? pageUrl(p, null, draft, lang) + tail : null;
  if (path === "/") return pageUrl(p, null, draft, lang) + tail;
  if (path.startsWith("/") && !path.startsWith("/site/")) { const pg = findPage(p, path.slice(1).replace(/\/$/, "")); return pg ? pageUrl(p, pg.slug, draft, lang) + tail : null; }
  return null;
}
