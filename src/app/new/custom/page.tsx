"use client";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, ViewTransition } from "react";
import { SitePreview, TopBar } from "@/components/shell";
import { demoExtras, seedProjects } from "@/lib/seed";
import Plan2D from "@/components/plan/Plan2D";
import { IsometryMapper } from "@/components/Isometry";
import { fileToDataUrl, GalleryField } from "@/editor/blocks";
import UnitsEditor from "@/components/UnitsEditor";
import { parseIsometry, type Isometry } from "@/lib/isometry";
import { groupColor, groupOf, groupsOf, slotsOf } from "@/lib/building";
import { planFromFile, planFromUrl } from "@/lib/floorplan/pdf";
import { addProject, uid, upsertProject, useDb } from "@/lib/store";
import { buildPage, TEMPLATES } from "@/lib/templates";
import { readLogo } from "@/lib/logo";
import { clearBriefDraft, readBriefDraft } from "@/lib/brief";
import { needsUnits, VIBES, type Brief } from "@/lib/profile";
import type { FloorPlan, Project, TemplateId, Unit, UnitUse } from "@/lib/types";

const Building3D = dynamic(() => import("@/components/plan/Building3D"), { ssr: false });
const PROVIDERS = [["wincasa", "Wincasa"], ["flatfox", "Flatfox"], ["casagateway", "CasaGateway / CasaOne"], ["melon", "Melon"], ["custom", "Other REST / JSON"]] as const;
import { unitsFromFile } from "@/lib/units-import";

const STEPS = ["Name", "Address", "Logo & colour", "Photos", "Language", "Apartments", "Building", "Look"];
/** the everyday path: name, logo, photos, look. Address, language, apartments and the building sit behind "Advanced settings" and start with good defaults. */
const SIMPLE = [0, 2, 3, 7];
const CITIES: Record<string, [number, number]> = {
  zürich: [47.3769, 8.5417], zurich: [47.3769, 8.5417], bern: [46.948, 7.4474], basel: [47.5596, 7.5886], luzern: [47.0502, 8.3093],
  winterthur: [47.4988, 8.7237], "st. gallen": [47.4245, 9.3767], genf: [46.2044, 6.1432], lausanne: [46.5197, 6.6323], lugano: [46.0037, 8.9511], zug: [47.1662, 8.5155], baden: [47.4733, 8.3059],
};
const SWATCHES = ["#1F5C4A", "#1D3F72", "#7A2E2E", "#8A5A1B", "#3B3B3B", "#5B3E7A"];


