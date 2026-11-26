"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { FONTS } from "@/lib/fonts";
import { uid, updateProject, useProject } from "@/lib/store";
import { previewHref } from "@/lib/sitedata";
import { templateOf } from "@/lib/templates";
import { CookieNotice, legalHref } from "./extras";
import { SiteContext, withDefaults, type SiteSettings } from "./settings";

function EntryModal({ s, projectId }: { s: SiteSettings["modal"]; projectId: string }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const key = `sb-modal-${projectId}`;
  useEffect(() => {
    if (s.once && sessionStorage.getItem(key)) return;
    const t = setTimeout(() => setOpen(true), 700);
    return () => clearTimeout(t);
  }, [key, s.once]);
  const close = () => { setOpen(false); try { sessionStorage.setItem(key, "1"); } catch {} };
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!f.get("privacy")) return;
    const base = { id: uid(), at: Date.now(), name: String(f.get("name")), email: String(f.get("email")) };
    updateProject(projectId, (x) => (s.form === "waitlist" ? { ...x, waitlist: [{ ...base, rooms: [], note: "Via entry pop-up" }, ...(x.waitlist ?? [])] } : { ...x, leads: [{ ...base, interests: ["Entry pop-up"] }, ...x.leads] }));
    setSent(true);
  };
  return (
    <div className="s-modal" role="dialog" aria-modal aria-label={s.title} onClick={close}>
      <div className={`s-modal-box ${s.image ? "has-img" : ""}`} onClick={(e) => e.stopPropagation()}>
        {s.image ? <div className="s-modal-img"><img src={s.image} alt="" /></div> : null}
        <div className="s-modal-body">
          <button className="s-modal-x" onClick={close} aria-label="Close">×</button>
          <h2>{s.title}</h2>
          <p>{s.text}</p>
          {s.form !== "none" ? (
            sent ? <div className="note" role="status">Thank you. We will be in touch.</div> : (
              <form className="form one" onSubmit={submit} style={{ marginTop: 20 }}>
                <input type="text" name="name" placeholder="Name" required aria-label="Name" />
                <input type="email" name="email" placeholder="Email" required aria-label="Email" />
                <label className="check"><input type="checkbox" name="privacy" required /><span>I accept the privacy policy.</span></label>
                <button className="s-btn" type="submit">{s.form === "waitlist" ? "Join the waiting list" : "Send"}</button>
              </form>
            )
          ) : s.cta ? <a className="s-btn" href={s.ctaHref} onClick={close} style={{ marginTop: 20 }}>{s.cta}</a> : null}
        </div>
      </div>
    </div>
  );
}

/** wraps every page: theme, typography, scroll animations, entry pop-up and the fixed disturber */
export default function SiteRoot({ children, puck, ...props }: any) {
  const settings = useMemo(() => withDefaults(props), [JSON.stringify(props)]); // eslint-disable-line react-hooks/exhaustive-deps
  const meta = puck?.metadata ?? {};
  const p = useProject(meta.projectId) ?? null;
  const editing = !!puck?.isEditing;
  const ref = useRef<HTMLDivElement>(null);
  const animate = settings.animations && !editing;
  const tpl = templateOf(settings.template);

  useEffect(() => {
    const el = ref.current;
    if (!el || !animate) return;
    const win = el.ownerDocument.defaultView ?? window;
    const io = new win.IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
    el.querySelectorAll("section, footer").forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [animate, children]);

  // links are stored as they will be on the real domain ("/contact", "#units"); here they are pointed at this preview
  useEffect(() => {
    const el = ref.current;
    if (!el || editing || !p) return;
    el.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
      const raw = a.dataset.href ?? a.getAttribute("href") ?? "";
      if (a.closest(".s-header") && raw.startsWith("#")) return; // the menu bar resolves its own section links
      const to = previewHref(raw, p, meta.page as string | null, !!meta.draft, meta.lang as string | undefined);
      if (to) { a.dataset.href = raw; a.setAttribute("href", to); }
    });
  });

  const ctx = useMemo(() => ({ settings, base: meta.base as string | undefined, draft: !!meta.draft, lang: meta.lang as string | undefined, editing }), [settings, meta.base, meta.draft, meta.lang, editing]);
  const d = settings.disturber;
  return (
    <SiteContext.Provider value={ctx}>
      <div
        ref={ref}
        className={`site t-${settings.template} nav-${settings.navVariant} ${settings.dividers ? "lines" : ""} ${animate ? "anim" : ""}`}
        style={{ ["--accent" as any]: meta.accent ?? p?.accent ?? "#1F5C4A", fontFamily: (FONTS[settings.fontFamily] ?? FONTS[tpl?.body ?? "geist"] ?? FONTS.geist).family, ["--f-head" as any]: (FONTS[settings.fontFamily] ?? FONTS[tpl?.head ?? "geist"] ?? FONTS.geist).family, ["--t-k" as any]: settings.textScale === "s" ? 0.92 : settings.textScale === "l" ? 1.1 : 1 }}
      >
        {children}
        {d.enabled && d.position === "corner" && !meta.partial ? <a className={`disturber corner ${d.shape}`} href={d.href}><span>{d.text}</span></a> : null}
        {settings.cookie.enabled && meta.live && !editing && p ? <CookieNotice s={settings.cookie} projectId={p.id} privacy={legalHref("", "privacy", p, !!meta.draft, meta.lang)} /> : null}
        {settings.modal.enabled && !editing && !meta.partial && !meta.framed && p ? <EntryModal s={settings.modal} projectId={p.id} /> : null}
      </div>
    </SiteContext.Provider>
  );
}
