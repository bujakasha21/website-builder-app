"use client";
import Link from "next/link";
import { Render, type Data } from "@puckeditor/core";
import { useEffect, useRef, useState, ViewTransition } from "react";
import { ADV_VARIANTS, fileToDataUrl, GALLERY_VARIANTS, HERO_VARIANTS, MAP_VARIANTS, TI_VARIANTS } from "@/editor/blocks";
import { config } from "@/editor/config";
import { FINDER_VARIANTS } from "@/editor/UnitFinder";
import { Bricks, confetti, PascalFace, ScanSheet, Tower, Typed } from "@/components/PascalFun";
import Playground from "@/components/Playground";
import { SitePreview, TopBar } from "@/components/shell";
import { kindOf } from "@/lib/floorplan/furnish";
import { planFromFile, planFromUrl } from "@/lib/floorplan/pdf";
import { placeholder } from "@/lib/placeholders";
import { addProject, getProject, uid, updateProject, useDb, useProject } from "@/lib/store";
import { buildPage, TEMPLATES } from "@/lib/templates";
import { clearBriefDraft, readBriefDraft } from "@/lib/brief";
import { needsUnits, VIBES, type Brief } from "@/lib/profile";
import { brandFromBrief } from "@/lib/brand";
import { writeCopy } from "@/lib/copy";
import type { FloorPlan, Project, TemplateId, Unit } from "@/lib/types";

interface Line { text: string; items?: string[]; done?: boolean }
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** units from what the plan shows: one per apartment on a floor plan, or a single maisonette when the sheet shows levels */
function unitsFrom(plan: FloorPlan, ref: string): Unit[] {
  const groups = plan.groups?.length ? plan.groups : [{ name: "Apt 1" }];
  const mk = (rooms: FloorPlan["rooms"], n: number, label: string): Unit => {
    const living = rooms.filter((r) => ["living", "bedroom", "office"].includes(kindOf(r.name, r.areaM2))).length;
    const openKitchen = rooms.some((r) => kindOf(r.name, r.areaM2) === "kitchen" || /kitchen|k(ü|ue)che/i.test(r.name));
    return { id: "u" + n, ref: label, building: "A", floor: 0, rooms: Math.max(1, living) + (openKitchen ? 0.5 : 0), areaM2: Math.round(rooms.reduce((t, r) => t + r.areaM2, 0)), price: 0, status: "available", floorPlanId: plan.id };
  };
  if (plan.levels) return [mk(plan.rooms, 0, ref)];
  return groups.map((g, i) => ({ g, i })).filter((x) => !("common" in x.g && x.g.common)).map((x, n) => mk(plan.rooms.filter((r) => (r.group ?? 0) === x.i), n, `A.${String(n + 1).padStart(2, "0")}`));
}

type Block = { type: string; props: Record<string, unknown> };
interface Step { key: string; title: string; field?: string; variants?: { value: string; label: string }[]; ask: string }

/** what Pascal walks through after the data is in: the overall look first, then one block at a time */
const STEPS: Step[] = [
  { key: "template", title: "Overall look", ask: "First the overall look. Fonts, colours and spacing come from the template; the content stays the same." },
  { key: "Hero", title: "Hero", field: "variant", variants: HERO_VARIANTS, ask: "Now the hero – the first thing a visitor sees." },
  { key: "Advantages", title: "Advantages", field: "variant", variants: ADV_VARIANTS, ask: "Next, the reasons to move in." },
  { key: "TextImage", title: "Text & image", field: "variant", variants: TI_VARIANTS, ask: "The section that describes the property." },
  { key: "UnitFinder", title: "Apartments", field: "variant", variants: FINDER_VARIANTS, ask: "The apartments – the most important part of the page." },
  { key: "Gallery", title: "Gallery", field: "layout", variants: GALLERY_VARIANTS, ask: "How should the pictures be shown?" },
  { key: "Location", title: "Location", field: "layout", variants: MAP_VARIANTS, ask: "Last one: the map." },
];

