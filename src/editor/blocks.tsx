"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useProject } from "@/lib/store";
import { HeroSlides, HeroVideo, TravelTimes } from "./extras";
import { useSite } from "./settings";

type P = Record<string, any>;
const LANG: Record<string, string> = { "de-CH": "DE", de: "DE", "fr-CH": "FR", fr: "FR", "it-CH": "IT", it: "IT", en: "EN" };

export async function fileToDataUrl(file: File, max = 1800, keepAlpha = false) {
  // logos: SVG stays SVG, PNG keeps its transparent background
  if (keepAlpha && file.type === "image/svg+xml") return await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return keepAlpha ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.82);
}

// ── header ───────────────────────────────────────────────────────
export function Header({ links, cta, ctaHref, puck }: P) {
  const p = useProject(puck?.metadata?.projectId) ?? null;
  const { settings, base, draft, lang } = useSite();
  const [open, setOpen] = useState(false);
  // a transparent header only works on top of a hero; sub-pages fall back to the classic one
  const variant = base && settings.navVariant === "overlay" ? "classic" : settings.navVariant;
  const fix = (h: string) => (h?.startsWith("#") && base ? base + h : h);
  const langs = p ? [p.locale, ...(p.locales ?? [])].filter((v, i, a) => v && a.indexOf(v) === i) : [];
  const current = lang ?? p?.locale;
  const langHref = (l: string) => `/site/${p?.id}?${[draft ? "draft=1" : "", l !== p?.locale ? `lang=${l}` : ""].filter(Boolean).join("&")}`;
  const nav = (links ?? []).map((l: any, k: number) => <a key={k} href={fix(l.href)} onClick={() => setOpen(false)}>{l.label}</a>);
  const brand = <a className="brand" href={base ?? "#"} aria-label={p?.name ?? "Home"}>{p?.logo ? <img src={p.logo} alt={p.name} /> : <span>{p?.name ?? "Project"}</span>}</a>;
  const switcher = langs.length > 1 ? (
    <div className="s-lang" aria-label="Language">{langs.map((l) => <a key={l} href={puck?.isEditing ? undefined : langHref(l)} aria-current={l === current ? "true" : undefined}>{LANG[l] ?? l.toUpperCase()}</a>)}</div>
  ) : null;
  const burger = (
    <button className="s-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}><i /><i /><i /></button>
  );
  return (
    <header className={`s-header v-${variant} ${p?.logoOnDark ? "dark" : ""} ${open ? "open" : ""}`}>
      <div className="wrap">
        {variant === "centered" ? (
          <>
            <nav aria-label="Sections" className="left">{nav.slice(0, Math.ceil(nav.length / 2))}</nav>
            {brand}
            <nav aria-label="More sections" className="right">{nav.slice(Math.ceil(nav.length / 2))}</nav>
          </>
        ) : (
          <>
            {brand}
            {variant !== "minimal" ? <nav aria-label="Sections">{nav}</nav> : <span style={{ flex: 1 }} />}
          </>
        )}
        {switcher}
        {cta ? <a className="s-btn" href={fix(ctaHref)}>{cta}</a> : null}
        {burger}
      </div>
      {open ? <div className="s-menu">{nav}{cta ? <a className="s-btn" href={fix(ctaHref)} onClick={() => setOpen(false)}>{cta}</a> : null}</div> : null}
    </header>
  );
}

