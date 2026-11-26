"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, ViewTransition } from "react";
import { SitePreview, TopBar } from "@/components/shell";
import Voice from "@/components/Voice";
import NewIntro from "@/components/NewIntro";
import { readLogo } from "@/lib/logo";
import UnitsEditor from "@/components/UnitsEditor";
import { IsometryView } from "@/components/Isometry";
import { isoFromImage, parseIsometry } from "@/lib/isometry";
import { testBuilding, testUnits } from "@/lib/test-units";
import dynamic from "next/dynamic";
import { unitsFromFile } from "@/lib/units-import";
import { brandFromBrief, isoModeOf } from "@/lib/brand";
import { writeCopy } from "@/lib/copy";
import { saveBriefDraft } from "@/lib/brief";
import { API_PROVIDERS, EXPERIENCE, FEATURES, KIND_FEATURES, KINDS, needsUnits, ROLES, UNIT_SOURCES, VIBES, type UnitSource, type Brief, type FeatureId, type Profile, type Role, type StartMode } from "@/lib/profile";
import { addProject, saveProfile, uid, useProfile } from "@/lib/store";
import { buildPage, TEMPLATES } from "@/lib/templates";
import type { SiteKind } from "@/doc/schema";
import type { Project } from "@/lib/types";

type Screen = "role" | "experience" | "purposes" | "mode" | "kind" | "about" | "features" | "units" | "look";
type Mode = "ai" | "custom";
type IsoKind = "test3d" | "svg" | "png" | "none";
const Building3D = dynamic(() => import("@/components/plan/Building3D"), { ssr: false });
const ico = (d: string) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const ISO_OPTIONS: { id: IsoKind; label: string; note: string; icon: React.ReactNode }[] = [
  { id: "test3d", label: "Test building", note: "3D, you can rotate it", icon: ico("M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9M12 12L4 7.5") },
  { id: "svg", label: "Your SVG drawing", note: "Apartments clickable", icon: ico("M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3") },
  { id: "png", label: "Your picture", note: "PNG or JPG", icon: ico("M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5h.01") },
  { id: "none", label: "None", note: "Apartment list only", icon: ico("M5 5l14 14M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z") },
];
const LANGS: [string, string][] = [["de-CH", "Deutsch"], ["fr-CH", "Français"], ["it-CH", "Italiano"], ["en", "English"]];
/** creation time; a plain function so the click handler does not read the clock inline */
const stamp = () => Date.now();
const Tick = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3.5 8.5l3 3 6-7" /></svg>;

function Card({ on, onClick, title, note, multi }: { on: boolean; onClick: () => void; title: string; note?: string; multi?: boolean }) {
  return (
    <button type="button" className={`ob-card ${on ? "on" : ""}`} role={multi ? "checkbox" : "radio"} aria-checked={on} onClick={onClick}>
      <span className="ob-check" aria-hidden>{on ? <Tick /> : null}</span>
      <span className="ob-card-t">{title}</span>
      {note ? <span className="ob-card-n">{note}</span> : null}
    </button>
  );
}

/**
 * The interview before a new website. First visit: who you are, your experience, what you build sites for (saved as
 * your profile). Every new site: what it is, name and description (typed or spoken), the features it needs, the look
 * and languages, and how to start. The answers build the first version of the page.
 */