/** Pascal's suggestion for a step and the reason, from simple rules on the project data */
/** the guided steps for this site: no look question when the interview chose one, no step for a section the page does not have */
const CAPTIONS: Record<string, string[]> = {
  residential: ["Living room", "Kitchen", "Surroundings", "Detail"],
  commercial: ["Office", "Meeting room", "Surroundings", "Detail"],
  "shopping-centre": ["Shops", "Food court", "Outside", "Detail"],
  booking: ["Meeting room", "Workspace", "Outside", "Detail"],
  blog: ["Picture", "Picture", "Picture", "Picture"],
  other: ["Inside", "Detail", "Outside", "Detail"],
};
const SECTION_NAME: Record<string, string> = { Hero: "top section", Advantages: "advantages", TextImage: "text & image", Facts: "key figures", UnitFinder: "apartments", Embed: "3D tour", Waitlist: "waiting list", Shops: "shop directory", Hours: "opening hours", Booking: "booking", Viewing: "viewings", Gallery: "gallery", Blog: "news", Testimonials: "testimonials", Location: "map", Faq: "questions", Downloads: "downloads", Newsletter: "newsletter", ContactForm: "contact form", Contacts: "contacts" };

function stepsOf(p: Project | null | undefined): Step[] {
  if (!p) return STEPS;
  const types = new Set((p.draft.content as { type: string }[]).map((c) => c.type));
  return STEPS.filter((s) => (s.key === "template" ? !p.brief?.vibe : types.has(s.key)));
}

function suggest(step: Step, p: Project, ownPhoto: boolean): { value: string; why: string } {
  const tpl = TEMPLATES.find((t) => t.id === p.template) ?? TEMPLATES[0];
  const n = p.units.length;
  switch (step.key) {
    case "template":
      if (p.type === "sale") return { value: "atelier", why: "large serif headlines and warm paper tones suit a property for sale" };
      if (n <= 6) return { value: "lumen", why: "a small building reads best light, rounded and friendly" };
      return { value: "kontrast", why: "a larger letting project needs a loud first screen and a strong apartment table" };
    case "Hero":
      return ownPhoto ? { value: tpl.hero, why: `your photo carries the page, and this is the hero ${tpl.name} is designed around` } : { value: "split", why: "there is no photo yet, and a placeholder looks better beside the text than full-screen" };
    case "Advantages": return { value: tpl.advantages, why: `it matches the rest of ${tpl.name}` };
    case "TextImage": return { value: tpl.textImage, why: `it alternates with the hero in ${tpl.name}` };
    case "UnitFinder":
      if (n <= 6) return { value: "cards", why: `with ${n} ${n === 1 ? "unit" : "units"} cards look fuller than a short table` };
      return p.floorPlans.length || p.isometry ? { value: "split", why: "visitors can hover the building and the table at once" } : { value: "table", why: "there is no building model yet, so the table gets the full width" };
    case "Gallery": return { value: "grid", why: "four pictures fill a grid; a slider pays off from about six" };
    default: return p.address ? { value: "side", why: "the address sits right beside the map" } : { value: "full", why: "there is no address yet, so the map speaks for itself" };
  }
}

/** live miniature of anything rendered at desktop width */
function Thumb({ children, ratio = 0.6 }: { children: React.ReactNode; ratio?: number }) {
  const box = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return (
    <span ref={box} className="gp-frame" style={{ height: w ? w * ratio : 120 }} aria-hidden>
      {w ? <span className="gp-render vp-render" style={{ width: 1200, transform: `scale(${w / 1200})` }}>{children}</span> : null}
    </span>
  );
}