// ── hero ─────────────────────────────────────────────────────────
export const HERO_VARIANTS = [
  { value: "background", label: "Photo, text left" },
  { value: "center", label: "Photo, text centred" },
  { value: "split", label: "Text beside photo" },
  { value: "framed", label: "Framed photo" },
  { value: "band", label: "Centre band" },
  { value: "below", label: "Photo, text below" },
  { value: "plain", label: "Text only" },
  { value: "slider", label: "Photo slideshow" },
  { value: "video", label: "Background video" },
];
export function Hero({ eyebrow, title, text, cta, ctaHref, image, variant, height, align, overlay, slides, video, puck }: P) {
  const { settings } = useSite();
  const p = useProject(puck?.metadata?.projectId) ?? null;
  const d = settings.disturber;
  const raw = variant ?? "background";
  // slideshow and video are the classic photo hero with a moving background
  const v = raw === "slider" || raw === "video" ? "background" : raw;
  const hasMedia = raw === "slider" ? (slides ?? []).some((s: any) => s?.src) || !!image : !!image || (raw === "video" && !!video);
  const badge = d.enabled && d.position === "hero" ? <a className={`disturber ${d.shape}`} href={d.href}><span>{d.text}</span></a> : null;
  const back = raw === "slider" ? <HeroSlides images={slides ?? []} fallback={image} /> : raw === "video" ? <HeroVideo url={video} poster={image} /> : image ? <img className="hero-back" src={image} alt="" /> : <div className="hero-back ph-dark" />;
  const copy = (
    <div className="hero-copy">
      <div className="s-eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p className="s-lead">{text}</p>
      {cta ? <a className="s-btn" href={ctaHref}>{cta}</a> : null}
    </div>
  );
  if (v === "background" || v === "center" || v === "framed")
    return (
      <section className={`hero hero-bg hv-${v} h-${height ?? "large"} a-${v === "background" ? align ?? "left" : "center"} ${hasMedia ? "" : "no-img"} hm-${raw}`}>
        <div className="hero-box">
          {back}
          <div className="hero-shade" style={{ opacity: (Number(overlay) || 45) / 100 }} />
          <div className="wrap">{copy}{badge}</div>
        </div>
      </section>
    );
  if (v === "band")
    return (
      <section className={`hero hero-bg hv-band h-${height ?? "large"} ${image ? "" : "no-img"}`}>
        <div className="hero-box">
          {back}
          <div className="hero-band">
            {p?.logo ? <img className="band-logo" src={p.logo} alt={p.name} /> : title?.trim().toLowerCase() === p?.name?.trim().toLowerCase() ? null : <div className="band-name">{p?.name}</div>}
            {!p?.logo && title?.trim().toLowerCase() === p?.name?.trim().toLowerCase() ? null : <span className="band-rule" />}
            <h1>{title}</h1>
            <p>{text}</p>
            {cta ? <a className="s-btn" href={ctaHref}>{cta}</a> : null}
          </div>
          {badge}
        </div>
      </section>
    );
  if (v === "below")
    return (
      <section className="hero hv-below">
        <div className="hero-photo" style={{ position: "relative" }}>{image ? <img className="cover" src={image} alt="" /> : <div className="ph-dark" style={{ height: "100%" }} />}{badge}</div>
        <div className="wrap" style={{ textAlign: "center" }}><div className="hero-copy" style={{ alignItems: "center", margin: "0 auto" }}><div className="s-eyebrow">{eyebrow}</div><h1>{title}</h1><p className="s-lead">{text}</p>{cta ? <a className="s-btn" href={ctaHref}>{cta}</a> : null}</div></div>
      </section>
    );
  return (
    <section className={`hero ${v === "plain" ? "hero-plain" : "hv-split"}`}>
      <div className="wrap s-grid">
        <div>
          <div className="s-eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          <p className="s-lead">{text}</p>
          {cta ? <a className="s-btn" href={ctaHref}>{cta}</a> : null}
        </div>
        {v !== "plain" ? <div className="hero-img" style={{ position: "relative" }}>{image ? <img className="cover" src={image} alt="" /> : <div className="ph" style={{ height: "100%" }}>Main image</div>}{badge}</div> : badge}
      </div>
    </section>
  );
}