export default function NewSite() {
  const profile = useProfile();
  const router = useRouter();
  const q = useSearchParams();
  const onlyProfile = q.get("profile") === "1";
  // decided once when the profile has loaded: saving it half-way must not change the list of screens
  const [asked, setAsked] = useState<boolean | null>(null);
  if (asked === null && profile !== undefined) setAsked(onlyProfile || profile === null);
  const askProfile = asked ?? false;

  const [pr, setPr] = useState<Omit<Profile, "at">>({ role: "company", experience: "some", purposes: [] });
  const [prTouched, setPrTouched] = useState<Partial<Record<"role" | "experience" | "purposes", boolean>>>({});
  const [brief, setBrief] = useState<Brief>({ kind: "residential", name: "", description: "", features: KIND_FEATURES.residential, vibe: "elegant", languages: ["de-CH"] });
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [zip, setZip] = useState("");
  const [kindTouched, setKindTouched] = useState(false);
  const [voiceLang, setVoiceLang] = useState("de-CH");
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const [isoKind, setIsoKind] = useState<IsoKind>("test3d");
  const [bldBusy, setBldBusy] = useState(false);
  const [isoErr, setIsoErr] = useState<string | null>(null);
  const [sheetNote, setSheetNote] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [mode, setMode] = useState<Mode | null>(null);
  // a short curtain every time "New website" opens (not when only the profile is edited)
  const [intro, setIntro] = useState(!onlyProfile);

  const baseScreens: Screen[] = useMemo(() => [...(askProfile ? (["role", "experience"] as Screen[]) : []), ...(onlyProfile ? [] : (["mode", "kind", "about", "features", "look"] as Screen[]))], [askProfile, onlyProfile]);
  if (profile === undefined) return <div className="p-10 text-muted">Loading …</div>;
  const p = profile ?? null;
  // the person's own profile prefills what the site is for
  const purposes = (prTouched.purposes ? pr.purposes : p?.purposes) ?? [];
  const kind: SiteKind = kindTouched ? brief.kind : purposes[0] ?? brief.kind;
  const b: Brief = { ...brief, kind, features: kindTouched || brief.features !== KIND_FEATURES.residential ? brief.features : KIND_FEATURES[kind] };
  const setKind = (k: SiteKind) => { setKindTouched(true); setBrief({ ...b, kind: k, features: KIND_FEATURES[k] }); };
  const toggleFeature = (f: FeatureId) => setBrief({ ...b, features: b.features.includes(f) ? b.features.filter((x) => x !== f) : [...b.features, f] });
  // sites with apartments get one more screen: where the apartments come from, and the building view
  const screens: Screen[] = needsUnits(b) ? baseScreens.flatMap((x) => (x === "look" ? ["units", "look"] as Screen[] : [x])) : baseScreens;
  const screen = screens[Math.min(i, screens.length - 1)];
  const src = b.unitSource ?? "test";
  const commercialSite = b.kind === "commercial";
  /** the apartments this site starts with, for the chosen source */
  const unitsNow = (x: Brief = b) => ((x.unitSource ?? "test") === "test" || x.unitSource === "api" ? testUnits(x.offer, commercialSite) : x.units ?? []);
  const setSource = async (v: UnitSource) => {
    const next: Brief = { ...b, unitSource: v, units: v === "manual" || v === "sheet" ? b.units ?? [] : undefined };
    setBrief(next);
  };
  const view = b.buildingView ?? "3d";
  const setView = (v: "3d" | "drawing") => setBrief({ ...b, buildingView: v });
  /** the 3D test building, read from the sample floor plan once */
  const loadPlans = () => {
    if (b.floorPlans?.length || bldBusy) return;
    setBldBusy(true);
    testBuilding().then((plan) => setBrief((x) => ({ ...x, floorPlans: [plan] }))).catch(() => setIsoErr("The sample floor plan could not be read.")).finally(() => setBldBusy(false));
  };
  const chooseIso = (v: IsoKind) => {
    setIsoErr(null);
    setIsoKind(v);
    if (v === "test3d") { setBrief({ ...b, buildingView: "3d" }); loadPlans(); }
    else if (v === "none") setBrief({ ...b, isometry: undefined });
    else if ((v === "png") !== !!b.isometry?.raster) setBrief({ ...b, isometry: undefined });
  };
  const onIsoFile = async (file: File) => {
    try {
      const iso = /svg/i.test(file.type) || /\.svg$/i.test(file.name) ? parseIsometry(await file.text(), unitsNow()) : await isoFromImage(file);
      setIsoKind(iso.raster ? "png" : "svg");
      setIsoErr(null);
      // an uploaded drawing is flat; the site shows the rotatable 3D model next to it by default
      setBrief((x) => ({ ...x, kind, features: b.features, isometry: iso, buildingView: "3d" }));
      loadPlans();
    } catch { setIsoErr("This file could not be read. Use an SVG drawing or a PNG/JPG picture."); }
  };

  const finishProfile = async (skipped = false) => {
    const role = prTouched.role ? pr.role : p?.role ?? pr.role;
    const experience = prTouched.experience ? pr.experience : p?.experience ?? pr.experience;
    await saveProfile({ role, roleOther: pr.roleOther ?? p?.roleOther, experience, company: pr.company ?? p?.company, purposes: purposes.length ? purposes : ["residential"], skipped: skipped || undefined, at: stamp() });
    if (onlyProfile) router.push("/");
  };
  const next = async () => {
    if (screen === "experience") await finishProfile();
    if (screen === "look") return finish();
    // the test isometry is there as soon as the apartments screen opens
    if (screens[i + 1] === "units" && isoKind === "test3d") loadPlans();
    setI((x) => Math.min(x + 1, screens.length - 1));
  };
  const back = () => (i > 0 ? setI(i - 1) : router.push("/"));
  const skip = async () => {
    if (screens.indexOf(screen) < screens.indexOf("mode") || onlyProfile) { await finishProfile(true); setI(screens.indexOf("mode")); return; }
    setI(screens.length - 1);
  };

  const tplId = VIBES.find((v) => v.id === b.vibe)?.template ?? "atelier";
  const base = { name: b.name.trim() || "New website", address: address.trim(), zip: zip.trim(), city: city.trim(), type: b.offer ?? "rent", units: [], floorPlans: [] };
  const createNow = () => {
    const t = TEMPLATES.find((x) => x.id === tplId) ?? TEMPLATES[0];
    const langs = b.languages.length ? b.languages : ["de-CH"];
    const id = (base.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site") + "-" + uid().slice(0, 4);
    const brand = brandFromBrief(b, t.accent);
    const fb = final();
    const units = fb.units ?? [];
    const project: Project = {
      ...base, units, floorPlans: fb.floorPlans ?? [], isometry: fb.isometry, isoMode: isoModeOf(fb), connector: fb.unitSource === "api" ? fb.connector : undefined, id, slug: id, lat: 47.3769, lng: 8.5417, kind: b.kind, brief: { ...fb, units: undefined, isometry: undefined, floorPlans: undefined, start: "blank" }, docVersion: 3, theme: brand.theme,
      uses: b.kind === "commercial" ? ["commercial"] : undefined, logo: brand.logo, logoOnDark: brand.logoOnDark, seo: writeCopy(b, base).seo,
      locale: langs[0], locales: langs.slice(1), accent: brand.accent, template: t.id,
      draft: buildPage({ ...base, units, floorPlans: fb.floorPlans ?? [] }, t.id, fb), published: null, leads: [], slots: [], bookings: [], views: 0, createdAt: stamp(),
    };
    addProject(project);
    router.push(`/edit/${id}`);
  };
  /** what goes to Pascal / the editor: the apartments of the chosen source are fixed here */
  const final = (): Brief => (needsUnits(b)
    ? { ...b, unitSource: src, units: unitsNow(), isometry: isoKind === "none" || isoKind === "test3d" ? undefined : b.isometry, floorPlans: isoKind === "none" ? undefined : b.floorPlans, buildingView: isoKind === "test3d" ? "3d" : view }
    : b);
  const handOff = (m: StartMode) => saveBriefDraft({ ...final(), name: base.name, start: m }, { city: base.city, address: base.address, zip: base.zip });
  /** the end of the interview: Pascal takes over, or the editor opens with the picked sections */
  const finish = () => {
    if (mode === "ai") { handOff("ai"); router.push("/new/ai"); }
    else createNow();
  };

  const pct = Math.round(((screens.indexOf(screen) + 1) / screens.length) * 100);
  const canNext =
    screen === "role" ? !!prTouched.role || !!p : screen === "experience" ? !!prTouched.experience || !!p     : screen === "mode" ? !!mode
    : screen === "about" ? b.name.trim().length > 1 : screen === "features" ? b.features.length > 0 : true;
  const group = (g: string) => FEATURES.filter((f) => f.group === g);

  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      <TopBar />
      {intro ? <NewIntro first={askProfile} onDone={() => setIntro(false)} /> : null}
      <main className={`ob ${intro ? "ob-hidden" : "ob-enter"}`}>
        <div className="ob-top">
          <button type="button" className="btn btn-sm btn-ghost" onClick={back}>← Back</button>
          <div className="ob-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress"><i style={{ width: `${pct}%` }} /></div>
          <span className="ob-count tnum">{screens.indexOf(screen) + 1} / {screens.length}</span>
          {screen !== "mode" && screen !== "look" ? <button type="button" className="btn btn-sm btn-ghost" onClick={skip}>Skip</button> : <span style={{ width: 52 }} />}
        </div>

        <div className="ob-body rise" key={screen}>
          {screen === "role" && (
            <>
              <div className="eyebrow">About you</div>
              <h1 className="ob-h">Who are you?</h1>
              <p className="ob-sub">So the builder can fit the way you work. You can change it any time.</p>
              <div className="ob-grid three" role="radiogroup" aria-label="Who are you">
                {ROLES.map((r) => <Card key={r.id} title={r.label} note={r.note} on={(prTouched.role ? pr.role : p?.role) === r.id} onClick={() => { setPr({ ...pr, role: r.id }); setPrTouched({ ...prTouched, role: true }); }} />)}
                <Card title="Other" note={pr.role === "other" ? undefined : "Something else"} on={pr.role === "other" && !!prTouched.role} onClick={() => { setPr({ ...pr, role: "other" as Role }); setPrTouched({ ...prTouched, role: true }); }} />
              </div>
              {pr.role === "other" && prTouched.role ? <input className="input ob-other" autoFocus placeholder="What do you do?" value={pr.roleOther ?? ""} onChange={(e) => setPr({ ...pr, roleOther: e.target.value })} aria-label="Your role" /> : null}
              <input className="input ob-other" placeholder="Company name (optional)" value={pr.company ?? p?.company ?? ""} onChange={(e) => setPr({ ...pr, company: e.target.value })} aria-label="Company name" />
            </>
          )}

          {screen === "experience" && (
            <>
              <div className="eyebrow">About you</div>
              <h1 className="ob-h">How much have you built websites before?</h1>
              <p className="ob-sub">Beginners get a calmer editor with Pascal at hand; professionals get every panel and shortcut.</p>
              <div className="ob-grid two" role="radiogroup" aria-label="Experience">
                {EXPERIENCE.map((x) => <Card key={x.id} title={x.label} note={x.note} on={(prTouched.experience ? pr.experience : p?.experience) === x.id} onClick={() => { setPr({ ...pr, experience: x.id }); setPrTouched({ ...prTouched, experience: true }); }} />)}
              </div>
            </>
          )}

          {screen === "mode" && (
            <>
              <div className="eyebrow">New website</div>
              <h1 className="ob-h">How would you like to build it?</h1>
              <p className="ob-sub">A few questions follow either way, then you land in the same editor and can change everything.</p>
              <div className="ob-two" role="radiogroup" aria-label="How to build">
                <button type="button" role="radio" aria-checked={mode === "ai"} className={`start-card featured ${mode === "ai" ? "on" : ""}`} onClick={() => { setMode("ai"); setI(i + 1); }}>
                  <span className="start-badge">Recommended</span>
                  <span className="start-icon pascal" aria-hidden>P</span>
                  <span className="start-title">Pascal builds it</span>
                  <span className="start-text">Tell Pascal what the site is for. With apartments he reads your floor plan PDF; otherwise he builds straight from your answers. Then he suggests a version for every section and you choose.</span>
                </button>
                <button type="button" role="radio" aria-checked={mode === "custom"} className={`start-card ${mode === "custom" ? "on" : ""}`} onClick={() => { setMode("custom"); setI(i + 1); }}>
                  <span className="start-icon" aria-hidden><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg></span>
                  <span className="start-title">Custom made</span>
                  <span className="start-text">Straight into the editor with the sections you pick, and build it yourself: drag, drop, edit. Pascal is still there in the corner if you need him.</span>
                </button>
              </div>
            </>
          )}

          {screen === "kind" && (
            <>
              <div className="eyebrow">New website</div>
              <h1 className="ob-h">What is this website for?</h1>
              <div className="ob-grid three" role="radiogroup" aria-label="Kind of website">
                {KINDS.map((k) => <Card key={k.id} title={k.label} note={k.note} on={kind === k.id} onClick={() => setKind(k.id)} />)}
              </div>
            </>
          )}

          {screen === "about" && (
            <>
              <div className="eyebrow">New website</div>
              <h1 className="ob-h">Name it and tell us about it</h1>
              <p className="ob-sub">A few sentences are enough. They become the first texts on the site, and you can edit everything afterwards.</p>
              <label className="ob-field"><span>Name</span><input className="input" autoFocus value={b.name} onChange={(e) => setBrief({ ...b, name: e.target.value })} placeholder={kind === "shopping-centre" ? "e.g. Shopping Arena" : kind === "residential" ? "e.g. Parkhof Bern" : "Name of the site"} /></label>
              {kind === "residential" || kind === "commercial" ? (
                <>
                  <div className="ob-row">
                    <label className="ob-field grow"><span>Street and number <small>(optional)</small></span><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Parkstrasse 12" autoComplete="off" /></label>
                    <label className="ob-field zip"><span>Postcode</span><input className="input tnum" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="3113" /></label>
                    <label className="ob-field grow"><span>Town</span><input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Rubigen" /></label>
                  </div>
                  <div className="ob-field"><span>The {kind === "commercial" ? "spaces" : "apartments"} are</span>
                    <div className="st-seg ob-seg" role="group" aria-label="Rent or sale">
                      <button type="button" aria-pressed={(b.offer ?? "rent") === "rent"} onClick={() => setBrief({ ...b, offer: "rent" })}>For rent</button>
                      <button type="button" aria-pressed={b.offer === "sale"} onClick={() => setBrief({ ...b, offer: "sale" })}>For sale</button>
                    </div>
                  </div>
                </>
              ) : <label className="ob-field"><span>City <small>(optional)</small></span><input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Zürich" /></label>}
              <label className="ob-field"><span>Short description</span><textarea className="input" rows={4} value={b.description} onChange={(e) => setBrief({ ...b, description: e.target.value })} placeholder={kind === "residential" ? "48 rental apartments, 2.5 to 4.5 rooms, close to the lake, first move-in spring 2027." : "What is it, for whom, what makes it special?"} /></label>
              <Voice lang={voiceLang} onLang={setVoiceLang} onText={(t) => setBrief((x) => ({ ...x, kind, features: b.features, description: (x.description ? x.description.trimEnd() + " " : "") + t }))} />
            </>
          )}

          {screen === "features" && (
            <>
              <div className="eyebrow">New website</div>
              <h1 className="ob-h">What should the site have?</h1>
              <p className="ob-sub">Preselected for a {KINDS.find((k) => k.id === kind)?.label.toLowerCase()}. Add or remove anything; sections can also be added later.</p>
              {(["Property", "Content", "Business"] as const).map((g) => (
                <div key={g} className="ob-group">
                  <div className="ob-group-t">{g === "Property" ? "Apartments and building" : g}</div>
                  <div className="ob-grid three compact" role="group" aria-label={g}>
                    {group(g).map((f) => <Card key={f.id} multi title={f.label} note={f.note} on={b.features.includes(f.id)} onClick={() => toggleFeature(f.id)} />)}
                  </div>
                </div>
              ))}
            </>
          )}

          {screen === "units" && (
            <>
              <div className="eyebrow">New website</div>
              <h1 className="ob-h">Where do the {commercialSite ? "spaces" : "apartments"} come from?</h1>
              <p className="ob-sub">While you test, take the generated test apartments. The real source can be switched any time later under Apartments.</p>
              <div className="ob-grid four" role="radiogroup" aria-label="Source of the apartments">
                {UNIT_SOURCES.map((x) => <Card key={x.id} title={x.label} note={x.note} on={src === x.id} onClick={() => setSource(x.id)} />)}
              </div>
              <div className="ob-units rise" key={src}>
                {src === "test" ? <p className="st-note">{testUnits(b.offer, commercialSite).length} {commercialSite ? "spaces" : "apartments"} in buildings A and B, three floors, mixed status ({b.offer === "sale" ? "purchase prices" : "monthly rents"}). Their numbers match the test isometry below.</p> : null}
                {src === "manual" ? <UnitsEditor units={b.units ?? []} onChange={(u) => setBrief({ ...b, units: u })} type={b.offer ?? "rent"} /> : null}
                {src === "sheet" ? (
                  <>
                    <label className="ob-logo-drop wide">
                      <b>Choose an Excel or CSV file</b><small>Columns (German or English): ref, use, building, floor, rooms, area, price, charges, status</small>
                      <input type="file" accept=".csv,.xlsx,.xls" hidden onChange={async (e) => {
                        const file = e.target.files?.[0]; e.target.value = "";
                        if (!file) return;
                        try { const u = await unitsFromFile(file); setBrief({ ...b, units: u }); setSheetNote(`${u.length} rows read from “${file.name}”. Check them below.`); } catch { setSheetNote("This file could not be read."); }
                      }} />
                    </label>
                    {sheetNote ? <p className="st-note" role="status">{sheetNote}</p> : null}
                    {b.units?.length ? <UnitsEditor units={b.units} onChange={(u) => setBrief({ ...b, units: u })} type={b.offer ?? "rent"} /> : null}
                  </>
                ) : null}
                {src === "api" ? (
                  <div className="ob-api">
                    <label className="ob-field"><span>System</span><select className="select" value={b.connector?.provider ?? "wincasa"} onChange={(e) => setBrief({ ...b, connector: { baseUrl: "", projectRef: "", ...b.connector, provider: e.target.value } })}>{API_PROVIDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                    <label className="ob-field"><span>Project / property reference</span><input className="input" value={b.connector?.projectRef ?? ""} onChange={(e) => setBrief({ ...b, connector: { provider: "wincasa", baseUrl: "", ...b.connector, projectRef: e.target.value } })} placeholder="e.g. 01281.02" /></label>
                    <label className="ob-field"><span>Base URL</span><input className="input" value={b.connector?.baseUrl ?? ""} onChange={(e) => setBrief({ ...b, connector: { provider: "wincasa", projectRef: "", ...b.connector, baseUrl: e.target.value } })} placeholder="https://api.example.ch/v1" /></label>
                    <p className="st-note">There is no live connection in this preview yet: the settings are saved with the site, and it starts with the test apartments until the feed is switched on. The API key is added later in the project settings, never here.</p>
                  </div>
                ) : null}
              </div>

              <div className="ob-group">
                <div className="ob-group-t">Building view</div>
                <div className="ob-isopick" role="radiogroup" aria-label="Building view">
                  {ISO_OPTIONS.map((o) => (
                    <button key={o.id} type="button" role="radio" aria-checked={isoKind === o.id} className={`ob-isocard ${isoKind === o.id ? "on" : ""}`} onClick={() => chooseIso(o.id)}>
                      <span className="ob-isoicon" aria-hidden>{o.icon}</span>
                      <b>{o.label}</b><small>{o.note}</small>
                    </button>
                  ))}
                </div>
                {(isoKind === "svg" || isoKind === "png") && !b.isometry ? (
                  <label className="ob-logo-drop wide" style={{ marginTop: 12 }}>
                    <b>{isoKind === "svg" ? "Upload your isometry as SVG" : "Upload your isometry as PNG or JPG"}</b>
                    <small>{isoKind === "svg" ? "One shape per apartment; shapes named like the apartment numbers are linked automatically." : "Shown as a picture of the building; apartments cannot be clicked on a picture."}</small>
                    <input type="file" accept={isoKind === "svg" ? ".svg,image/svg+xml" : "image/png,image/jpeg,image/webp"} hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await onIsoFile(f); }} />
                  </label>
                ) : null}
                {isoErr ? <p className="voice-err" role="alert">{isoErr}</p> : null}
                {isoKind !== "none" && (isoKind === "test3d" || b.isometry) ? (
                  <div className="ob-iso">
                    {b.isometry && isoKind !== "test3d" ? (
                      <div className="ob-viewtabs" role="radiogroup" aria-label="Shown on the website">
                        <span>On the website:</span>
                        <button type="button" role="radio" aria-checked={view === "3d"} onClick={() => setView("3d")}>3D model – rotate it</button>
                        <button type="button" role="radio" aria-checked={view === "drawing"} onClick={() => setView("drawing")}>Your {b.isometry.raster ? "picture" : "drawing"}</button>
                      </div>
                    ) : null}
                    <div className="ob-iso-view">
                      {view === "3d" || isoKind === "test3d" ? (
                        b.floorPlans?.length ? <Building3D project={{ units: unitsNow(), floorPlans: b.floorPlans }} accent={b.accent ?? "#1F5C4A"} /> : <div className="ob-iso-wait">{bldBusy ? "Building the 3D model from the sample floor plan …" : "The 3D model could not be built."}</div>
                      ) : b.isometry ? <IsometryView iso={b.isometry} units={unitsNow()} accent={b.accent ?? "#1F5C4A"} /> : null}
                    </div>
                    <p className="st-note">
                      {view === "3d" || isoKind === "test3d"
                        ? "Drag to rotate, scroll to zoom. The model is stacked from the sample floor plan: buildings A and B, three floors, four apartments each, linked to the apartment list."
                        : b.isometry?.raster
                          ? "Your picture, shown as the building view; for clickable apartments use an SVG."
                          : `${b.isometry?.shapes.length ?? 0} shapes, ${Object.keys(b.isometry?.map ?? {}).length} linked to ${commercialSite ? "spaces" : "apartments"}${Object.keys(b.isometry?.map ?? {}).length < (b.isometry?.shapes.length ?? 0) ? " – the rest can be linked later under Isometry" : ""}.`}
                    </p>
                  </div>
                ) : null}
              </div>
            </>
          )}

          {screen === "look" && (
            <>
              <div className="eyebrow">New website</div>
              <h1 className="ob-h">Pick a look</h1>
              <p className="ob-sub">Built live from your answers. Colours, fonts and corners can be changed later in Site settings.</p>
              <div className="ob-grid three" role="radiogroup" aria-label="Look">
                {VIBES.map((v) => (
                  <div key={v.id} role="radio" tabIndex={0} aria-checked={b.vibe === v.id} aria-label={`${v.label}: ${v.note}`} className={`ob-look ${b.vibe === v.id ? "on" : ""}`} onClick={() => setBrief({ ...b, vibe: v.id })} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBrief({ ...b, vibe: v.id }); } }}>
                    <span className="ob-look-pv" inert><SitePreview data={buildPage(base, v.template, b)} accent={b.accent ?? TEMPLATES.find((t) => t.id === v.template)?.accent} width={300} height={220} /></span>
                    <span className="ob-card-t">{v.label}</span><span className="ob-card-n">{v.note}</span>
                  </div>
                ))}
              </div>
              <div className="ob-group">
                <div className="ob-group-t">Your logo <small>(optional – Pascal takes the colours from it)</small></div>
                <div className="ob-logo">
                  {b.logo ? (
                    <div className={`ob-logo-tile ${b.logoOnDark ? "dark" : ""}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={b.logo} alt="Your logo" />
                      <button type="button" onClick={() => setBrief({ ...b, logo: undefined, logoOnDark: undefined, palette: undefined, accent: undefined })} aria-label="Remove logo">×</button>
                    </div>
                  ) : (
                    <label className="ob-logo-drop">
                      <b>Upload your logo</b><small>SVG, PNG or JPG</small>
                      <input type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" hidden onChange={async (e) => {
                        const f = e.target.files?.[0]; e.target.value = "";
                        if (!f) return;
                        try { const r = await readLogo(f); setLogoErr(null); setBrief((x) => ({ ...x, kind, features: b.features, logo: r.src, logoOnDark: r.onDark, palette: r.palette, accent: r.palette[0] })); }
                        catch { setLogoErr("This file could not be read. Use SVG, PNG, JPG or WebP."); }
                      }} />
                    </label>
                  )}
                  {b.palette?.length ? (
                    <div className="ob-swatch-wrap">
                      <div className="ob-group-t" style={{ marginBottom: 8 }}>Main colour from your logo</div>
                      <div className="ob-swatches" role="radiogroup" aria-label="Main colour">
                        {b.palette.map((c) => <button key={c} type="button" role="radio" aria-checked={b.accent === c} onClick={() => setBrief({ ...b, accent: c })} style={{ background: c }} title={c}><span className="tnum">{c.toUpperCase()}</span></button>)}
                        <button type="button" role="radio" aria-checked={!b.accent} className="tpl" onClick={() => setBrief({ ...b, accent: undefined })}>Template colour</button>
                      </div>
                    </div>
                  ) : null}
                </div>
                {logoErr ? <p className="voice-err" role="alert">{logoErr}</p> : null}
              </div>
              <div className="ob-group">
                <div className="ob-group-t">Languages <small>(the first one is the main language)</small></div>
                <div className="ob-chips" role="group" aria-label="Languages">
                  {LANGS.map(([code, label]) => {
                    const on = b.languages.includes(code);
                    return <button key={code} type="button" aria-pressed={on} onClick={() => setBrief({ ...b, languages: on ? b.languages.filter((l) => l !== code) : [...b.languages, code], features: !on && b.languages.length >= 1 && !b.features.includes("multilingual") ? [...b.features, "multilingual"] : b.features })}>{on ? <Tick /> : null}{label}{on && b.languages[0] === code ? <small>main</small> : null}</button>;
                  })}
                </div>
              </div>
            </>
          )}

        </div>

        {screen !== "mode" ? (
          <div className="ob-foot">
            <button type="button" className="btn btn-primary" disabled={!canNext} onClick={next}>{screen === "experience" && onlyProfile ? "Save" : screen === "look" ? (mode === "ai" ? "Build with Pascal →" : "Open the editor →") : "Continue →"}</button>
          </div>
        ) : null}
      </main>
    </ViewTransition>
  );
}
