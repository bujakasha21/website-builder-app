"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, ViewTransition } from "react";
import { SitePreview, TopBar } from "@/components/shell";
import Voice from "@/components/Voice";
import { saveBriefDraft } from "@/lib/brief";
import { EXPERIENCE, FEATURES, KIND_FEATURES, KINDS, ROLES, VIBES, type Brief, type FeatureId, type Profile, type Role, type StartMode } from "@/lib/profile";
import { addProject, saveProfile, uid, useProfile } from "@/lib/store";
import { buildPage, TEMPLATES } from "@/lib/templates";
import type { SiteKind } from "@/doc/schema";
import type { Project } from "@/lib/types";

type Screen = "role" | "experience" | "purposes" | "mode" | "kind" | "about" | "features" | "look";
type Mode = "ai" | "custom";
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
  const [i, setI] = useState(0);
  const [mode, setMode] = useState<Mode | null>(null);

  const screens: Screen[] = useMemo(() => [...(askProfile ? (["role", "experience", "purposes"] as Screen[]) : []), ...(onlyProfile ? [] : (["mode", "kind", "about", "features", "look"] as Screen[]))], [askProfile, onlyProfile]);
  if (profile === undefined) return <div className="p-10 text-muted">Loading …</div>;
  const screen = screens[Math.min(i, screens.length - 1)];
  const p = profile ?? null;
  // the person's own profile prefills what the site is for
  const purposes = (prTouched.purposes ? pr.purposes : p?.purposes) ?? [];
  const kind: SiteKind = kindTouched ? brief.kind : purposes[0] ?? brief.kind;
  const b: Brief = { ...brief, kind, features: kindTouched || brief.features !== KIND_FEATURES.residential ? brief.features : KIND_FEATURES[kind] };
  const setKind = (k: SiteKind) => { setKindTouched(true); setBrief({ ...b, kind: k, features: KIND_FEATURES[k] }); };
  const toggleFeature = (f: FeatureId) => setBrief({ ...b, features: b.features.includes(f) ? b.features.filter((x) => x !== f) : [...b.features, f] });

  const finishProfile = async (skipped = false) => {
    const role = prTouched.role ? pr.role : p?.role ?? pr.role;
    const experience = prTouched.experience ? pr.experience : p?.experience ?? pr.experience;
    await saveProfile({ role, roleOther: pr.roleOther ?? p?.roleOther, experience, company: pr.company ?? p?.company, purposes: purposes.length ? purposes : ["residential"], skipped: skipped || undefined, at: Date.now() });
    if (onlyProfile) router.push("/");
  };
  const next = async () => {
    if (screen === "purposes") await finishProfile();
    if (screen === "look") return finish();
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
    const project: Project = {
      ...base, id, slug: id, lat: 47.3769, lng: 8.5417, kind: b.kind, brief: { ...b, start: "blank" }, docVersion: 3, theme: {},
      uses: b.kind === "commercial" ? ["commercial"] : undefined,
      locale: langs[0], locales: langs.slice(1), accent: t.accent, template: t.id,
      draft: buildPage(base, t.id, b), published: null, leads: [], slots: [], bookings: [], views: 0, createdAt: stamp(),
    };
    addProject(project);
    router.push(`/edit/${id}`);
  };
  const handOff = (m: StartMode) => saveBriefDraft({ ...b, name: base.name, start: m }, { city: base.city, address: base.address, zip: base.zip });
  /** the end of the interview: Pascal takes over, or the editor opens with the picked sections */
  const finish = () => {
    if (mode === "ai") { handOff("ai"); router.push("/new/ai"); }
    else createNow();
  };

  const pct = Math.round(((screens.indexOf(screen) + 1) / screens.length) * 100);
  const canNext =
    screen === "role" ? !!prTouched.role || !!p : screen === "experience" ? !!prTouched.experience || !!p : screen === "purposes" ? pr.purposes.length > 0 || !!p?.purposes.length
    : screen === "mode" ? !!mode
    : screen === "about" ? b.name.trim().length > 1 : screen === "features" ? b.features.length > 0 : true;
  const group = (g: string) => FEATURES.filter((f) => f.group === g);

  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      <TopBar />
      <main className="ob">
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

          {screen === "purposes" && (
            <>
              <div className="eyebrow">About you</div>
              <h1 className="ob-h">What do you make websites for?</h1>
              <p className="ob-sub">Pick all that apply. New sites start with the right sections for each.</p>
              <div className="ob-grid three" role="group" aria-label="What you make websites for">
                {KINDS.map((k) => <Card key={k.id} multi title={k.label} note={k.note} on={purposes.includes(k.id)} onClick={() => { const cur = purposes; setPr({ ...pr, purposes: cur.includes(k.id) ? cur.filter((x) => x !== k.id) : [...cur, k.id] }); setPrTouched({ ...prTouched, purposes: true }); }} />)}
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

          {screen === "look" && (
            <>
              <div className="eyebrow">New website</div>
              <h1 className="ob-h">Pick a look</h1>
              <p className="ob-sub">Built live from your answers. Colours, fonts and corners can be changed later in Site settings.</p>
              <div className="ob-grid three" role="radiogroup" aria-label="Look">
                {VIBES.map((v) => (
                  <div key={v.id} role="radio" tabIndex={0} aria-checked={b.vibe === v.id} aria-label={`${v.label}: ${v.note}`} className={`ob-look ${b.vibe === v.id ? "on" : ""}`} onClick={() => setBrief({ ...b, vibe: v.id })} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBrief({ ...b, vibe: v.id }); } }}>
                    <span className="ob-look-pv" inert><SitePreview data={buildPage(base, v.template, b)} accent={TEMPLATES.find((t) => t.id === v.template)?.accent} width={300} height={220} /></span>
                    <span className="ob-card-t">{v.label}</span><span className="ob-card-n">{v.note}</span>
                  </div>
                ))}
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
            <button type="button" className="btn btn-primary" disabled={!canNext} onClick={next}>{screen === "purposes" && onlyProfile ? "Save" : screen === "look" ? (mode === "ai" ? "Build with Pascal →" : "Open the editor →") : "Continue →"}</button>
          </div>
        ) : null}
      </main>
    </ViewTransition>
  );
}