// ── advantages (Vorteile) ────────────────────────────────────────
const ICONS: Record<string, string> = {
  shop: "M4 9l1.5-5h13L20 9M4 9v10h16V9M4 9h16M9 19v-5h6v5",
  food: "M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-2 2-2 6 0 8v10",
  transport: "M6 17V6a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v11M6 17h12M6 12h12M8 21l1-4M16 21l-1-4",
  park: "M12 21v-6M12 15c-4 0-6-3-4.5-6 0-3 2-5 4.5-5s4.5 2 4.5 5c1.5 3-.5 6-4.5 6Z",
  school: "M3 9l9-5 9 5-9 5-9-5ZM7 11.5V16c2 2 8 2 10 0v-4.5",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2",
  key: "M14 10a4 4 0 1 0-3.5 4L12 15.5h2V18h2.5v2.5H20V17l-6.200-6.200c.1-.3.2-.5.2-.8Z",
  heart: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z",
};
export const ICON_OPTIONS = Object.keys(ICONS).map((k) => ({ label: k[0].toUpperCase() + k.slice(1), value: k }));
export const ADV_VARIANTS = [
  { value: "band", label: "Colour band with icons" },
  { value: "cards", label: "Cards" },
  { value: "list", label: "Numbered list" },
  { value: "split", label: "Title beside list" },
];
export function Advantages({ title, items, variant }: P) {
  const v = variant ?? "band";
  const list: { icon: string; title: string; text: string }[] = items ?? [];
  const icon = (k: string) => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={(ICONS[k] ?? ICONS.heart)} /></svg>;
  return (
    <section id="advantages" className={`adv av-${v}`}>
      <div className="wrap">
        <h2>{title}</h2>
        <div className="adv-items">
          {list.map((i, k) => (
            <div key={k} className="adv-item">
              <span className="adv-icon">{v === "list" ? String(k + 1).padStart(2, "0") : icon(i.icon)}</span>
              <div><h3>{i.title}</h3><p>{i.text}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── text + image (Objekt) ────────────────────────────────────────
export const TI_VARIANTS = [
  { value: "right", label: "Image right" },
  { value: "left", label: "Image left" },
  { value: "round", label: "Round image" },
  { value: "stacked", label: "Image above text" },
];
export function TextImage({ title, text, image, cta, ctaHref, variant }: P) {
  const v = variant ?? "right";
  return (
    <section id="project" className={`ti tv-${v}`}>
      <div className="wrap">
        <div className="ti-copy"><h2>{title}</h2><p>{text}</p>{cta ? <a className="s-btn" href={ctaHref}>{cta}</a> : null}</div>
        <div className="ti-img">{image ? <img className="cover" src={image} alt="" /> : <div className="ph" style={{ height: "100%" }}>Image</div>}</div>
      </div>
    </section>
  );
}

// ── gallery ──────────────────────────────────────────────────────
type GImg = { src: string; caption: string };

/** sidebar shows a compact strip; "Manage images" opens a large sheet for uploading, ordering and captions */
export function GalleryField({ value, onChange, label = "Images", logos = false }: { value: GImg[]; onChange: (v: GImg[]) => void; label?: string; logos?: boolean }) {
  const list: GImg[] = (Array.isArray(value) ? value : []).filter((i) => i && i.src);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const drag = useRef<number | null>(null);
  const add = async (files: FileList | File[] | null) => {
    const arr = [...(files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;
    setBusy(true);
    const fresh = await Promise.all(arr.map(async (f) => ({ src: logos ? await fileToDataUrl(f, 480, true) : await fileToDataUrl(f), caption: "" })));
    onChange([...list, ...fresh]);
    setBusy(false);
  };
  const move = (from: number, to: number) => { if (from === to) return; const a = [...list]; const [x] = a.splice(from, 1); a.splice(to, 0, x); onChange(a); };
  return (
    <div className={`gf ${logos ? "gf-logos" : ""}`}>
      <div className="gf-head"><span>{label}</span><span className="gf-count">{list.length}</span></div>
      <div className="gf-strip" onClick={() => setOpen(true)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(true)}>
        {list.slice(0, 5).map((i, k) => <img key={k} src={i.src} alt="" />)}
        {list.length > 5 ? <span className="gf-more">+{list.length - 5}</span> : null}
        {!list.length ? <span className="gf-empty">No images yet</span> : null}
      </div>
      <div className="gf-actions">
        <label className="btn btn-sm btn-primary">{busy ? "Loading …" : "+ Add images"}<input type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} /></label>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)} disabled={!list.length}>Arrange & captions</button>
      </div>
      {open ? createPortal(
        <div className={`gf-modal ${logos ? "gf-logos" : ""}`} role="dialog" aria-modal aria-label="Gallery images" onClick={() => setOpen(false)}>
          <div className="gf-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="gf-top">
              <div><div className="eyebrow">{logos ? "Logos" : "Gallery"}</div><div className="gf-title">{list.length} {list.length === 1 ? "image" : "images"}</div></div>
              <span style={{ flex: 1 }} />
              <label className="btn btn-primary">{busy ? "Loading …" : "+ Add images"}<input type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} /></label>
              <button type="button" className="btn" onClick={() => setOpen(false)}>Done</button>
            </div>
            <div className={`gf-grid ${over ? "over" : ""}`} onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)} onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setOver(false); add(e.dataTransfer.files); } }}>
              {list.map((i, k) => (
                <figure key={i.src.slice(-24) + k} draggable onDragStart={() => (drag.current = k)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (drag.current !== null) move(drag.current, k); drag.current = null; }}>
                  <div className="gf-thumb"><img src={i.src} alt="" /><span className="gf-num">{k + 1}</span><button type="button" onClick={() => onChange(list.filter((_, n) => n !== k))} aria-label="Remove image" title="Remove">×</button></div>
                  <input className="input" value={i.caption ?? ""} placeholder={logos ? "Name (optional)" : "Caption (optional)"} onChange={(e) => onChange(list.map((x, n) => (n === k ? { ...x, caption: e.target.value } : x)))} aria-label={`Caption ${k + 1}`} />
                </figure>
              ))}
              <label className="gf-drop">
                <span style={{ fontSize: 28, lineHeight: 1 }}>+</span>
                <span>Drop images here or click</span>
                <input type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
              </label>
            </div>
            <div className="gf-foot">{logos ? "Drag a logo onto another to change the order. PNG with a transparent background or SVG works best." : "Drag an image onto another to change the order. The first image is the large one in the mosaic layout."}</div>
          </div>
        </div>,
        document.body // the editor sidebar clips fixed elements, so the sheet lives at the top of the page
      ) : null}
    </div>
  );
}

