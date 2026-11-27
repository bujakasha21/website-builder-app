"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import { useEffect, useState } from "react";
import { siteQuery } from "@/lib/sitedata";
import { useProject } from "@/lib/store";
import type { Project } from "@/lib/types";
import { useSite, type SiteSettings } from "./settings";

type P = Record<string, any>;

// ── media links ──────────────────────────────────────────────────
export type Media = { kind: "youtube" | "vimeo" | "file" | "frame"; src: string; host: string };
/** turns a pasted link (YouTube, Vimeo, video file, any 360° tour) into something embeddable */
export function mediaSource(url?: string): Media | null {
  const u = (url ?? "").trim();
  if (!u) return null;
  const yt = u.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([\w-]{6,})/);
  if (yt) return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${yt[1]}`, host: "YouTube" };
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { kind: "vimeo", src: `https://player.vimeo.com/video/${vm[1]}`, host: "Vimeo" };
  if (/\.(mp4|webm|mov)(\?|$)/i.test(u) || u.startsWith("data:video")) return { kind: "file", src: u, host: "" };
  if (/^https:\/\//.test(u)) { let host = ""; try { host = new URL(u).hostname.replace(/^www\./, ""); } catch {} return { kind: "frame", src: u, host }; }
  return null;
}

// ── cookie consent ───────────────────────────────────────────────
const consentKey = (id?: string) => `sb-consent-${id ?? "site"}`;
/** undefined = not read yet, null = no choice made */
export function useConsent(id?: string): [string | null | undefined, (v: "all" | "necessary") => void] {
  const [v, setV] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const read = () => { try { setV(localStorage.getItem(consentKey(id))); } catch { setV(null); } };
    read();
    window.addEventListener("sb-consent", read);
    return () => window.removeEventListener("sb-consent", read);
  }, [id]);
  const set = (x: "all" | "necessary") => { try { localStorage.setItem(consentKey(id), x); } catch {} setV(x); window.dispatchEvent(new Event("sb-consent")); };
  return [v, set];
}

export function CookieNotice({ s, projectId, privacy }: { s: SiteSettings["cookie"]; projectId: string; privacy: string }) {
  const [c, set] = useConsent(projectId);
  if (c !== null) return null;
  return (
    <div className="s-cookie" role="dialog" aria-label="Cookies">
      <p>{s.text} <a href={privacy}>Privacy policy</a></p>
      <div className="s-cookie-btns">
        <button type="button" className="s-btn ghost" onClick={() => set("necessary")}>Only necessary</button>
        <button type="button" className="s-btn" onClick={() => set("all")}>Accept all</button>
      </div>
    </div>
  );
}

// ── legal pages ──────────────────────────────────────────────────
export type LegalKind = "imprint" | "privacy";
/** "/imprint" and "/privacy" (the defaults) lead to the generated pages of this site; anything else is the owner's own link */
export function legalHref(href: string | undefined, page: LegalKind, p: Pick<Project, "id" | "locale"> | null, draft?: boolean, lang?: string) {
  const h = (href ?? "").trim();
  if (h && h !== `/${page}`) return h;
  if (!p) return "#";
  const q = siteQuery(!!draft, lang, p.locale);
  return `/site/${p.id}/legal/${page}${q ? `?${q}` : ""}`;
}
export function useLegalHref(puck: any) {
  const p = useProject(puck?.metadata?.projectId) ?? null;
  const { draft, lang } = useSite();
  return (href: string | undefined, page: LegalKind) => legalHref(href, page, p, draft, lang);
}