export default function Wizard() {
  const router = useRouter();
  const db = useDb();
  const [step, setStep] = useState(0);
  const [adv, setAdv] = useState(false);
  // the interview on /new: name, city, languages, look and features carry over; sites without apartments skip those steps
  const [brief, setBrief] = useState<Brief | null>(null);
  const property = !brief || needsUnits(brief);
  const flow = (adv ? STEPS.map((_, i) => i) : SIMPLE).filter((i) => property || (STEPS[i] !== "Apartments" && STEPS[i] !== "Building"));
  const at = Math.max(0, flow.indexOf(step));
  const go = (d: number) => setStep(flow[Math.max(0, Math.min(flow.length - 1, at + d))]);
  const [f, setF] = useState({ name: "", uses: ["apartment"] as UnitUse[], type: "rent" as "rent" | "sale", address: "", zip: "", city: "", accent: SWATCHES[0], logo: "", logoOnDark: false, locale: "en", source: "file" as "file" | "api" | "manual" | "demo", provider: "wincasa", apiUrl: "", apiRef: "", template: "atelier" as TemplateId });
  useEffect(() => {
    const d = readBriefDraft();
    if (!d) return;
    const vibe = VIBES.find((v) => v.id === d.brief.vibe);
    setBrief(d.brief); // eslint-disable-line react-hooks/set-state-in-effect
    setF((x) => ({ ...x, name: d.brief.name, city: d.city || x.city, address: d.address || x.address, zip: d.zip || x.zip, type: d.brief.offer ?? x.type, locale: d.brief.languages[0] ?? x.locale, template: vibe?.template ?? x.template, accent: TEMPLATES.find((t) => t.id === vibe?.template)?.accent ?? x.accent, uses: d.brief.kind === "commercial" ? ["commercial"] : x.uses }));
  }, []);
  const [units, setUnits] = useState<Unit[]>([]);
  const [fileNote, setFileNote] = useState("");
  const [palette, setPalette] = useState<string[]>([]);
  const [heroImage, setHeroImage] = useState("");
  const [gallery, setGallery] = useState<{ src: string; caption: string }[]>([]);
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [planBusy, setPlanBusy] = useState("");
  const [iso, setIso] = useState<Isometry | null>(null);
  const [bldSource, setBldSource] = useState<"svg" | "pdf">("svg");
  const [isoError, setIsoError] = useState("");
  const [planView, setPlanView] = useState<"2d" | "bld">("bld");
  const [preview, setPreview] = useState<{ tpl: TemplateId; device: "desktop" | "mobile" } | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const base = useMemo(() => {
    const sample = () => {
      const u: Unit[] = seedProjects()[0].units.map((x) => (f.type === "sale" ? { ...x, price: x.price * 290, charges: undefined, status: x.status === "rented" ? ("sold" as const) : x.status } : x));
      u.push(...demoExtras(f.uses).map((x) => (f.type === "sale" && x.use !== "parking" ? { ...x, price: x.price * 290, charges: undefined } : x)));
      return u;
    };
    // an API feed has no live endpoint in this preview, so it starts with sample data
    // nobody has to enter apartments first: without any, the site starts with sample apartments that are replaced later
    const u = f.source === "demo" || f.source === "api" || (!units.length && !adv) ? sample() : units;
    return { name: f.name.trim() || "New project", address: f.address, zip: f.zip, city: f.city, type: f.type, uses: f.uses.length ? f.uses : (["apartment"] as UnitUse[]), units: u, floorPlans: plan ? [plan] : [], heroImage, gallery };
  }, [f, units, plan, heroImage, gallery]);

  // nothing is required: every step has a default, so "Next" and "Create" always work
  const canNext = true;

  const [logoError, setLogoError] = useState("");
  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { src, palette: pal, onDark } = await readLogo(file);
      setPalette(pal);
      set({ logo: src, accent: pal[0], logoOnDark: onDark });
      setLogoError("");
    } catch {
      setPalette([]);
      setLogoError("This file could not be read. Use SVG, PNG, JPG or WebP.");
    }
    e.target.value = "";
  };

  const makeProject = (id: string): Project => {
    const [lat, lng] = CITIES[f.city.trim().toLowerCase()] ?? CITIES.zürich;
    const { heroImage: _h, gallery: _g, ...core } = base;
    void _h; void _g;
    return {
      ...core, id, slug: id, lat, lng, locale: f.locale, accent: f.accent, logo: f.logo || undefined, logoOnDark: f.logoOnDark || undefined, template: f.template,
      isometry: iso ?? undefined,
      isoMode: iso ? "2d" : plan ? "3d" : undefined,
      connector: f.source === "api" ? { provider: f.provider, baseUrl: f.apiUrl, projectRef: f.apiRef } : undefined,
      kind: brief?.kind, brief: brief ? { ...brief, name: f.name, start: "steps" } : undefined, locales: brief ? brief.languages.filter((l) => l !== f.locale) : undefined,
      draft: buildPage(base, f.template, brief ?? undefined), published: null, leads: [], slots: [], bookings: [], views: 0, createdAt: Date.now(),
    };
  };
  const create = () => {
    const id = (f.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project") + "-" + uid().slice(0, 4);
    addProject(makeProject(id));
    clearBriefDraft();
    router.push(`/edit/${id}`);
  };
  const openPreview = (tpl: TemplateId) => {
    upsertProject({ ...makeProject("__preview"), template: tpl, draft: buildPage(base, tpl, brief ?? undefined) });
    setTimeout(() => setPreview({ tpl, device: "desktop" }), 350); // let the store reach the preview frame
  };
  const loadIso = (text: string) => {
    try { setIso(parseIsometry(text, base.units)); setIsoError(""); } catch { setIso(null); setIsoError("This file is not a readable SVG."); }
  };
  const loadPlan = async (make: () => Promise<FloorPlan>, label: string) => {
    setPlanBusy(label);
    try {
      const fp = await make();
      setPlan({ ...fp, rooms: fp.rooms.map((r) => ({ ...r, confirmed: true })) });
    } catch {
      setPlan(null);
    }
    setPlanBusy("");
  };

  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      <TopBar />
      <main className="flex-1 w-full max-w-[1200px] mx-auto px-6 py-10 grid grid-cols-12 gap-6">
        <div className="col-span-12 md:col-span-3 text-[13px]">
          <ol>
            {flow.map((i, n) => (
              <li key={STEPS[i]}>
                <button onClick={() => setStep(i)} className={`w-full text-left py-3 flex gap-3 tnum wz-step ${i === step ? "on" : n < at ? "past" : ""}`}>
                  <span className="wz-num">{n < at ? "✓" : n + 1}</span>{STEPS[i]}
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className={`adv-toggle mt-4 ${adv ? "open" : ""}`} aria-expanded={adv} onClick={() => { const next = !adv; setAdv(next); if (!next && !SIMPLE.includes(step)) setStep(SIMPLE.filter((i) => i <= step).pop() ?? 0); }}>
            <span>Advanced settings</span><small>{adv ? "Hide the extra steps" : "Address, language, apartments, building"}</small><i aria-hidden />
          </button>
          <p className="text-muted text-[12px] mt-3">Nothing here is required. Skip what you do not have yet: it can all be added in the editor.</p>
        </div>

        <section className="col-span-12 md:col-span-9 md:pl-10 rise" key={step}>
          {step === 0 && (
            <Step title="Tell us about the building" hint="The name becomes the title of the website. What the building offers decides which lists the site shows.">
              <Field label="Project name"><input className="input" autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Wohnen am Park" /></Field>
              <Field label="What does the building offer?">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([["apartment", "Apartments", "Unit list with rooms, area and rent, linked to the building model"], ["commercial", "Commercial / offices", "Retail, gastronomy, offices and practices in their own list"], ["parking", "Parking", "Garage and outdoor spaces as an add-on"]] as const).map(([v, t, d]) => {
                    const on = f.uses.includes(v);
                    return (
                      <button key={v} type="button" aria-pressed={on} onClick={() => setF((x) => ({ ...x, uses: x.uses.includes(v) ? x.uses.filter((y) => y !== v) : [...x.uses, v] }))} className={`panel p-4 text-left transition-all ${on ? "border-ink" : "hover:border-line-strong"}`} style={{ transform: on ? "translateY(-2px)" : "none" }}>
                        <span className="flex items-center justify-between font-medium">{t}<span aria-hidden className="w-4 h-4 border flex items-center justify-center text-[11px]" style={{ borderRadius: 3, borderColor: "var(--line-strong)", visibility: on ? "hidden" : "visible" }} /></span>
                        <span className="text-muted text-[13px] block mt-1">{d}</span>
                      </button>
                    );
                  })}
                </div>
              </Field>
            </Step>
          )}
          {step === 1 && (
            <Step title="Where is it?" hint="Address for the map, contact details and structured data.">
              <Field label="Street and number"><input className="input" autoFocus value={f.address} onChange={(e) => set({ address: e.target.value })} placeholder="Parkweg 12" /></Field>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Postcode"><input className="input tnum" value={f.zip} onChange={(e) => set({ zip: e.target.value })} placeholder="8050" /></Field>
                <div className="col-span-2"><Field label="Town"><input className="input" value={f.city} onChange={(e) => set({ city: e.target.value })} placeholder="Zürich" /></Field></div>
              </div>
            </Step>
          )}
          {step === 2 && (
            <Step title="Brand" hint="Upload your logo and pick one accent colour. The suggestions are read from the logo.">
              <Field label="Logo (optional)">
                {f.logo ? (
                  <div className="logo-tile rise" style={{ background: f.logoOnDark ? "var(--ink)" : "var(--sunken)" }}>
                    <img src={f.logo} alt="Logo" />
                    <div className="logo-actions">
                      <label title="Replace logo" aria-label="Replace logo">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 10.5V3M5 5.5 8 2.5l3 3M3 10.5v2a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2" /></svg>
                        <input type="file" accept="image/*,.svg" hidden onChange={onLogo} />
                      </label>
                      <button type="button" title="Remove logo" aria-label="Remove logo" onClick={() => { set({ logo: "", logoOnDark: false }); setPalette([]); }}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M4 4l8 8M12 4l-8 8" /></svg>
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="block border border-dashed border-line-strong hover:border-ink transition-colors p-8 text-center cursor-pointer" style={{ borderRadius: 6 }}>
                    <span className="font-medium block">Upload logo</span>
                    <span className="text-muted text-[13px]">PNG, SVG or JPG. We read matching colours from it.</span>
                    <input type="file" accept="image/*,.svg" hidden onChange={onLogo} />
                  </label>
                )}
                {logoError ? <p className="text-err text-[13px] mt-2" role="alert">{logoError}</p> : null}
              </Field>
              <Field label={palette.length ? "Suggested from your logo" : "Accent colour"}>
                <div className="flex items-stretch gap-6 flex-wrap">
                  <div className="flex gap-2">
                    {(palette.length ? palette : SWATCHES).map((c, i) => {
                      const on = f.accent.toLowerCase() === c.toLowerCase();
                      return (
                        <button key={c + i} aria-label={`Colour ${c}`} aria-pressed={on} onClick={() => set({ accent: c })} className="rise text-left" style={{ animationDelay: `${i * 50}ms` }}>
                          <span className="block transition-transform" style={{ width: 64, height: 64, background: c, borderRadius: 4, outline: on ? "2px solid var(--accent)" : "1px solid var(--line)", outlineOffset: on ? 2 : 0, transform: on ? "translateY(-2px)" : "none" }} />
                          <span className="block text-[11px] tnum text-muted mt-2">{c.toUpperCase()}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="pl-6 border-l border-line">
                    <label className="block cursor-pointer">
                      <span className="block relative overflow-hidden" style={{ width: 64, height: 64, borderRadius: 4, background: f.accent, outline: !(palette.length ? palette : SWATCHES).some((c) => c.toLowerCase() === f.accent.toLowerCase()) ? "2px solid var(--ink)" : "1px solid var(--line)", outlineOffset: 2 }}>
                        <input type="color" value={f.accent} onChange={(e) => set({ accent: e.target.value })} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label="Custom colour" />
                      </span>
                      <span className="block text-[11px] text-muted mt-2">Custom colour</span>
                    </label>
                  </div>
                </div>
              </Field>
            </Step>
          )}
          {step === 3 && (
            <Step title="Images" hint="Optional. Add them now and they are placed on the site straight away, or add them later in the editor.">
              <Field label="Main image (hero background)">
                {heroImage ? (
                  <div className="logo-tile rise" style={{ width: "100%", maxWidth: 560, height: 240, padding: 0, overflow: "hidden", background: "var(--sunken)" }}>
                    <img src={heroImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", maxWidth: "none", maxHeight: "none" }} />
                    <div className="logo-actions">
                      <label title="Replace image" aria-label="Replace image"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 10.5V3M5 5.5 8 2.5l3 3M3 10.5v2a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2" /></svg><input type="file" accept="image/*" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (file) setHeroImage(await fileToDataUrl(file, 2200)); e.target.value = ""; }} /></label>
                      <button type="button" title="Remove image" aria-label="Remove image" onClick={() => setHeroImage("")}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M4 4l8 8M12 4l-8 8" /></svg></button>
                    </div>
                  </div>
                ) : (
                  <label className="block border border-dashed border-line-strong hover:border-ink transition-colors p-8 text-center cursor-pointer" style={{ borderRadius: 6, maxWidth: 560 }}>
                    <span className="font-medium block">Upload the main image</span>
                    <span className="text-muted text-[13px]">A wide exterior shot or rendering works best. It fills the top of the site behind the title.</span>
                    <input type="file" accept="image/*" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (file) setHeroImage(await fileToDataUrl(file, 2200)); e.target.value = ""; }} />
                  </label>
                )}
              </Field>
              <div style={{ maxWidth: 560 }}><GalleryField value={gallery} onChange={setGallery} /></div>
              <p className="text-[13px] text-muted">Gallery images go into the “Impressions” section. Select several files at once; order and captions can be changed any time.</p>
            </Step>
          )}
          {step === 4 && (
            <Step title="Website language" hint="More languages can be added later and translated by Pascal.">
              <Seg value={f.locale} onChange={(v) => set({ locale: v })} options={[["de-CH", "Deutsch"], ["fr-CH", "Français"], ["it-CH", "Italiano"], ["en", "English"]]} />
              {f.locale !== "en" ? <p className="text-muted text-[13px] mt-4">In this preview the starter copy is generated in English.</p> : null}
            </Step>
          )}
          {step === 5 && (
            <Step title="Add the units" hint="Apartments, commercial spaces and parking. The lists on the website stay connected to this source.">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {([["file", "Excel or CSV", "Upload your letting list"], ["api", "API", "Wincasa, Flatfox, CasaGateway …"], ["manual", "By hand", "Type or generate the rows"], ["demo", "Sample data", "24 units to try things out"]] as const).map(([v, t, d]) => (
                  <button key={v} type="button" aria-pressed={f.source === v} onClick={() => set({ source: v })} className={`panel p-4 text-left transition-all ${f.source === v ? "border-ink" : "hover:border-line-strong"}`} style={{ transform: f.source === v ? "translateY(-2px)" : "none" }}>
                    <span className="font-medium block">{t}</span><span className="text-muted text-[13px]">{d}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[13px] text-muted">Prices are shown as</span>
                <Seg value={f.type} onChange={(v) => set({ type: v as "rent" | "sale" })} options={[["rent", "Monthly rent"], ["sale", "Purchase price"]]} />
              </div>
              {f.source === "file" && (
                <div className="rise grid gap-4">
                  <label className="block border border-dashed border-line-strong hover:border-ink transition-colors p-6 text-center cursor-pointer" style={{ borderRadius: 6 }}>
                    <span className="font-medium block">Choose an Excel or CSV file</span>
                    <span className="text-muted text-[13px]">Columns (German or English): ref, use, building, floor, rooms, area, price, charges, status</span>
                    <input type="file" accept=".csv,.xlsx,.xls" hidden onChange={async (e) => {
                      const file = e.target.files?.[0]; if (!file) return;
                      try { const u = await unitsFromFile(file); setUnits(u); setFileNote(`${u.length} units read from “${file.name}”. Check them below.`); } catch { setFileNote("The file could not be read."); }
                      e.target.value = "";
                    }} />
                  </label>
                  {fileNote ? <div className="text-[13px] text-muted" role="status">{fileNote}</div> : null}
                  {units.length ? <UnitsEditor units={units} onChange={setUnits} type={f.type} /> : null}
                </div>
              )}
              {f.source === "api" && (
                <div className="rise panel p-5 grid gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="System"><select className="select" value={f.provider} onChange={(e) => set({ provider: e.target.value })}>{PROVIDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                    <Field label="Project / property reference"><input className="input" value={f.apiRef} onChange={(e) => set({ apiRef: e.target.value })} placeholder="e.g. 01281.02" /></Field>
                    <Field label="Base URL"><input className="input" value={f.apiUrl} onChange={(e) => set({ apiUrl: e.target.value })} placeholder="https://api.example.ch/v1" /></Field>
                    <Field label="API key"><input className="input" type="password" placeholder="added later in project settings" disabled /></Field>
                  </div>
                  <p className="text-[13px] text-muted">Units will sync every 15 minutes once the connection is live. This preview has no live endpoint yet, so the project starts with sample units; your settings are saved with it.</p>
                </div>
              )}
              {f.source === "manual" && <div className="rise"><UnitsEditor units={units} onChange={setUnits} type={f.type} /></div>}
              {f.source === "demo" && <p className="rise text-[13px] text-muted">24 apartments in two buildings{f.uses.includes("commercial") ? ", 3 commercial spaces" : ""}{f.uses.includes("parking") ? ", 8 parking spaces" : ""}. You can replace them at any time under “Units”.</p>}
            </Step>
          )}
          {step === 6 && (
            <Step title="Show the building" hint="The drawing sits next to the unit list: hovering an apartment highlights its row, clicking opens it.">
              <Seg value={bldSource} onChange={(v) => setBldSource(v as "svg" | "pdf")} options={[["svg", "Isometry (SVG)"], ["pdf", "Generate from floor plan (PDF)"]]} />
              {bldSource === "svg" ? (
                iso ? (
                  <div className="settle">
                    <div className="flex justify-end mb-2"><button className="btn btn-sm btn-ghost" onClick={() => setIso(null)}>Remove drawing</button></div>
                    <IsometryMapper iso={iso} units={base.units.filter((u) => (u.use ?? "apartment") === "apartment")} accent={f.accent} onChange={setIso} />
                  </div>
                ) : (
                  <>
                    <label className="block border border-dashed border-line-strong hover:border-ink transition-colors p-10 text-center cursor-pointer" style={{ borderRadius: 6 }}>
                      <span className="font-medium block">Upload isometry (SVG)</span>
                      <span className="text-muted text-[13px]">One polygon or path per apartment. Ids that equal your unit numbers are linked automatically; the rest you link with a click.</span>
                      <input type="file" accept=".svg,image/svg+xml" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (file) loadIso(await file.text()); e.target.value = ""; }} />
                    </label>
                    <p className="text-[13px] text-muted">{isoError ? <span className="text-err">{isoError} </span> : null}No drawing at hand? <button className="underline text-ink" onClick={async () => loadIso(await (await fetch("/samples/isometry-sample.svg")).text())}>Use the sample drawing</button> or skip this step.</p>
                  </>
                )
              ) : null}
              {bldSource === "pdf" ? (<>
              {!plan && !planBusy ? (
                <>
                  <label className="block border border-dashed border-line-strong hover:border-ink transition-colors p-10 text-center cursor-pointer" style={{ borderRadius: 6 }}>
                    <span className="font-medium block">Upload floor plan (PDF or image)</span>
                    <span className="text-muted text-[13px]">A plan of the whole floor works best. More plans and floors can be added later.</span>
                    <input type="file" accept="application/pdf,image/*" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) loadPlan(() => planFromFile(file, file.name), file.name); }} />
                  </label>
                  <p className="text-[13px] text-muted">No plan at hand? <button className="underline text-ink" onClick={() => loadPlan(() => planFromUrl("/samples/floor-plan-typical-floor.pdf", "Typical floor"), "sample floor plan")}>Use the sample floor</button> or skip this step — the site then shows the unit list without the building.</p>
                </>
              ) : planBusy ? (
                <div className="panel h-[420px] flex flex-col items-center justify-center gap-3 relative overflow-hidden">
                  <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to bottom, transparent 46%, color-mix(in srgb, var(--accent) 16%, transparent) 50%, transparent 54%)", animation: "scan 1.2s linear infinite" }} />
                  <div className="font-medium">Reading “{planBusy}”</div>
                  <div className="text-muted text-[13px]">Detecting walls · finding apartments · stacking floors</div>
                </div>
              ) : plan ? (
                <div className="settle">
                  <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                    <Seg value={planView} onChange={(v) => setPlanView(v as "2d" | "bld")} options={[["bld", "Building"], ["2d", "Floor plan"]]} />
                    <span className="text-[13px] text-muted tnum">{slotsOf(plan).length} {slotsOf(plan).length === 1 ? "apartment" : "apartments"} per floor · {plan.rooms.length} rooms detected</span>
                    <button className="btn btn-sm btn-ghost" onClick={() => setPlan(null)}>Remove plan</button>
                  </div>
                  <div className="panel h-[440px] p-3" style={{ ["--accent" as string]: f.accent }}>
                    {planView === "2d" ? <Plan2D plan={plan} colorFor={(r) => groupColor(groupOf(plan, r.group), groupsOf(plan)[groupOf(plan, r.group)]?.common)} /> : base.units.length ? <Building3D project={base} accent={f.accent} /> : <div className="h-full flex items-center justify-center text-muted text-[13px]">Add units in the previous step to see the stacked building.</div>}
                  </div>
                  <p className="text-[12px] text-muted mt-2">Apartments are matched to your units in order per floor. Rooms, names and the matching can be corrected later under “Floor plans”.</p>
                </div>
              ) : null}
              </>) : null}
            </Step>
          )}
          {step === 7 && (
            <Step title="Choose a template" hint="Live preview with your details. You can switch templates later; the content stays.">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {TEMPLATES.map((t) => (
                  <div key={t.id} role="button" tabIndex={0} onClick={() => set({ template: t.id })} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); set({ template: t.id }); } }} aria-pressed={f.template === t.id} className={`panel overflow-hidden text-left cursor-pointer transition-all ${f.template === t.id ? "border-ink" : "hover:border-line-strong"}`} style={{ transform: f.template === t.id ? "translateY(-2px)" : "none" }}>
                    <SitePreview data={buildPage(base, t.id, brief ?? undefined)} accent={f.accent} width={264} height={330} />
                    <div className="p-3 border-t border-line flex items-end justify-between gap-2"><div><div className="font-semibold">{t.name}</div><div className="text-muted text-[13px]">{t.note}</div></div><button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); openPreview(t.id); }}>Preview</button></div>
                  </div>
                ))}
              </div>
            </Step>
          )}

          <div className="flex gap-3 mt-10 pt-6 border-t border-line">
            {at > 0 ? <button className="btn" onClick={() => go(-1)}>Back</button> : null}
            {at < flow.length - 1 ? (
              <>
                <button className="btn btn-primary" disabled={!canNext} onClick={() => go(1)}>Next: {STEPS[flow[at + 1]]} →</button>
                <button className="btn btn-ghost ml-auto" disabled={!db} onClick={create}>Skip the rest and create</button>
              </>
            ) : (
              <button className="btn btn-primary" disabled={!db} onClick={create}>Create website</button>
            )}
          </div>
        </section>
      </main>
      {preview && (
        <div role="dialog" aria-modal aria-label="Template preview" className="rise" style={{ position: "fixed", inset: 0, zIndex: 80, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
          <div className="h-14 border-b border-line bg-surface flex items-center px-6 gap-4 shrink-0">
            <span className="eyebrow">Preview</span>
            <Seg value={preview.tpl} onChange={(v) => { const tpl = v as TemplateId; upsertProject({ ...makeProject("__preview"), template: tpl, draft: buildPage(base, tpl, brief ?? undefined) }); setPreview({ ...preview, tpl }); }} options={TEMPLATES.map((t) => [t.id, t.name] as const)} />
            <Seg value={preview.device} onChange={(v) => setPreview({ ...preview, device: v as "desktop" | "mobile" })} options={[["desktop", "Desktop"], ["mobile", "Mobile"]]} />
            <span className="flex-1" />
            <button className="btn" onClick={() => setPreview(null)}>Close</button>
            <button className="btn btn-primary" onClick={() => { set({ template: preview.tpl }); setPreview(null); }}>Use {TEMPLATES.find((t) => t.id === preview.tpl)?.name}</button>
          </div>
          <div className="flex-1 overflow-hidden flex justify-center" style={{ padding: preview.device === "mobile" ? 24 : 0 }}>
            <iframe key={preview.tpl} title="Template preview" src="/site/__preview?draft=1&frame=1" className="settle bg-surface" style={{ width: preview.device === "mobile" ? 390 : "100%", height: "100%", border: preview.device === "mobile" ? "1px solid var(--line-strong)" : 0, borderRadius: preview.device === "mobile" ? 6 : 0, transition: "width 250ms" }} />
          </div>
        </div>
      )}
    </ViewTransition>
  );
}

function Step({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="max-w-[820px]">
      <h1 className="text-[40px] leading-[1.05] font-semibold tracking-tight">{title}</h1>
      <p className="text-muted mt-3 mb-8 text-[16px]">{hint}</p>
      <div className="grid gap-5">{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><span className="label">{label}</span>{children}</div>;
}
function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: (readonly [string, string])[] }) {
  return (
    <div className="inline-flex w-fit justify-self-start border border-line-strong overflow-hidden" style={{ borderRadius: 4 }} role="group">
      {options.map(([v, l]) => (
        <button key={v} aria-pressed={value === v} onClick={() => onChange(v)} className={`h-9 px-4 text-[14px] transition-colors ${value === v ? "bg-ink text-white" : "bg-surface hover:bg-sunken"}`}>{l}</button>
      ))}
    </div>
  );
}
