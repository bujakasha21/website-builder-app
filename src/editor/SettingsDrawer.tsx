"use client";
/* eslint-disable @next/next/no-img-element */
import { usePuck, type Data } from "@puckeditor/core";
import { useState } from "react";
import { FONTS } from "@/lib/fonts";
import { updateProject } from "@/lib/store";
import { templateOf, templatesFor } from "@/lib/templates";
import BuildLoader from "@/components/BuildLoader";
import type { Project } from "@/lib/types";
import { fileToDataUrl } from "./blocks";
import { starterLegal } from "./extras";
import { withDefaults, type SiteSettings } from "./settings";
import ThemeSection from "./ThemeSection";
import { flag } from "@/lib/flags";

export function Tip({ text }: { text: string }) {
  return <span className="tip" tabIndex={0} aria-label={text} data-tip={text}>i</span>;
}

function Row({ label, tip, children }: { label: string; tip?: string; children: React.ReactNode }) {
  return (
    <div className="st-row">
      <div className="st-label">{label}{tip ? <Tip text={tip} /> : null}</div>
      <div className="st-ctrl">{children}</div>
    </div>
  );
}
function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: (readonly [T, string])[] }) {
  return (
    <div className="st-seg" role="group">
      {options.map(([v, l]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="st-toggle" onClick={() => onChange(!on)}><i /></button>;
}

const NAVS: [SiteSettings["navVariant"], string, string][] = [
  ["classic", "Classic", "Logo left, links right"],
  ["centered", "Centred", "Logo in the middle"],
  ["overlay", "Over the hero", "Transparent on the image"],
  ["minimal", "Minimal", "Logo and menu button"],
];
const LOCALES: [string, string][] = [["de-CH", "Deutsch"], ["fr-CH", "Français"], ["it-CH", "Italiano"], ["en", "English"]];
const TABS = ["Look", "Menu", "Pop-up", "Disturber", "Languages", "Legal"] as const;

/** site-wide options in one tidy place instead of a long sidebar */
export default function SettingsDrawer({ project, onClose, initialTab }: { project: Project; onClose: () => void; initialTab?: (typeof TABS)[number] }) {
  const { appState, dispatch } = usePuck();
  const [tab, setTab] = useState<(typeof TABS)[number]>(initialTab ?? "Look");
  const [switching, setSwitching] = useState<SiteSettings["template"] | null>(null);
  const s = withDefaults(appState.data.root.props as Record<string, unknown>);
  const set = (patch: Partial<SiteSettings>) => dispatch({ type: "setData", data: { ...appState.data, root: { ...appState.data.root, props: { ...s, ...patch } } } as Data });
  const setModal = (p: Partial<SiteSettings["modal"]>) => set({ modal: { ...s.modal, ...p } });
  const setDist = (p: Partial<SiteSettings["disturber"]>) => set({ disturber: { ...s.disturber, ...p } });
  const extra = project.locales ?? [];
  const setLegal = (p: Partial<SiteSettings["legal"]>) => set({ legal: { ...s.legal, ...p } });
  const company = ((appState.data.content as { type: string; props: Record<string, unknown> }[]).find((c) => c.type === "Footer")?.props.company as string) ?? project.name;

  return (
    <aside className="st-drawer rise" aria-label="Site settings">
      {switching ? <BuildLoader ready minMs={3000} first={switching} title={`Switching to ${templateOf(switching)?.name ?? "the new template"}`} lines={["Changing the fonts …", "Mixing the colours …", "Moving the sections …"]} onDone={() => setSwitching(null)} /> : null}
      <div className="st-head">
        <div><div className="eyebrow">Site settings</div><div className="st-title">{project.name}</div></div>
        <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="st-tabs" role="tablist">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      <div className="st-body">
        {tab === "Look" && (
          <>
            <Row label="Template" tip="Overall look. Switching keeps all content.">
              <select className="select" value={s.template} onChange={(e) => { const t = e.target.value as SiteSettings["template"]; set({ template: t }); setSwitching(t); }}>{templatesFor(s.template).map((t) => <option key={t.id} value={t.id}>{t.name} – {t.note}</option>)}</select>
            </Row>
            {flag("theme") ? <ThemeSection project={project} template={s.template} legacy={{ fontFamily: s.fontFamily, textScale: s.textScale }} /> : (
            <Row label="Text size" tip="Makes all text on the site a little smaller or larger. Headings and running text keep their proportions.">
              <Seg value={s.textScale} onChange={(v) => set({ textScale: v })} options={[["s", "Small"], ["m", "Normal"], ["l", "Large"]]} />
            </Row>
            )}
            <details className="st-adv"><summary>Advanced settings</summary>
            {flag("theme") ? null : <Row label="Font family">
              <select className="select" value={s.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
                <option value="template">From the template</option>
                {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
              </select>
            </Row>}
            <Row label="Scroll animations" tip="Sections fade and rise into place as the visitor scrolls. Shown on the site, not while editing.">
              <Toggle on={s.animations} onChange={(v) => set({ animations: v })} label="Scroll animations" />
            </Row>
            <Row label="Lines between sections">
              <Toggle on={s.dividers} onChange={(v) => set({ dividers: v })} label="Lines between sections" />
            </Row>
            <Row label="Clicking an apartment" tip="Pop-up: details open over the list. Own page: a page per apartment with plan, position in the building and enquiry form.">
              <Seg value={s.unitDetail} onChange={(v) => set({ unitDetail: v })} options={[["modal", "Opens a pop-up"], ["page", "Opens its own page"]]} />
            </Row>
            </details>
          </>
        )}
        {tab === "Menu" && (
          <>
            <p className="st-note">The header shows your logo only. Without a logo it falls back to the project name.</p>
            <div className="st-cards">
              {NAVS.map(([v, t, d]) => (
                <button key={v} type="button" aria-pressed={s.navVariant === v} onClick={() => set({ navVariant: v })} className="st-card">
                  <span className={`nav-mock m-${v}`}><i className="logo" /><i className="l" /><i className="l" /><i className="l" /><i className="b" /></span>
                  <span className="st-card-t">{t}</span><span className="st-card-d">{d}</span>
                </button>
              ))}
            </div>
            <p className="st-note">Links and the button are edited on the “Header / navigation” block itself.</p>
          </>
        )}
        {tab === "Pop-up" && (
          <>
            <Row label="Show a pop-up on entry" tip="Opens shortly after the page loads, once per visit.">
              <Toggle on={s.modal.enabled} onChange={(v) => setModal({ enabled: v })} label="Entry pop-up" />
            </Row>
            <fieldset disabled={!s.modal.enabled} className="st-group">
              <Row label="Title"><input className="input" value={s.modal.title} onChange={(e) => setModal({ title: e.target.value })} /></Row>
              <Row label="Text"><textarea className="input" rows={3} value={s.modal.text} onChange={(e) => setModal({ text: e.target.value })} /></Row>
              <Row label="Image" tip="Optional. Without an image the pop-up is text only.">
                <div className="st-img">
                  {s.modal.image ? <img src={s.modal.image} alt="" /> : null}
                  <label className="btn btn-sm">{s.modal.image ? "Replace" : "Upload image"}<input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setModal({ image: await fileToDataUrl(f, 1400) }); e.target.value = ""; }} /></label>
                  {s.modal.image ? <button type="button" className="btn btn-sm btn-ghost" onClick={() => setModal({ image: "" })}>Remove</button> : null}
                </div>
              </Row>
            <details className="st-adv"><summary>Advanced settings</summary>
              <Row label="Content below the text">
                <Seg value={s.modal.form} onChange={(v) => setModal({ form: v })} options={[["none", "Button"], ["contact", "Contact form"], ["waitlist", "Waiting list"]]} />
              </Row>
              {s.modal.form === "none" ? (
                <Row label="Button">
                  <div className="st-pair"><label><span>Label</span><input className="input" value={s.modal.cta} onChange={(e) => setModal({ cta: e.target.value })} /></label><label><span>Link</span><input className="input" value={s.modal.ctaHref} onChange={(e) => setModal({ ctaHref: e.target.value })} /></label></div>
                </Row>
              ) : <p className="st-note">{s.modal.form === "contact" ? "Name and email arrive as a lead." : "Name and email are added to the waiting list."} The privacy checkbox is always included.</p>}
              <Row label="Only once per visit"><Toggle on={s.modal.once} onChange={(v) => setModal({ once: v })} label="Only once per visit" /></Row>
            </details>
            </fieldset>
          </>
        )}
        {tab === "Disturber" && (
          <>
            <Row label="Show a disturber" tip="A small eye-catcher such as “Move in from April”.">
              <Toggle on={s.disturber.enabled} onChange={(v) => setDist({ enabled: v })} label="Disturber" />
            </Row>
            <fieldset disabled={!s.disturber.enabled} className="st-group">
              <Row label="Text"><input className="input" value={s.disturber.text} onChange={(e) => setDist({ text: e.target.value })} /></Row>
              <Row label="Link"><input className="input" value={s.disturber.href} onChange={(e) => setDist({ href: e.target.value })} /></Row>
            <details className="st-adv"><summary>Advanced settings</summary>
              <Row label="Position"><Seg value={s.disturber.position} onChange={(v) => setDist({ position: v })} options={[["hero", "On the hero"], ["corner", "Fixed in the corner"]]} /></Row>
              <Row label="Shape"><Seg value={s.disturber.shape} onChange={(v) => setDist({ shape: v })} options={[["round", "Round"], ["pill", "Pill"]]} /></Row>
            </details>
            </fieldset>
          </>
        )}
        {tab === "Legal" && (
          <>
            <Row label="Cookie notice" tip="A small notice at the bottom of the site. Videos and 360° tours only load after the visitor agrees.">
              <Toggle on={s.cookie.enabled} onChange={(v) => set({ cookie: { ...s.cookie, enabled: v } })} label="Cookie notice" />
            </Row>
            <Row label="Contact email" tip="Shown on the imprint and privacy pages.">
              <input className="input" type="email" value={s.legal.email} placeholder="info@example.ch" onChange={(e) => setLegal({ email: e.target.value })} />
            </Row>
            <p className="st-note">Your site already has an imprint and a privacy page with starter wording, linked in the footer. Have the wording checked before you go live, or paste your own below.</p>
            <details className="st-adv"><summary>Advanced settings</summary>
            {(["imprint", "privacy"] as const).map((k) => (
              <div key={k} className="st-legal">
                <div className="st-legal-head">
                  <span className="st-label">{k === "imprint" ? "Imprint" : "Privacy policy"}</span>
                  <span className="st-legal-state">{s.legal[k].trim() ? "Your own text" : "Starter text"}</span>
                  <a className="btn btn-sm btn-ghost" href={`/site/${project.id}/legal/${k}?draft=1`} target="_blank" rel="noreferrer">View page</a>
                </div>
                <textarea className="input" rows={7} value={s.legal[k]} placeholder={starterLegal(k, project, company, s.legal.email)} onChange={(e) => setLegal({ [k]: e.target.value })} aria-label={k === "imprint" ? "Imprint text" : "Privacy policy text"} />
                <div className="st-legal-foot">
                  {s.legal[k].trim() ? <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLegal({ [k]: "" })}>Back to the starter text</button> : <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLegal({ [k]: starterLegal(k, project, company, s.legal.email) })}>Edit the starter text</button>}
                  <span>A line starting with “# ” becomes a heading.</span>
                </div>
              </div>
            ))}
            </details>
          </>
        )}
        {tab === "Languages" && (
          <>
            <p className="st-note">Each language has its own copy of the page. A new language starts as a copy of the main one; you then translate it in the editor (language switch in the top bar).</p>
            {LOCALES.map(([code, name]) => {
              const main = code === project.locale;
              const on = main || extra.includes(code);
              return (
                <Row key={code} label={name + (main ? " · main" : "")}>
                  <Toggle on={on} label={name} onChange={(v) => { if (!main) updateProject(project.id, (x) => ({ ...x, locales: v ? [...(x.locales ?? []), code] : (x.locales ?? []).filter((l) => l !== code) })); }} />
                </Row>
              );
            })}
            <p className="st-note">Visitors get a language switch in the header as soon as there is more than one.</p>
          </>
        )}
      </div>
    </aside>
  );
}