/** starter wording so no site goes live without an imprint and a privacy page; the owner replaces or extends it */
export function starterLegal(page: LegalKind, p: Pick<Project, "name" | "address" | "zip" | "city"> | null, company?: string, email?: string) {
  const who = company?.trim() || p?.name || "Company";
  const where = p ? [p.address, [p.zip, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  const mail = email?.trim() || "";
  if (page === "imprint")
    return [
      "# Responsible for this website",
      [who, where, mail].filter(Boolean).join("\n"),
      "# Liability",
      "The content of this website was prepared with care. No guarantee is given that the information is correct, complete or up to date. All offers are non-binding; changes and prior letting or sale remain reserved.",
      "# Images and plans",
      "Visualisations, photos and floor plans are illustrative. No claims can be derived from them.",
      "# Copyright",
      "Texts, images and plans on this website are protected by copyright. Any use needs the prior consent of the rights holder.",
    ].join("\n\n");
  return [
    "# Who is responsible",
    `${[who, where].filter(Boolean).join(", ")}.${mail ? ` Questions about data protection: ${mail}.` : ""}`,
    "# What we collect",
    "When you send an enquiry, join the waiting list or book a viewing, we process the details you enter (such as name, email address, phone number and your message) to answer you and to handle the letting or sale.",
    "# Cookies and external content",
    "This website only stores what it needs to work, including your cookie choice. Videos and virtual tours come from other providers and are loaded only after you agree, because the provider may then process data such as your IP address.",
    "# Map",
    "The map comes from OpenStreetMap. When it is shown, your browser connects to their servers.",
    "# Passing on data",
    "We pass your details only to the companies involved in letting or selling this property. We do not sell them.",
    "# Your rights",
    `You can ask at any time which data we hold about you and have it corrected or deleted.${mail ? ` Write to ${mail}.` : ""}`,
  ].join("\n\n");
}

export function LegalPage({ page, company, puck }: P) {
  const p = useProject(puck?.metadata?.projectId) ?? null;
  const { settings } = useSite();
  const kind: LegalKind = page === "privacy" ? "privacy" : "imprint";
  const text = settings.legal[kind]?.trim() || starterLegal(kind, p, company, settings.legal.email);
  return (
    <section className="legal">
      <div className="wrap">
        <h1>{kind === "imprint" ? "Imprint" : "Privacy policy"}</h1>
        {text.split(/\n{2,}/).map((b, k) => (b.startsWith("# ") ? <h2 key={k}>{b.slice(2)}</h2> : <p key={k}>{b}</p>))}
      </div>
    </section>
  );
}

// ── hero media ───────────────────────────────────────────────────
export function HeroSlides({ images, fallback }: { images: { src: string }[]; fallback?: string }) {
  const list = (images ?? []).filter((i) => i?.src);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (list.length < 2) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % list.length), 5000);
    return () => clearInterval(t);
  }, [list.length]);
  if (!list.length) return fallback ? <img className="hero-back" src={fallback} alt="" /> : <div className="hero-back ph-dark" />;
  const cur = i % list.length;
  return (
    <>
      {list.map((s, k) => <img key={k} className={`hero-back hero-slide ${k === cur ? "on" : ""}`} src={s.src} alt="" />)}
      {list.length > 1 ? <div className="hero-dots">{list.map((_, k) => <button key={k} type="button" aria-label={`Photo ${k + 1}`} aria-current={k === cur ? "true" : undefined} onClick={() => setI(k)} />)}</div> : null}
    </>
  );
}
export function HeroVideo({ url, poster }: { url?: string; poster?: string }) {
  const m = mediaSource(url);
  const still = poster ? <img className="hero-back" src={poster} alt="" /> : <div className="hero-back ph-dark" />;
  if (!m || m.kind === "frame") return still;
  if (m.kind === "file") return <video className="hero-back" src={m.src} poster={poster || undefined} autoPlay muted loop playsInline />;
  const id = m.src.split("/").pop();
  const src = m.kind === "youtube" ? `${m.src}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&playsinline=1&rel=0` : `${m.src}?background=1&autoplay=1&muted=1&loop=1`;
  return <>{still}<iframe className="hero-frame" src={src} title="Background video" allow="autoplay; fullscreen" tabIndex={-1} aria-hidden /></>;
}

// ── video / 360° tour ────────────────────────────────────────────
export function Embed({ title, text, url, ratio, puck }: P) {
  const [consent] = useConsent(puck?.metadata?.projectId);
  const [load, setLoad] = useState(false);
  const m = mediaSource(url);
  if (!m && !puck?.isEditing && puck?.metadata?.projectId) return null; // block previews (no project) still show the placeholder
  const show = !!puck?.isEditing || consent === "all" || load;
  return (
    <section id="tour" className="embed">
      <div className="wrap">
        {title ? <h2>{title}</h2> : null}
        {text ? <p className="embed-text">{text}</p> : null}
        <div className={`embed-box r-${ratio ?? "wide"}`}>
          {!m ? <div className="ph" style={{ height: "100%" }}>Paste a YouTube, Vimeo or 360° tour link</div>
            : m.kind === "file" ? <video src={m.src} controls playsInline />
            : show ? <iframe src={m.src} title={title || "Video"} allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer" allowFullScreen loading="lazy" style={puck?.isEditing ? { pointerEvents: "none" } : undefined} />
            : (
              <button type="button" className="embed-gate" onClick={() => setLoad(true)}>
                <span className="embed-play" aria-hidden />
                <b>{m.kind === "frame" ? "Start the tour" : "Play the video"}</b>
                <small>Loads content from {m.host}.</small>
              </button>
            )}
        </div>
      </div>
    </section>
  );
}

