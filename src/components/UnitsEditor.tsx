"use client";
import { useState } from "react";
import { STATUS_COLOR, STATUS_LABEL, type FloorPlan, type Unit, type UnitStatus, type UnitUse } from "@/lib/types";

const uid = () => Math.random().toString(36).slice(2, 9);
const n = (v: string) => parseFloat(v.replace(",", ".")) || 0;

/** editable unit table: add, change and remove units by hand, or generate a whole grid of them */
const readUrl = (f: File) => new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(f); });

/** `full` adds everything the project page needs: remark, floor plan, PDF per unit, own apply link, and bulk actions */
export default function UnitsEditor({ units, onChange, type, full, plans }: { units: Unit[]; onChange: (u: Unit[]) => void; type: "rent" | "sale"; full?: boolean; plans?: FloorPlan[] }) {
  const [gen, setGen] = useState({ buildings: "A", floors: 4, perFloor: 4 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pct, setPct] = useState("");
  const [query, setQuery] = useState("");
  const [pdfNote, setPdfNote] = useState("");
  const shown = query.trim() ? units.filter((u) => `${u.ref} ${u.building} ${u.label ?? ""} ${u.note ?? ""} ${STATUS_LABEL[u.status]}`.toLowerCase().includes(query.trim().toLowerCase())) : units;
  const picked = units.filter((u) => sel.has(u.id));
  const bulk = (f: (u: Unit) => Unit) => onChange(units.map((u) => (sel.has(u.id) ? f(u) : u)));
  const toggle = (id: string) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setPdf = async (id: string, file?: File) => {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) return setPdfNote(`${file.name} is larger than 12 MB.`);
    setPdfNote("");
    patch(id, { pdf: await readUrl(file), pdfName: file.name });
  };
  /** several PDFs at once: each goes to the apartment whose number is in the file name */
  const matchPdfs = async (files: FileList | null) => {
    if (!files?.length) return;
    const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
    const next = [...units]; let hit = 0;
    for (const f of Array.from(files)) {
      if (f.size > 12 * 1024 * 1024) continue;
      const name = norm(f.name.replace(/\.pdf$/i, ""));
      const i = next.map((u, k) => [norm(u.ref), k] as const).filter(([r]) => r && name.includes(r)).sort((a, b) => b[0].length - a[0].length)[0]?.[1];
      if (i === undefined) continue;
      next[i] = { ...next[i], pdf: await readUrl(f), pdfName: f.name }; hit++;
    }
    onChange(next);
    setPdfNote(`${hit} of ${files.length} PDFs matched by apartment number in the file name.`);
  };
  const patch = (id: string, p: Partial<Unit>) => onChange(units.map((u) => (u.id === id ? { ...u, ...p } : u)));
  const add = () => {
    const last = units[units.length - 1];
    onChange([...units, { id: "u-" + uid(), ref: "", building: last?.building ?? "A", floor: last?.floor ?? 0, rooms: last?.rooms ?? 3.5, areaM2: last?.areaM2 ?? 0, price: 0, status: "available" }]);
  };
  const generate = () => {
    const out: Unit[] = [];
    for (const b of gen.buildings.split(/[\s,;]+/).filter(Boolean))
      for (let f = 0; f < gen.floors; f++)
        for (let k = 1; k <= gen.perFloor; k++)
          out.push({ id: "u-" + uid(), ref: `${b}.${f}${k}`, building: b, floor: f, rooms: 0, areaM2: 0, price: 0, status: "available" });
    onChange([...units, ...out]);
  };
  const cell = "input !h-8 text-[13px] tnum";
  return (
    <div>
      <div className="flex items-end gap-3 flex-wrap mb-3 text-[13px]">
        <label><span className="label">Buildings</span><input className="input !h-8 text-[13px]" style={{ width: 90 }} value={gen.buildings} onChange={(e) => setGen({ ...gen, buildings: e.target.value })} placeholder="A, B" /></label>
        <label><span className="label">Floors</span><input className="input !h-8 text-[13px] tnum" style={{ width: 64 }} type="number" min={1} max={40} value={gen.floors} onChange={(e) => setGen({ ...gen, floors: Math.max(1, Math.min(40, +e.target.value || 1)) })} /></label>
        <label><span className="label">Units per floor</span><input className="input !h-8 text-[13px] tnum" style={{ width: 64 }} type="number" min={1} max={20} value={gen.perFloor} onChange={(e) => setGen({ ...gen, perFloor: Math.max(1, Math.min(20, +e.target.value || 1)) })} /></label>
        <button className="btn btn-sm" style={{ height: 32 }} onClick={generate}>Generate rows</button>
        <span className="text-muted">or</span>
        <button className="btn btn-sm" style={{ height: 32 }} onClick={add}>+ Add one unit</button>
        {full ? <label className="btn btn-sm cursor-pointer" style={{ height: 32 }} title="File names must contain the apartment number, e.g. A.01.pdf">Upload PDFs in bulk<input type="file" accept="application/pdf" multiple hidden onChange={(e) => { matchPdfs(e.target.files); e.target.value = ""; }} /></label> : null}
        {full ? <input className="input !h-8 text-[13px] ml-auto" style={{ width: 180 }} type="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search units" /> : null}
        {units.length ? <button className={`btn btn-sm btn-ghost ${full ? "" : "ml-auto"}`} style={{ height: 32 }} onClick={() => { if (confirm("Remove all units?")) onChange([]); }}>Clear</button> : null}
      </div>
      {pdfNote ? <p className="text-[12.5px] text-muted mb-2" role="status">{pdfNote}</p> : null}
      {full && picked.length ? (
        <div className="bulk-bar rise">
          <b className="tnum">{picked.length} selected</b>
          <select className="select !h-8 !w-auto text-[13px]" value="" onChange={(e) => { const v = e.target.value as UnitStatus; if (v) bulk((u) => ({ ...u, status: v })); }} aria-label="Set status">
            <option value="">Set status…</option>
            {(Object.keys(STATUS_LABEL) as UnitStatus[]).map((x) => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}
          </select>
          <span className="flex items-center gap-1">
            <input className="input !h-8 text-[13px] tnum" style={{ width: 70 }} value={pct} onChange={(e) => setPct(e.target.value)} placeholder="+2.5" aria-label="Price change in percent" /><span>%</span>
            <button className="btn btn-sm" style={{ height: 32 }} disabled={!n(pct)} onClick={() => { const k = 1 + n(pct) / 100; const step = type === "sale" ? 1000 : 5; bulk((u) => ({ ...u, price: Math.round((u.price * k) / step) * step })); setPct(""); }}>Change price</button>
          </span>
          <button className="btn btn-sm btn-ghost" style={{ height: 32 }} onClick={() => { if (confirm(`Remove ${picked.length} units?`)) { onChange(units.filter((u) => !sel.has(u.id))); setSel(new Set()); } }}>Remove</button>
          <button className="btn btn-sm btn-ghost ml-auto" style={{ height: 32 }} onClick={() => setSel(new Set())}>Clear selection</button>
        </div>
      ) : null}
      <div className="panel overflow-x-auto" style={{ maxHeight: full ? "calc(100vh - 220px)" : 380, minHeight: full && units.length ? 240 : undefined, overflowY: "auto" }}>
        {units.length === 0 ? <div className="p-6 text-muted text-[13px]">No units yet. Generate a grid from buildings and floors, or add them one by one.</div> : (
          <table className="table">
            <thead style={{ position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
              <tr>{full ? <th className="!pr-0"><input type="checkbox" aria-label="Select all" checked={shown.length > 0 && shown.every((u) => sel.has(u.id))} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((u) => u.id)) : new Set())} /></th> : null}<th>No.</th><th>Type</th><th>Bldg</th><th>Floor</th><th>Rooms</th><th>m²</th><th>{type === "sale" ? "Price" : "Net rent"}</th>{type === "rent" ? <th>Charges</th> : null}{type === "rent" && full ? <th className="!text-right">Gross</th> : null}<th>Status</th>{full ? <><th>Remark</th><th>Floor plan</th><th>PDF</th><th>Own apply link</th></> : null}<th /></tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id} className={sel.has(u.id) ? "row-sel" : ""}>
                  {full ? <td className="!p-1.5 !pr-0"><input type="checkbox" checked={sel.has(u.id)} onChange={() => toggle(u.id)} aria-label={`Select ${u.ref}`} /></td> : null}
                  <td className="!p-1.5"><input className={cell} style={{ width: 78 }} value={u.ref} onChange={(e) => patch(u.id, { ref: e.target.value })} placeholder="A.01" aria-label="Number" /></td>
                  <td className="!p-1.5">
                    <select className="select !h-8 text-[13px] !px-1" style={{ width: 104 }} value={u.use ?? "apartment"} onChange={(e) => patch(u.id, { use: e.target.value === "apartment" ? undefined : (e.target.value as UnitUse) })} aria-label="Type">
                      <option value="apartment">Apartment</option><option value="commercial">Commercial</option><option value="parking">Parking</option>
                    </select>
                  </td>
                  <td className="!p-1.5"><input className={cell} style={{ width: 48 }} value={u.building} onChange={(e) => patch(u.id, { building: e.target.value })} aria-label="Building" /></td>
                  <td className="!p-1.5"><input className={cell} style={{ width: 56 }} type="number" value={u.floor} onChange={(e) => patch(u.id, { floor: Math.round(n(e.target.value)) })} aria-label="Floor" /></td>
                  <td className="!p-1.5"><input className={cell} style={{ width: 60 }} type="number" step="0.5" value={u.rooms || ""} onChange={(e) => patch(u.id, { rooms: n(e.target.value) })} aria-label="Rooms" /></td>
                  <td className="!p-1.5"><input className={cell} style={{ width: 68 }} type="number" value={u.areaM2 || ""} onChange={(e) => patch(u.id, { areaM2: n(e.target.value) })} aria-label="Area" /></td>
                  <td className="!p-1.5"><input className={cell} style={{ width: 92 }} type="number" value={u.price || ""} onChange={(e) => patch(u.id, { price: n(e.target.value) })} aria-label="Price" /></td>
                  {type === "rent" ? <td className="!p-1.5"><input className={cell} style={{ width: 72 }} type="number" value={u.charges || ""} onChange={(e) => patch(u.id, { charges: n(e.target.value) || undefined })} aria-label="Charges" /></td> : null}
                  {type === "rent" && full ? <td className="!p-1.5 text-right tnum text-muted text-[13px] whitespace-nowrap">{u.price ? (u.price + (u.charges ?? 0)).toLocaleString("de-CH") : "–"}</td> : null}
                  <td className="!p-1.5 whitespace-nowrap">
                    <span className="dot" style={{ background: STATUS_COLOR[u.status] }} />
                    <select className="select !h-8 !w-auto text-[13px] !px-1" value={u.status} onChange={(e) => patch(u.id, { status: e.target.value as UnitStatus })} aria-label="Status">
                      {(Object.keys(STATUS_LABEL) as UnitStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </td>
                  {full ? (
                    <>
                      <td className="!p-1.5"><input className="input !h-8 text-[13px]" style={{ width: 130 }} value={u.use && u.use !== "apartment" ? u.label ?? "" : u.note ?? ""} onChange={(e) => patch(u.id, u.use && u.use !== "apartment" ? { label: e.target.value || undefined } : { note: e.target.value || undefined })} placeholder={u.use && u.use !== "apartment" ? "Office, Retail…" : "Balcony, Attic…"} aria-label="Remark" /></td>
                      <td className="!p-1.5">
                        <select className="select !h-8 text-[13px] !px-1" style={{ width: 130 }} value={u.floorPlanId ?? ""} onChange={(e) => patch(u.id, { floorPlanId: e.target.value || undefined })} aria-label={`Floor plan for ${u.ref}`}>
                          <option value="">Automatic</option>
                          {(plans ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      </td>
                      <td className="!p-1.5 whitespace-nowrap">
                        {u.pdf ? (
                          <span className="pdf-pill" title={u.pdfName}><a href={u.pdf} download={u.pdfName || `${u.ref}.pdf`}>{(u.pdfName || "PDF").replace(/^(.{14}).+(\.pdf)$/i, "$1…$2")}</a><button type="button" onClick={() => patch(u.id, { pdf: undefined, pdfName: undefined })} aria-label={`Remove PDF of ${u.ref}`}>×</button></span>
                        ) : (
                          <label className="btn btn-sm btn-ghost cursor-pointer !px-2" style={{ height: 32 }}>+ PDF<input type="file" accept="application/pdf" hidden onChange={(e) => { setPdf(u.id, e.target.files?.[0]); e.target.value = ""; }} /></label>
                        )}
                      </td>
                      <td className="!p-1.5"><input className="input !h-8 text-[13px]" style={{ width: 190 }} value={u.applyUrl ?? ""} onChange={(e) => patch(u.id, { applyUrl: e.target.value || undefined })} placeholder="Project setting" aria-label={`Apply link for ${u.ref}`} /></td>
                    </>
                  ) : null}
                  <td className="!p-1.5"><button className="btn btn-sm btn-ghost !px-2" onClick={() => onChange(units.filter((x) => x.id !== u.id))} aria-label={`Remove ${u.ref || "unit"}`}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="text-[12px] text-muted mt-2 tnum">{query.trim() ? `${shown.length} of ` : ""}{units.length} {units.length === 1 ? "unit" : "units"}</div>
    </div>
  );
}
