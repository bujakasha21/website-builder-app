"use client";
import { useState } from "react";
import { planFromFile } from "@/lib/floorplan/pdf";
import { unitsFromFile } from "@/lib/units-import";
import type { FloorPlan, Unit } from "@/lib/types";

type Bucket = "plans" | "units" | "logo" | "pictures" | "other";
const BUCKETS: { id: Bucket; label: string; hint: string }[] = [
  { id: "plans", label: "Floor plans", hint: "PDF or picture of a plan" },
  { id: "units", label: "Unit list", hint: "Excel or CSV" },
  { id: "logo", label: "Logo", hint: "SVG, PNG or JPG named “logo”" },
  { id: "pictures", label: "Pictures", hint: "Renderings and photos" },
];

/** which pile a file goes on, from its type and name; nothing needs to be sorted or renamed by hand */
export function classify(f: { name: string; type?: string }): Bucket {
  const n = f.name.toLowerCase();
  if (/\.(xlsx|xls|csv|ods)$/.test(n)) return "units";
  if (/logo/.test(n) || /\.svg$/.test(n)) return "logo";
  if (/\.pdf$/.test(n)) return "plans";
  if (/\.(png|jpe?g|webp|gif|avif)$/.test(n)) return /grundriss|plan|floor|geschoss|etage|\b(eg|og|ug|dg)\b|attika|regel/.test(n) ? "plans" : "pictures";
  return "other";
}

interface Line { text: string; warn?: boolean }

/**
 * Like the colleague's Studio: one field for everything the person has (floor plans, unit list, logo, pictures).
 * Each file lands on its pile with a counter, is read, and a short report says what was taken over.
 */
export default function DropAll({ onUnits, onPlans, onLogo, onPictures }: { onUnits: (u: Unit[], file: string) => void; onPlans: (p: FloorPlan[]) => void; onLogo: (f: File) => Promise<void> | void; onPictures?: (files: File[]) => void }) {
  const [count, setCount] = useState<Record<Bucket, number>>({ plans: 0, units: 0, logo: 0, pictures: 0, other: 0 });
  const [state, setState] = useState<Record<Bucket, "empty" | "reading" | "read">>({ plans: "empty", units: "empty", logo: "empty", pictures: "empty", other: "empty" });
  const [lines, setLines] = useState<Line[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const take = async (list: File[]) => {
    if (!list.length || busy) return;
    setBusy(true);
    const piles: Record<Bucket, File[]> = { plans: [], units: [], logo: [], pictures: [], other: [] };
    for (const f of list) piles[classify(f)].push(f);
    setCount((c) => ({ plans: c.plans + piles.plans.length, units: c.units + piles.units.length, logo: c.logo + piles.logo.length, pictures: c.pictures + piles.pictures.length, other: c.other + piles.other.length }));
    setState((s) => ({ ...s, ...Object.fromEntries((Object.keys(piles) as Bucket[]).filter((k) => piles[k].length).map((k) => [k, "reading"])) }));
    const out: Line[] = [];
    if (piles.units.length) {
      const f = piles.units[0];
      try {
        const u = await unitsFromFile(f);
        if (u.length) {
          onUnits(u, f.name);
          const houses = [...new Set(u.map((x) => x.building))].sort();
          out.push({ text: `Unit list read: ${u.length} ${u.length === 1 ? "unit" : "units"}${houses.length ? ` in ${houses.length === 1 ? "building" : "buildings"} ${houses.join(" and ")}` : ""}, with rooms, areas and ${u.some((x) => x.price) ? "prices" : "no prices yet"}.` });
        } else out.push({ text: `“${f.name}” has no unit table I could recognise. Columns like Nr, Haus, Etage, Zimmer, Fläche, Miete are needed.`, warn: true });
      } catch { out.push({ text: `“${f.name}” could not be opened.`, warn: true }); }
    }
    if (piles.plans.length) {
      const plans: FloorPlan[] = [];
      for (const f of piles.plans) { try { const p = await planFromFile(f, f.name.replace(/\.[^.]+$/, "")); if (p.rooms.length) plans.push(p); } catch { /* reported below */ } }
      if (plans.length) onPlans(plans);
      const rooms = plans.reduce((t, p) => t + p.rooms.length, 0);
      out.push(plans.length ? { text: `Floor plans recognised: ${plans.length} ${plans.length === 1 ? "plan" : "plans"} with ${rooms} rooms. They go into the 2D/3D plans and the building model.` } : { text: "No rooms could be read from the floor plans. Plans with solid, filled walls work best.", warn: true });
      if (plans.length < piles.plans.length && plans.length) out.push({ text: `${piles.plans.length - plans.length} of the plan files could not be read.`, warn: true });
    }
    if (piles.logo.length) { try { await onLogo(piles.logo[0]); out.push({ text: "Logo found: its colours are used for the website." }); } catch { out.push({ text: "The logo could not be read.", warn: true }); } }
    if (piles.pictures.length) { onPictures?.(piles.pictures); out.push({ text: `${piles.pictures.length} ${piles.pictures.length === 1 ? "picture" : "pictures"} ${onPictures ? "taken for the hero and the gallery" : "noted; add them to the gallery in the editor"}.` }); }
    if (piles.other.length) out.push({ text: `${piles.other.length} ${piles.other.length === 1 ? "file was" : "files were"} not used (${piles.other.map((f) => f.name).slice(0, 3).join(", ")}).`, warn: true });
    setLines((x) => [...x, ...out]);
    setState((s) => ({ ...s, ...Object.fromEntries((Object.keys(piles) as Bucket[]).filter((k) => piles[k].length).map((k) => [k, "read"])) }));
    setBusy(false);
  };

  return (
    <div className="dropall">
      <label
        className={`dropall-zone ${over ? "over" : ""} ${busy ? "busy" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take([...(e.dataTransfer.files ?? [])]); }}
      >
        <b>Drop everything you have</b>
        <small>Floor plans, the unit list (Excel), logo, renderings. Pascal sorts the files and reads them; nothing needs renaming.</small>
        <span className="btn btn-sm">Choose files</span>
        <input type="file" multiple hidden accept=".pdf,.xlsx,.xls,.csv,.ods,image/*" onChange={(e) => { take([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </label>
      <div className="dropall-piles">
        {BUCKETS.map((b) => (
          <div key={b.id} className={`dropall-pile ${state[b.id]}`}>
            <span className="dropall-n tnum">{count[b.id]}</span>
            <span><b>{b.label}</b><small>{state[b.id] === "reading" ? "reading …" : state[b.id] === "read" ? "read" : b.hint}</small></span>
          </div>
        ))}
      </div>
      {lines.length ? <ul className="dropall-report" role="status">{lines.map((l, i) => <li key={i} className={l.warn ? "warn" : ""}>{l.text}</li>)}</ul> : null}
    </div>
  );
}