export default function AiBuilder() {
  const db = useDb();
  const [lines, setLines] = useState<Line[]>([{ text: "Hi, I am Pascal. Give me one PDF with a floor plan and put the kettle on. I read the rooms and areas, ask you for the few things a plan cannot tell me, and then we go through the page block by block – I suggest, you choose." }]);
  const [building, setBuilding] = useState(false);
  const [quip, setQuip] = useState("");
  const quipT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cheer = (t: string) => { setQuip(t); if (quipT.current) clearTimeout(quipT.current); quipT.current = setTimeout(() => setQuip(""), 2600); };
  const [busy, setBusy] = useState(false);
  const [pid, setPid] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [found, setFound] = useState<{ plan: FloorPlan | null; units: Unit[] } | null>(null);
  const [form, setForm] = useState({ name: "", address: "", zip: "", city: "", type: "rent" as "rent" | "sale", image: "" });
  const [step, setStep] = useState(-1); // -1 = not guiding yet, STEPS.length = finished
  // the interview on /new carries name, city, languages and the features the site should have
  const [brief, setBrief] = useState<Brief | undefined>(undefined);
  useEffect(() => {
    const d = readBriefDraft();
    if (!d) return;
    setBrief(d.brief); // eslint-disable-line react-hooks/set-state-in-effect
    setForm((x) => ({ ...x, name: d.brief.name || x.name, city: d.city || x.city, address: d.address || x.address, zip: d.zip || x.zip, type: d.brief.offer ?? x.type }));
    const where = [d.address, [d.zip, d.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const look = VIBES.find((v) => v.id === d.brief.vibe)?.label.toLowerCase() ?? "chosen";
    setLines([{ text: `Hi, I am Pascal. I have everything I need from your answers: “${d.brief.name}”${where ? ` in ${where}` : ""}, the ${look} look${d.brief.accent ? " in your logo colours" : ""} and the sections you picked. No more questions – I am building it right now.` }]);
  }, []);
  // shopping centre, booking, blog …: nothing to read from a plan, Pascal builds from the answers right away
  const started = useRef(false);
  const ready = !!db;
  useEffect(() => {
    if (!brief || started.current || !ready) return;
    started.current = true;
    // no cleanup on purpose: a dev-mode double effect or a store update must not cancel the one build
    setTimeout(() => { setFound({ plan: null, units: [] }); create({ plan: null, units: [] }); }, 900);
  }, [brief, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = useProject(pid ?? undefined);
  const end = useRef<HTMLDivElement>(null);
  const say = async (l: Line, pause = 650) => { setLines((x) => [...x, l]); setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50); await wait(pause); };

  const run = async (make: () => Promise<FloorPlan>, fileName: string) => {
    if (busy || !db) return;
    if (pid && p) return addPlan(make, fileName);
    setBusy(true);
    setPid(null); setFound(null); setStep(-1);
    const base = fileName.replace(/\.(pdf|png|jpe?g|webp)$/i, "");
    await say({ text: `Reading “${fileName}” … let me put my glasses on.` }, 300);
    const t0 = Date.now();
    let plan: FloorPlan;
    try { plan = await make(); } catch { await say({ text: "I could not open this file. Please try a PDF or an image of the floor plan." }); setBusy(false); return; }
    if (!plan.rooms.length) { await say({ text: "I found no enclosed rooms on this page. Plans with solid, filled walls work best – you can also start with “Custom made”." }); setBusy(false); return; }
    // fast machines finish before anyone sees the scan: keep it on screen for a moment
    if (Date.now() - t0 < 1900) await wait(1900 - (Date.now() - t0));
    plan = { ...plan, rooms: plan.rooms.map((r) => ({ ...r, confirmed: true })) };
    const groups = plan.groups?.filter((g) => !g.common) ?? [];
    const total = plan.rooms.reduce((t, r) => t + r.areaM2, 0);
    await say({
      text: plan.levels ? `This is one home on ${groups.length} levels. I found ${plan.rooms.length} rooms:` : groups.length > 1 ? `This is a floor with ${groups.length} apartments. I found ${plan.rooms.length} rooms:` : `I found ${plan.rooms.length} rooms (no secret ones, I checked):`,
      items: plan.rooms.slice(0, 12).map((r) => `${r.name} · ${r.areaM2.toFixed(1)} m²`),
    }, 900);
    await say({
      text: plan.scaleSource === "labels" ? `Areas are taken from the labels in the PDF. Total ${total.toFixed(1)} m².` : `The PDF has no readable text, so I named the rooms by size and estimated the areas from door widths: about ${total.toFixed(0)} m². Please check both.`,
    });
    const units = unitsFrom(plan, base);
    await say({ text: `Units: ${units.length === 1 ? `1 home with ${units[0].rooms} rooms, about ${units[0].areaM2} m²` : `${units.length} apartments`}. Prices are not in the plan, so the list says “on request” until you add them.` });
    setFound({ plan, units });
    if (brief) {
      await say({ text: "Name, address, rent or sale and the look I have from your answers, so no more questions. Building it now; a main photo can be added in the editor." }, 400);
      await create({ plan, units }, true);
      return;
    }
    setForm((f) => ({ ...f, name: f.name || base.replace(/[-_.]+/g, " ").trim() || "New project" }));
    await say({ text: "A plan is shy about three things: the name, the address and whether this is for rent or for sale. Please fill that in on the right – a main photo is optional." }, 0);
    cheer("Your turn!");
    setBusy(false);
  };

  const ownPhoto = !!form.image;
  /** project from the plan and the details; the guided part starts here */
  const create = async (got = found, running = false) => {
    if (!got || (busy && !running)) return;
    setBusy(true);
    const core = { name: form.name.trim() || "New project", address: form.address.trim(), zip: form.zip.trim(), city: form.city.trim(), type: form.type, units: got.units, floorPlans: got.plan ? [got.plan] : [] };
    const id = (core.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project") + "-" + uid().slice(0, 4);
    const draftP = { ...core, id, template: "atelier" as TemplateId } as Project;
    // the look chosen in the interview wins; without one Pascal suggests
    const chosen = VIBES.find((v) => v.id === brief?.vibe)?.template;
    const tpl = TEMPLATES.find((t) => t.id === (chosen ?? suggest(STEPS[0], draftP, ownPhoto).value)) ?? TEMPLATES[0];
    const brand = brandFromBrief(brief, tpl.accent);
    const caps = CAPTIONS[brief?.kind ?? "residential"] ?? CAPTIONS.residential;
    const media = { heroImage: form.image || placeholder("exterior", brand.accent), gallery: (["interior", "kitchen", "garden", "detail"] as const).map((k, i) => ({ src: placeholder(k, brand.accent), caption: `${caps[i]} (placeholder)` })) };
    const built: Project = {
      ...core, id, slug: id, lat: 47.3769, lng: 8.5417, locale: brief?.languages[0] ?? "en", locales: brief?.languages.slice(1), kind: brief?.kind, brief: brief ? { ...brief, name: core.name, start: "ai" } : undefined,
      accent: brand.accent, logo: brand.logo, logoOnDark: brand.logoOnDark, theme: brand.theme, docVersion: 3, seo: brief ? writeCopy(brief, core).seo : undefined, template: tpl.id, isoMode: "3d",
      draft: buildPage({ ...core, ...media }, tpl.id, brief), published: null, leads: [], slots: [], bookings: [], views: 0, createdAt: Date.now(),
    };
    // with the interview Pascal decides every section version himself; the owner can still go through them afterwards
    const picks = brief ? stepsOf(built).filter((x) => x.key !== "template").map((x) => ({ st: x, ...suggest(x, built, ownPhoto) })) : [];
    const project: Project = picks.length ? { ...built, draft: { ...built.draft, content: (built.draft.content as Block[]).map((c) => { const k = picks.find((q) => q.st.key === c.type); return k ? { ...c, props: { ...c.props, [k.st.field!]: k.value } } : c; }) } as Data } : built;
    setBuilding(true);
    await say({ text: "Hard hat on. Building the first version …" }, 1900);
    addProject(project);
    clearBriefDraft();
    setPid(id);
    setBuilding(false);
    confetti();
    cheer("Ta-da!");
    if (!brief) {
      await say({ text: `Thanks. The first version of “${core.name}” is built${ownPhoto ? "" : "; the pictures are drawn placeholders until you upload your own"}. Now let us go through it together.` }, 500);
      setBusy(false);
      goTo(0, project);
      return;
    }
    // read the stored site back and report only what is really there
    const saved = getProject(id);
    const done: string[] = [];
    if (saved) {
      done.push(`Template ${TEMPLATES.find((t) => t.id === saved.template)?.name ?? saved.template}${chosen ? " – the look you chose" : ""}`);
      if (brief.accent && saved.accent.toLowerCase() === brief.accent.toLowerCase()) done.push(`Main colour ${saved.accent.toUpperCase()} from your logo${saved.theme?.colors?.secondary ? `, dark colour ${saved.theme.colors.secondary.toUpperCase()}` : ""}`);
      if (brief.logo && saved.logo) done.push("Your logo in the menu bar");
      const blocks = saved.draft.content as Block[];
      done.push(`${blocks.length - 2} sections from your list: ${blocks.filter((c) => c.type !== "Header" && c.type !== "Footer").map((c) => SECTION_NAME[c.type] ?? c.type).join(", ")}`);
      for (const k of picks) { const b0 = blocks.find((c) => c.type === k.st.key); if (b0 && b0.props[k.st.field!] === k.value) done.push(`${k.st.title}: “${k.st.variants?.find((v) => v.value === k.value)?.label}” – ${k.why}`); }
      done.push(brief.description ? "Texts written from your description" : "Starter texts for every section (no description given)");
      if (saved.seo?.title) done.push(`Search title “${saved.seo.title}”`);
      if (!ownPhoto) done.push("Pictures: drawn placeholders in your colour until you upload photos");
    }
    await say({ text: `Done. “${core.name}” is built. Here is what I did:`, items: done }, 500);
    if (needsUnits(brief) && !got.plan) await say({ text: "The apartment list is still empty. Drop a floor plan PDF on the left any time and I add the apartments, 2D/3D plans and the building view to this site." }, 0);
    setBusy(false);
    setStep(stepsOf(project).length);
  };

  /** a floor plan dropped after the site exists: apartments and plan go into it, nothing else changes */
  const addPlan = async (make: () => Promise<FloorPlan>, fileName: string) => {
    if (!p) return;
    setBusy(true);
    await say({ text: `Reading “${fileName}” for ${p.name} …` }, 300);
    let plan: FloorPlan;
    try { plan = await make(); } catch { await say({ text: "I could not open this file. Please try a PDF or an image of the floor plan." }); setBusy(false); return; }
    if (!plan.rooms.length) { await say({ text: "I found no enclosed rooms on this page, so I left the site as it was." }); setBusy(false); return; }
    plan = { ...plan, rooms: plan.rooms.map((r) => ({ ...r, confirmed: true })) };
    const units = unitsFrom(plan, fileName.replace(/\.(pdf|png|jpe?g|webp)$/i, ""));
    updateProject(p.id, (x) => ({ ...x, floorPlans: [...x.floorPlans, plan], units: [...x.units, ...units] }));
    const after = getProject(p.id);
    const added = after ? after.units.length - p.units.length : 0;
    await say({ text: added ? `Added ${added} ${added === 1 ? "apartment" : "apartments"} with their floor plan. They show in the apartment section of the site; prices can be added under Apartments.` : "Something went wrong: no apartments were added." }, 0);
    cheer(added ? "More homes!" : "Hmm");
    setBusy(false);
  };

  const goTo = (i: number, proj?: Project) => {
    const x = proj ?? p;
    setStep(i);
    if (!x) return;
    const steps = stepsOf(x);
    if (i >= steps.length) { confetti(); cheer("We did it!"); say({ text: "That was the last block. Open the editor for texts, pictures and anything else – every choice can still be changed there.", done: true }, 0); return; }
    const st = steps[i], s = suggest(st, x, ownPhoto);
    const label = st.key === "template" ? TEMPLATES.find((t) => t.id === s.value)?.name : st.variants?.find((v) => v.value === s.value)?.label;
    say({ text: `${st.ask} I suggest “${label}”, because ${s.why}. Have a look at the options and pick the one you like.` }, 0);
  };

  const blockOf = (x: Project, type: string) => (x.draft.content as Block[]).find((c) => c.type === type);
  const retheme = (t: TemplateId) => {
    if (!p) return;
    const tpl = TEMPLATES.find((x) => x.id === t)!;
    updateProject(p.id, (x) => {
      const hero = blockOf(x, "Hero")?.props.image as string | undefined;
      const gal = blockOf(x, "Gallery")?.props.images as { src: string; caption: string }[] | undefined;
      // a drawn placeholder follows the template colour, an own photo stays
      const heroImage = ownPhoto ? hero : placeholder("exterior", tpl.accent);
      return { ...x, template: t, accent: tpl.accent, draft: buildPage({ ...x, heroImage, gallery: gal }, t, x.brief) };
    });
  };
  const pick = (st: Step, value: string) => {
    if (!p) return;
    const mine = suggest(st, p, ownPhoto).value === value;
    const says = mine ? ["Great minds!", "My favourite too", "Exactly my pick"] : ["Ooh, bold!", "Nice eye", "I like it", "Good call", "Looks sharp"];
    cheer(says[Math.floor(Math.random() * says.length)]);
    if (st.key === "template") return retheme(value as TemplateId);
    updateProject(p.id, (x) => ({ ...x, draft: { ...x.draft, content: (x.draft.content as Block[]).map((c) => (c.type === st.key ? { ...c, props: { ...c.props, [st.field!]: value } } : c)) } as Data }));
  };

  const onFile = (f?: File | null) => { if (f) run(() => planFromFile(f, f.name), f.name); };
  const steps = stepsOf(p);
  const st = step >= 0 && step < steps.length ? steps[step] : null;
  const sug = st && p ? suggest(st, p, ownPhoto) : null;
  const current = st && p ? (st.key === "template" ? p.template : String(blockOf(p, st.key)?.props[st.field!] ?? "")) : "";

  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      <Playground />
      <TopBar>
        <span className="text-line-strong">/</span>
        <span className="font-medium">AI builder with Pascal</span>
      </TopBar>
      <main className="flex-1 w-full max-w-[1280px] mx-auto px-6 py-8 grid grid-cols-12 gap-8 relative z-[1]">
        <section className="col-span-12 lg:col-span-4 flex flex-col" style={{ minHeight: 560 }}>
          <div className="panel flex-1 flex flex-col overflow-hidden lg:sticky lg:top-6" style={{ maxHeight: "calc(100vh - 110px)" }}>
            <div className="px-5 py-4 border-b border-line flex items-center gap-3">
              <span className="relative"><PascalFace mood={busy ? "busy" : quip ? "happy" : "idle"} />{quip ? <span className="quip" key={quip}>{quip}</span> : null}</span>
              <div><div className="font-semibold">Pascal</div><div className="text-[12px] text-muted">{busy ? "working …" : st ? `step ${step + 1} of ${steps.length}` : "ready"}</div></div>
              {busy ? <span className="ml-auto flex gap-1" aria-hidden>{[0, 1, 2].map((i) => <i key={i} className="w-1.5 h-1.5 block" style={{ borderRadius: "50%", background: "var(--accent)", animation: `rise 700ms ${i * 140}ms ease-in-out infinite alternate` }} />)}</span> : null}
            </div>
            <div className="flex-1 overflow-auto p-5 grid gap-4 content-start text-[14px]">
              {lines.map((l, i) => (
                <div key={i} className="rise">
                  <div className={`pbubble ${l.done ? "font-medium" : ""}`}>{l.done ? <span style={{ color: "var(--accent-strong)" }}>✓ </span> : null}<Typed text={l.text} /></div>
                  {l.items ? <ul className="room-chips tnum">{l.items.map((t, k) => <li key={k} style={{ animationDelay: `${300 + k * 70}ms` }}>{t}</li>)}</ul> : null}
                </div>
              ))}
              <div ref={end} />
            </div>
            <div className="p-4 border-t border-line">
              <label
                onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0]); }}
                className={`block border border-dashed p-4 text-center transition-all ${busy ? "opacity-50 pointer-events-none" : "cursor-pointer"} ${over ? "border-accent scale-[1.01]" : "border-line-strong hover:border-ink"}`} style={{ borderRadius: 12, background: over ? "var(--accent-soft)" : undefined }}>
                <span className="font-medium block">{pid && brief ? "Add a floor plan PDF" : found ? "Start over with another PDF" : "Drop your PDF here"}</span>
                <span className="text-muted text-[13px]">{pid && brief ? "Pascal adds the apartments to this site" : "Floor plan or sales sheet, first page is used"}</span>
                <input type="file" accept="application/pdf,image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              {!found && !busy && (!brief || needsUnits(brief)) ? <button className="text-[13px] underline text-muted mt-3" onClick={() => run(() => planFromUrl("/samples/floor-plan-typical-floor.pdf", "Typical floor"), "Parkhof.pdf")}>No PDF at hand? Use the sample floor</button> : null}
            </div>
          </div>
        </section>

        <section className="col-span-12 lg:col-span-8">
          {building ? (
            <div className="panel h-full flex items-center justify-center" style={{ minHeight: 560 }}><Bricks lines={["Laying the foundations …", "Putting up the walls …", "Hanging the pictures …", "Polishing the windows …"]} /></div>
          ) : !found && busy ? (
            <div className="panel h-full flex items-center justify-center" style={{ minHeight: 560 }}><ScanSheet lines={["Finding the walls …", "Counting rooms …", "Looking for the kitchen …", "Measuring the living room …", "Checking where the sofa fits …"]} /></div>
          ) : !found ? (
            <div className="panel h-full flex flex-col items-center justify-center text-center p-10" style={{ minHeight: 560, borderStyle: "dashed" }}>
              <span className="blob" style={{ width: 64, height: 64, borderRadius: 20 }}><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M8 14h8M8 17h5" /></svg></span>
              {brief ? (
                <>
                  <div className="text-[20px] font-semibold tracking-tight mt-5">{needsUnits(brief) ? "Only the floor plan is missing" : "Building from your answers …"}</div>
                  <dl className="known mt-4 text-left">
                    <div><dt>Name</dt><dd>{form.name}</dd></div>
                    {form.address || form.city ? <div><dt>Address</dt><dd>{[form.address, [form.zip, form.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</dd></div> : null}
                    <div><dt>Offer</dt><dd>{form.type === "sale" ? "For sale" : "For rent"}</dd></div>
                    <div><dt>Look</dt><dd>{VIBES.find((v) => v.id === brief.vibe)?.label ?? "Pascal suggests"}</dd></div>
                    <div><dt>Sections</dt><dd>{brief.features.length} picked</dd></div>
                  </dl>
                  <p className="text-muted text-[13px] mt-4">{needsUnits(brief) ? "From your answers. Drop the PDF on the left; Pascal builds the site right after reading it." : "From your answers. Pascal needs no floor plan for this kind of site."}</p>
                </>
              ) : (
                <>
                  <div className="text-[20px] font-semibold tracking-tight mt-5">Three steps to your website</div>
                  <ol className="text-muted mt-3 grid gap-1 text-left">
                    <li><b className="text-ink">1.</b> Pascal reads rooms and areas from your PDF</li>
                    <li><b className="text-ink">2.</b> You add name, address and a main photo</li>
                    <li><b className="text-ink">3.</b> Block by block, Pascal suggests a version and you choose</li>
                  </ol>
                </>
              )}
            </div>
          ) : !p ? (
            <div className="panel p-6 settle">
              <div className="eyebrow">Step 2 · Project details</div>
              <h2 className="text-[22px] font-semibold tracking-tight mt-1">What the plan cannot tell</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
                <label className="sm:col-span-2"><span className="label">Project name</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Wohnen am Park" /></label>
                <label className="sm:col-span-2"><span className="label">Street and number</span><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="e.g. Parkstrasse 12" autoComplete="off" /></label>
                <label><span className="label">Postcode</span><input className="input tnum" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} placeholder="3113" /></label>
                <label><span className="label">Town</span><input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="e.g. Rubigen" /></label>
              </div>
              <div className="mt-5">
                <span className="label">The apartments are</span>
                <div className="st-seg" role="group">
                  <button type="button" aria-pressed={form.type === "rent"} onClick={() => setForm({ ...form, type: "rent" })}>For rent</button>
                  <button type="button" aria-pressed={form.type === "sale"} onClick={() => setForm({ ...form, type: "sale" })}>For sale</button>
                </div>
              </div>
              <div className="mt-5">
                <span className="label">Main photo <span className="text-muted font-normal">· optional, also used as the thumbnail when the link is shared</span></span>
                {form.image ? (
                  <div className="logo-tile" style={{ width: "100%", maxWidth: 420, height: 200, padding: 0, overflow: "hidden", background: "var(--sunken)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.image} alt="Main photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <div className="logo-actions"><button type="button" title="Remove photo" aria-label="Remove photo" onClick={() => setForm({ ...form, image: "" })}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M4 4l8 8M12 4l-8 8" /></svg></button></div>
                  </div>
                ) : (
                  <label className="block border border-dashed border-line-strong hover:border-ink transition-colors p-6 text-center cursor-pointer" style={{ borderRadius: 12, maxWidth: 420 }}>
                    <span className="font-medium block">Upload a photo or rendering</span>
                    <span className="text-muted text-[13px]">Without one, Pascal draws a placeholder</span>
                    <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setForm({ ...form, image: await fileToDataUrl(f, 2200) }); e.target.value = ""; }} />
                  </label>
                )}
              </div>
              <div className="flex gap-3 mt-6 pt-5 border-t border-line">
                <button className="btn btn-primary" disabled={busy || form.name.trim().length < 2} onClick={() => create()}>Build with Pascal →</button>
              </div>
            </div>
          ) : (
            <div className="settle grid gap-5">
              {st && sug ? (
                <div className="panel p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="eyebrow">Step {step + 1} of {steps.length}</div>
                      <h2 className="text-[22px] font-semibold tracking-tight mt-1">{st.title}</h2>
                    </div>
                    <Tower step={step} total={steps.length} />
                  </div>
                  <div className="gp-grid mt-4" role="listbox" aria-label={`${st.title} versions`}>
                    {(st.key === "template" ? TEMPLATES.map((t) => ({ value: t.id as string, label: t.name, note: t.note })) : st.variants!.map((v) => ({ ...v, note: "" }))).map((o, i) => {
                      const block = st.key === "template" ? null : blockOf(p, st.key);
                      const tpl = st.key === "template" ? TEMPLATES.find((t) => t.id === o.value)! : null;
                      const data = tpl
                        ? buildPage({ ...p, heroImage: ownPhoto ? (blockOf(p, "Hero")?.props.image as string) : placeholder("exterior", tpl.accent), gallery: blockOf(p, "Gallery")?.props.images as { src: string; caption: string }[] }, tpl.id, p.brief)
                        : ({ root: p.draft.root, zones: {}, content: block ? [{ type: block.type, props: { ...block.props, [st.field!]: o.value, id: `gp-${st.key}-${o.value}` } }] : [] } as Data);
                      return (
                        <div key={o.value} role="option" tabIndex={0} aria-selected={current === o.value} aria-pressed={current === o.value} className="panel gp-card" onClick={() => pick(st, o.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(st, o.value); } }}>
                          <Thumb><Render config={config} data={data} metadata={{ projectId: p.id, partial: true, accent: tpl?.accent }} /></Thumb>
                          <span className="gp-meta">
                            <span className="gp-name"><b>{String(i + 1).padStart(2, "0")}</b> {o.label}</span>
                            {sug.value === o.value ? <span className="gp-pick">Pascal’s pick</span> : null}
                          </span>
                          {o.note ? <span className="gp-note">{o.note}</span> : null}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-3 mt-5 pt-4 border-t border-line flex-wrap items-center">
                    <button className="btn" disabled={step === 0} onClick={() => goTo(step - 1)}>← Back</button>
                    {current !== sug.value ? <button className="btn" onClick={() => pick(st, sug.value)}>Take Pascal’s pick</button> : null}
                    <button className="btn btn-primary ml-auto" onClick={() => goTo(step + 1)}>{step === steps.length - 1 ? "Finish" : `Next: ${steps[step + 1].title} →`}</button>
                  </div>
                </div>
              ) : (
                <div className="panel p-5 done-card">
                  <div className="flex items-center gap-4"><Tower step={steps.length} total={steps.length} /><div>
                  <div className="eyebrow">Done · roof is on</div>
                  <h2 className="text-[22px] font-semibold tracking-tight mt-1">{p.name} is ready for the editor</h2></div></div>
                  <div className="flex gap-3 mt-4 flex-wrap">
                    <Link className="btn btn-primary" href={`/edit/${p.id}`}>Open in the editor →</Link>
                    <a className="btn" href={`/site/${p.id}?draft=1`} target="_blank">View the site</a>
                    <Link className="btn" href={`/p/${p.id}/units`}>Add prices</Link>
                    <Link className="btn btn-ghost" href={`/p/${p.id}/plans`}>Check rooms and areas</Link>
                    <button className="btn btn-ghost" onClick={() => goTo(0)}>Let me choose the versions myself</button>
                  </div>
                </div>
              )}
              <div className="panel overflow-hidden">
                <div className="flex items-center gap-2 px-3 h-9 border-b border-line bg-sunken">
                  <i className="w-2.5 h-2.5 block" style={{ borderRadius: "50%", background: "var(--line-strong)" }} /><i className="w-2.5 h-2.5 block" style={{ borderRadius: "50%", background: "var(--line-strong)" }} /><i className="w-2.5 h-2.5 block" style={{ borderRadius: "50%", background: "var(--line-strong)" }} />
                  <span className="ml-3 text-[12px] text-muted tnum truncate">{p.slug}.streamnow.site · whole page</span>
                </div>
                <div style={{ height: 360, overflow: "auto" }}><SitePreview data={p.draft} projectId={p.id} accent={p.accent} width={790} height={2800} /></div>
              </div>
            </div>
          )}
        </section>
      </main>
    </ViewTransition>
  );
}