export function Gallery({ title, images, layout, columns, puck }: P) {
  const list: GImg[] = images ?? [];
  const track = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<number | null>(null);
  const shots = list.filter((i) => i.src);
  const slide = (d: number) => track.current?.scrollBy({ left: d * track.current.clientWidth * 0.8, behavior: "smooth" });
  const mode = layout ?? "grid";
  useEffect(() => {
    if (box === null) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setBox(null); if (e.key === "ArrowRight") setBox((b) => (b === null ? b : (b + 1) % shots.length)); if (e.key === "ArrowLeft") setBox((b) => (b === null ? b : (b - 1 + shots.length) % shots.length)); };
    const win = track.current?.ownerDocument.defaultView ?? window;
    win.addEventListener("keydown", key);
    return () => win.removeEventListener("keydown", key);
  }, [box, shots.length]);
  return (
    <section id="gallery">
      <div className="wrap">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
          <h2>{title}</h2>
          {mode === "slider" && list.length > 1 ? <div className="seg" role="group" aria-label="Slides"><button onClick={() => slide(-1)} aria-label="Previous">←</button><button onClick={() => slide(1)} aria-label="Next">→</button></div> : null}
        </div>
        <div ref={track} className={`gallery g-${mode}`} style={mode === "grid" || mode === "masonry" ? { ["--g-cols" as string]: Number(columns) || 3 } : undefined}>
          {list.map((i, k) => (
            <figure key={k}>
              <div className="frame">
                {i.src ? <img className="cover" src={i.src} alt={i.caption || ""} onClick={() => !puck?.isEditing && setBox(shots.indexOf(i))} style={{ cursor: puck?.isEditing ? undefined : "zoom-in" }} /> : <div className="ph" style={{ height: "100%", minHeight: mode === "masonry" ? [220, 320, 260, 180][k % 4] : undefined }}>{i.caption || "Image"}</div>}
              </div>
              {i.caption ? <figcaption>{i.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
      </div>
      {box !== null && shots[box] ? (
        <div className="lightbox" role="dialog" aria-modal aria-label="Image" onClick={() => setBox(null)}>
          <button className="lb-x" aria-label="Close">×</button>
          {shots.length > 1 ? <button className="lb-nav prev" aria-label="Previous" onClick={(e) => { e.stopPropagation(); setBox((box - 1 + shots.length) % shots.length); }}>←</button> : null}
          <figure onClick={(e) => e.stopPropagation()}><img src={shots[box].src} alt={shots[box].caption || ""} /><figcaption>{shots[box].caption} <span>{box + 1} / {shots.length}</span></figcaption></figure>
          {shots.length > 1 ? <button className="lb-nav next" aria-label="Next" onClick={(e) => { e.stopPropagation(); setBox((box + 1) % shots.length); }}>→</button> : null}
        </div>
      ) : null}
    </section>
  );
}

export const GALLERY_VARIANTS = [
  { value: "grid", label: "Grid" },
  { value: "slider", label: "Slider" },
  { value: "mosaic", label: "Mosaic" },
  { value: "masonry", label: "Masonry" },
];
export const MAP_VARIANTS = [
  { value: "stacked", label: "Text above map" },
  { value: "side", label: "Text beside map" },
  { value: "full", label: "Map full width" },
  { value: "maponly", label: "Map only" },
];

// ── location / map ───────────────────────────────────────────────
export function Location({ title, text, zoom, mapStyle, mapHeight, layout, showAddress, times, puck }: P) {
  const p = useProject(puck?.metadata?.projectId) ?? null;
  const d = 0.6 / Math.pow(2, (Number(zoom) || 15) - 10);
  const lat = p?.lat ?? 47.3769, lng = p?.lng ?? 8.5417;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d / 2},${lng + d},${lat + d / 2}&layer=mapnik&marker=${lat},${lng}`;
  const place = p ? [p.address, [p.zip, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  const map = (
    <div className={`map-box h-${mapHeight ?? "m"}`}>
      <iframe className={`map ${mapStyle === "colour" ? "colour" : ""}`} src={src} title="Map" loading="lazy" style={puck?.isEditing ? { pointerEvents: "none" } : undefined} />
      {showAddress !== "no" && place ? <div className="map-card"><b>{p?.name}</b><span>{place}</span><a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`} target="_blank" rel="noreferrer">Open map →</a></div> : null}
    </div>
  );
  const mode = layout ?? "stacked";
  if (mode === "maponly") return <section id="location" className="loc-full" style={{ padding: 0 }}>{map}</section>;
  if (mode === "full")
    return (
      <section id="location" className="loc-full">
        <div className="wrap"><h2>{title}</h2><p style={{ marginBottom: 24, color: "#45413b", maxWidth: "44em" }}>{text}</p><TravelTimes items={times} /></div>
        {map}
      </section>
    );
  return (
    <section id="location">
      <div className={`wrap ${mode === "side" ? "loc-side" : ""}`}>
        <div><h2>{title}</h2><p style={{ marginBottom: 24, color: "#45413b", maxWidth: "44em" }}>{text}</p><TravelTimes items={times} /></div>
        {map}
      </div>
    </section>
  );
}