// ── questions and answers ────────────────────────────────────────
export function Faq({ title, items }: P) {
  const list: { q: string; a: string }[] = items ?? [];
  return (
    <section id="faq" className="faq">
      <div className="wrap">
        <h2>{title}</h2>
        <div className="faq-list">
          {list.map((i, k) => <details key={k}><summary>{i.q}</summary><p>{i.a}</p></details>)}
        </div>
      </div>
    </section>
  );
}

// ── travel times (location block) ────────────────────────────────
export const TRAVEL_MODES = [{ label: "On foot", value: "walk" }, { label: "By bike", value: "bike" }, { label: "Public transport", value: "transit" }, { label: "By car", value: "car" }];
export function TravelTimes({ items }: { items?: { place: string; mode: string; minutes: number | string }[] }) {
  const list = (items ?? []).filter((i) => i?.place);
  if (!list.length) return null;
  return (
    <ul className="loc-times">
      {list.map((i, k) => (
        <li key={k}>
          <span className="lt-min">{i.minutes}<small>min</small></span>
          <span className="lt-txt"><b>{i.place}</b><small>{TRAVEL_MODES.find((m) => m.value === i.mode)?.label ?? "On foot"}</small></span>
        </li>
      ))}
    </ul>
  );
}

// ── footer ───────────────────────────────────────────────────────
const FOOT_LOGO: Record<string, number> = { s: 28, m: 40, l: 56, xl: 76 };
/** "{year}" and "{company}" in the copyright line are filled in */
const fill = (t: string, company: string) => t.replace(/\{year\}/g, String(new Date().getFullYear())).replace(/\{company\}/g, company);

export function Footer({ company, imprintHref, privacyHref, logos, logosTitle, instagram, linkedin, facebook, layout, showLogo, logoSize, copyright, imprintLabel, privacyLabel, puck }: P) {
  const legal = useLegalHref(puck);
  const p = useProject(puck?.metadata?.projectId) ?? null;
  const marks: { src: string; caption?: string }[] = (logos ?? []).filter((l: any) => l?.src);
  const social = [["Instagram", instagram], ["LinkedIn", linkedin], ["Facebook", facebook]].filter(([, h]) => String(h ?? "").trim());
  const lay: string = layout ?? "split";
  const size = FOOT_LOGO[logoSize ?? "m"] ?? 40;
  const logo = showLogo === "yes" && p?.logo ? <img className={`foot-logo ${p.logoOnDark ? "on-dark" : ""}`} src={p.logo} alt={company || p.name} style={{ height: size }} /> : null;
  const copy = <span className="foot-copy">{fill(copyright || "© {year} {company}", company || p?.name || "")}</span>;
  const links = (
    <nav>
      {social.map(([n, h]) => <a key={n} href={h} target="_blank" rel="noreferrer">{n}</a>)}
      <a href={legal(imprintHref, "imprint")}>{imprintLabel || "Imprint"}</a>
      <a href={legal(privacyHref, "privacy")}>{privacyLabel || "Privacy"}</a>
    </nav>
  );
  return (
    <footer className={`foot-${lay}`} style={{ ["--foot-logo" as string]: `${size}px` }}>
      {marks.length ? (
        <div className="wrap foot-logos">
          {logosTitle ? <span className="foot-cap">{logosTitle}</span> : null}
          <div>{marks.map((l, k) => <img key={k} src={l.src} alt={l.caption || "Partner"} />)}</div>
        </div>
      ) : null}
      {lay === "three" ? (
        <div className="wrap foot-row"><div className="foot-l">{logo}</div>{copy}<div className="foot-r">{links}</div></div>
      ) : lay === "centered" ? (
        <div className="wrap foot-row">{logo}{copy}{links}</div>
      ) : (
        <div className="wrap foot-row"><div className="foot-l">{logo}{copy}</div>{links}</div>
      )}
    </footer>
  );
}
