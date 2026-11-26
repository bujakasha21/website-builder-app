"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import UnitsEditor from "@/components/UnitsEditor";
import { updateProject, useProject } from "@/lib/store";
import { UNIT_COLUMNS, unitSettings } from "@/lib/unit-settings";
import type { UnitSettings } from "@/lib/types";
import { download, unitsFromFile, unitsToCsv } from "@/lib/units-import";

/** one place for everything about the apartments: data, prices, plans and PDFs, table columns and the apply button */
export default function Units() {
  const { id } = useParams<{ id: string }>();
  const p = useProject(id);
  const [note, setNote] = useState("");
  if (!p) return null;
  const s = unitSettings(p);
  const set = (patch: Partial<UnitSettings>) => updateProject(p.id, (x) => ({ ...x, unitSettings: { ...unitSettings(x), ...patch } }));
  const rent = p.type !== "sale";
  const cols = UNIT_COLUMNS.filter((c) => rent || (c.key !== "charges" && c.key !== "gross"));
  const free = p.units.filter((u) => u.status === "available").length;

  return (
    <div className="grid gap-6" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="panel p-5">
          <div className="eyebrow">Table on the website</div>
          <h2 className="text-[17px] font-semibold mt-1">Which columns are shown</h2>
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="col-chip on locked" title="Always shown">No.</span>
            {cols.map((c) => {
              const on = s.columns.includes(c.key);
              return (
                <button key={c.key} type="button" className={`col-chip ${on ? "on" : ""}`} aria-pressed={on} title={c.hint}
                  onClick={() => set({ columns: on ? s.columns.filter((k) => k !== c.key) : UNIT_COLUMNS.map((x) => x.key).filter((k) => k === c.key || s.columns.includes(k)) })}>
                  <i aria-hidden>{on ? "✓" : "+"}</i>{c.key === "net" ? (rent ? "Net rent" : "Price") : c.label}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-2 mt-4 text-[13.5px] cursor-pointer">
            <input type="checkbox" checked={s.hideTakenPrice} onChange={(e) => set({ hideTakenPrice: e.target.checked })} style={{ accentColor: "var(--accent-strong)" }} />
            Hide prices of reserved, let and sold units
          </label>
        </section>

        <section className="panel p-5">
          <div className="eyebrow">Apply button</div>
          <h2 className="text-[17px] font-semibold mt-1">Where “{s.applyLabel || "Apply"}” leads</h2>
          <div className="st-seg mt-4" role="group">
            <button type="button" aria-pressed={s.apply === "contact"} onClick={() => set({ apply: "contact" })}>Contact form with the apartment selected</button>
            <button type="button" aria-pressed={s.apply === "link"} onClick={() => set({ apply: "link" })}>Another link</button>
          </div>
          <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: s.apply === "link" ? "140px 1fr" : "140px" }}>
            <label><span className="label">Button text</span><input className="input" value={s.applyLabel} onChange={(e) => set({ applyLabel: e.target.value })} placeholder="Apply" /></label>
            {s.apply === "link" ? <label><span className="label">Link</span><input className="input" value={s.applyUrl} onChange={(e) => set({ applyUrl: e.target.value })} placeholder="https://apply.example.ch/?unit={ref}" /></label> : null}
          </div>
          <p className="text-[12.5px] text-muted mt-3">
            {s.apply === "link" ? <>Use <code>{"{ref}"}</code> in the link to pass the apartment number. </> : "The visitor lands on the contact form with the apartment already chosen. "}
            A single apartment can have its own link in the table below. Units that are not available show “Waiting list”.
          </p>
          {!s.columns.includes("apply") ? <p className="text-[12.5px] mt-2" style={{ color: "var(--warn, #B7791F)" }}>The “Apply button” column is switched off, so the button only shows in the apartment details.</p> : null}
        </section>
      </div>

      <section className="min-w-0">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-3">
          <div>
            <div className="eyebrow">Data</div>
            <h2 className="text-[17px] font-semibold mt-1">Apartments <span className="text-muted font-normal tnum">· {p.units.length} total, {free} available</span></h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="btn btn-sm cursor-pointer">Import Excel / CSV
              <input type="file" accept=".csv,.xlsx,.xls" hidden onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                try {
                  const u = await unitsFromFile(f);
                  const changed = u.filter((n) => { const o = p.units.find((x) => x.ref === n.ref); return !o || o.status !== n.status || o.price !== n.price; }).length;
                  // plans, PDFs and own links stay with the apartment when a new file comes in
                  updateProject(p.id, (x) => ({ ...x, units: u.map((n) => { const o = x.units.find((q) => q.ref === n.ref); return { ...n, floorPlanId: o?.floorPlanId, pdf: o?.pdf, pdfName: o?.pdfName, applyUrl: o?.applyUrl, note: o?.note }; }) }));
                  setNote(`Imported ${new Date().toLocaleTimeString("en-GB")}: ${u.length} units, ${changed} changed.`);
                } catch { setNote("The file could not be read."); }
                e.target.value = "";
              }} />
            </label>
            <button className="btn btn-sm" onClick={() => download(`units-${p.slug}.csv`, unitsToCsv(p.units))} disabled={!p.units.length}>Export CSV</button>
            <a className="btn btn-sm" href={`/site/${p.id}?draft=1#units`} target="_blank" rel="noreferrer">See on the website →</a>
          </div>
        </div>
        {note ? <p className="text-[13px] text-muted mb-3" role="status">{note}</p> : null}
        <UnitsEditor full units={p.units} type={p.type} plans={p.floorPlans} onChange={(u) => updateProject(p.id, (x) => ({ ...x, units: u }))} />
        <p className="text-[12.5px] text-muted mt-2">Every change is saved at once and shows on the website immediately.</p>
      </section>
    </div>
  );
}
