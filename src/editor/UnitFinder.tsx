"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import { IsometryView } from "@/components/Isometry";
import Plan2D from "@/components/plan/Plan2D";
import { floorsOf, locate, subPlan, useOf } from "@/lib/building";
import { useProject } from "@/lib/store";
import { siteQuery } from "@/lib/sitedata";
import { useSite } from "./settings";
import { chf } from "@/lib/templates";
import { STATUS_COLOR, STATUS_LABEL, USE_LABEL, type Project, type Unit, type UnitSettings, type UnitUse } from "@/lib/types";
import { applyLink, applyToForm, unitSettings } from "@/lib/unit-settings";

const Plan3D = dynamic(() => import("@/components/plan/Plan3D"), { ssr: false });
const Building3D = dynamic(() => import("@/components/plan/Building3D"), { ssr: false });

export const floorName = (f: number) => (f === 0 ? "GF" : `${f}. floor`);
const money = (n?: number) => (n ? chf(n).replace("CHF ", "") + ".–" : "–");

function Detail({ p, unit, cfg, onClose }: { p: Project; unit: Unit; cfg: UnitSettings; onClose: () => void }) {
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const loc = locate(p, unit);
  const plan = loc ? subPlan(loc.plan, loc.group) : null;
  const rooms = plan?.rooms.filter((r) => r.confirmed) ?? [];
  const rent = p.type === "rent";
  return (
    <div className="finder-modal" role="dialog" aria-modal aria-label={`Apartment ${unit.ref}`} onClick={onClose}>
      <div className="finder-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="finder-stage">
          {!plan ? <div className="note" style={{ margin: 24 }}>No floor plan is assigned to this floor yet.</div>
            : rooms.length === 0 ? <div className="note" style={{ margin: 24 }}>The rooms of this apartment are not confirmed yet.</div>
            : mode === "2d" ? <Plan2D plan={plan} onlyConfirmed /> : <Plan3D plan={plan} onlyConfirmed accent={p.accent} />}
        </div>
        <div className="finder-info">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div className="s-eyebrow">Building {unit.building} · {floorName(unit.floor)}</div>
              <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1, marginTop: 4 }}>Apartment {unit.ref}</div>
            </div>
            <button className="chip" onClick={onClose} aria-label="Close">×</button>
          </div>
          <span className="status" style={{ marginTop: 10 }}><i style={{ background: STATUS_COLOR[unit.status] }} />{STATUS_LABEL[unit.status]}</span>
          <dl className="finder-facts">
            <div><dt>Rooms</dt><dd>{unit.rooms}</dd></div>
            <div><dt>Living space</dt><dd>{unit.areaM2} m²</dd></div>
            {rent ? (<><div><dt>Net rent / month</dt><dd>{chf(unit.price)}</dd></div><div><dt>Charges / month</dt><dd>{unit.charges ? chf(unit.charges) : "–"}</dd></div><div><dt>Gross rent / month</dt><dd>{chf(unit.price + (unit.charges ?? 0))}</dd></div></>) : <div><dt>Price</dt><dd>{chf(unit.price)}</dd></div>}
          </dl>
          {rooms.length ? (
            <ul className="finder-rooms">{rooms.map((r) => <li key={r.id}><span>{r.name}</span><span>{r.areaM2.toFixed(1)} m²</span></li>)}</ul>
          ) : null}
          <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 16, flexWrap: "wrap", alignItems: "center" }}>
            {plan && rooms.length ? (
              <div className="seg" role="group" aria-label="View"><button aria-pressed={mode === "2d"} onClick={() => setMode("2d")}>2D</button><button aria-pressed={mode === "3d"} onClick={() => setMode("3d")}>3D</button></div>
            ) : null}
            {plan || unit.pdf ? <a className="s-btn ghost" style={{ height: 40, marginLeft: "auto" }} href={unit.pdf || `/plan/${p.id}/${unit.id}`} download={unit.pdf ? unit.pdfName || `${unit.ref}.pdf` : undefined} target="_blank" rel="noreferrer">Floor plan PDF</a> : null}
            {unit.status !== "available" ? <a className="s-btn" style={{ height: 40, marginLeft: plan || unit.pdf ? 0 : "auto" }} href="#waitlist" onClick={onClose}>Join waiting list</a>
              : applyLink(cfg, unit) ? <a className="s-btn" style={{ height: 40, marginLeft: plan || unit.pdf ? 0 : "auto" }} href={applyLink(cfg, unit)} target="_blank" rel="noreferrer">{cfg.applyLabel}</a>
              : <button type="button" className="s-btn" style={{ height: 40, marginLeft: plan || unit.pdf ? 0 : "auto" }} onClick={() => { onClose(); applyToForm(unit.ref); }}>{cfg.applyLabel}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** two-thumb range slider (two native inputs on one track) */
function Range({ label, min, max, step, value, onChange, format }: { label: string; min: number; max: number; step: number; value: [number, number]; onChange: (v: [number, number]) => void; format: (v: [number, number]) => string }) {
  const pct = (v: number) => (max > min ? ((v - min) / (max - min)) * 100 : 0);
  return (
    <div className="range">
      <div className="range-label">{label}</div>
      <div className="range-track">
        <span className="range-fill" style={{ left: `${pct(value[0])}%`, right: `${100 - pct(value[1])}%` }} />
        <input type="range" min={min} max={max} step={step} value={value[0]} aria-label={`${label} from`} onChange={(e) => onChange([Math.min(Number(e.target.value), value[1]), value[1]])} />
        <input type="range" min={min} max={max} step={step} value={value[1]} aria-label={`${label} to`} onChange={(e) => onChange([value[0], Math.max(Number(e.target.value), value[0])])} />
      </div>
      <div className="range-value">{format(value)}</div>
    </div>
  );
}

export const FINDER_VARIANTS = [
  { value: "split", label: "Building + table" },
  { value: "stacked", label: "Building on top" },
  { value: "floors", label: "Grouped by floor" },
  { value: "table", label: "Table only" },
  { value: "cards", label: "Cards" },
];

export function UnitFinder({ title, text, note, variant, puck }: any) {
  const p = useProject(puck?.metadata?.projectId) ?? null;
  const [floor, setFloor] = useState<string>("");
  const [rooms, setRooms] = useState<string>("");
  const [onlyFree, setOnlyFree] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [open, setOpenState] = useState<string | null>(null);
  const site = useSite();
  // depending on the site setting an apartment opens in a pop-up or on its own page
  const setOpen = (uid: string | null) => {
    if (uid && site.settings.unitDetail === "page" && !puck?.isEditing && p) { const q = siteQuery(!!site.draft, site.lang, p.locale); window.location.href = `/site/${p.id}/unit/${uid}${q ? `?${q}` : ""}`; return; }
    setOpenState(uid);
  };
  const all = useMemo(() => p?.units ?? [], [p?.units]);
  const uses = useMemo(() => (["apartment", "commercial", "parking"] as UnitUse[]).filter((u) => all.some((x) => useOf(x) === u)), [all]);
  const [tabState, setTab] = useState<UnitUse | null>(null);
  const tab: UnitUse = tabState && uses.includes(tabState) ? tabState : uses[0] ?? "apartment";
  const apt = tab === "apartment";
  const units = useMemo(() => all.filter((u) => useOf(u) === tab), [all, tab]);
  const rentMode = p?.type !== "sale";
  const total = (u: Unit) => u.price + (rentMode && tab !== "parking" ? u.charges ?? 0 : 0);
  const bounds = useMemo(() => {
    const pr = units.map((u) => u.price + (rentMode && tab !== "parking" ? u.charges ?? 0 : 0)).filter(Boolean), ar = units.map((u) => u.areaM2).filter(Boolean);
    const step = rentMode ? 10 : 5000;
    return {
      step,
      price: pr.length ? ([Math.floor(Math.min(...pr) / step) * step, Math.ceil(Math.max(...pr) / step) * step] as [number, number]) : null,
      area: ar.length ? ([Math.floor(Math.min(...ar)), Math.ceil(Math.max(...ar))] as [number, number]) : null,
    };
  }, [units, rentMode, tab]);
  const [priceSel, setPrice] = useState<[number, number] | null>(null);
  const [areaSel, setArea] = useState<[number, number] | null>(null);
  const clamp = (v: [number, number] | null, b: [number, number] | null): [number, number] | null => (b ? (v ? [Math.max(b[0], Math.min(v[0], b[1])), Math.max(b[0], Math.min(v[1], b[1]))] : b) : null);
  const priceR = clamp(priceSel, bounds.price), areaR = clamp(areaSel, bounds.area);
  const roomOpts = useMemo(() => [...new Set(units.map((u) => u.rooms))].sort((a, b) => a - b), [units]);
  const list = useMemo(() => units.filter((u) => (!apt || floor === "" || u.floor === Number(floor)) && (!apt || rooms === "" || u.rooms === Number(rooms)) && (!onlyFree || u.status === "available") && (!priceR || !u.price || (total(u) >= priceR[0] && total(u) <= priceR[1])) && (!areaR || !u.areaM2 || (u.areaM2 >= areaR[0] && u.areaM2 <= areaR[1]))), [units, floor, rooms, onlyFree, apt, priceR?.[0], priceR?.[1], areaR?.[0], areaR?.[1]] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const active = useMemo(() => new Set(list.map((u) => u.id)), [list]);
  const rent = p?.type !== "sale";
  const hasModel = (!!p?.floorPlans.length || !!p?.isometry) && apt;
  const tableBox = useRef<HTMLDivElement>(null);
  // hovering the drawing highlights the row and brings it into view inside the scrolling table
  const hoverModel = (id: string | null) => {
    setHover(id);
    const box = tableBox.current;
    const row = id ? box?.querySelector<HTMLElement>(`tr[data-unit="${CSS.escape(id)}"]`) : null;
    if (!box || !row) return;
    const b = box.getBoundingClientRect(), r = row.getBoundingClientRect();
    const head = box.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    if (r.top < b.top + head || r.bottom > b.bottom) box.scrollTo({ top: box.scrollTop + (r.top - b.top) - (box.clientHeight - r.height) / 2, behavior: "smooth" });
  };
  const openUnit = apt ? units.find((u) => u.id === open) : undefined;
  const v: string = FINDER_VARIANTS.some((x) => x.value === variant) ? variant : "split";
  const cfg = unitSettings(p);
  const has = (k: string) => cfg.columns.includes(k);
  const showModel = hasModel && v !== "table" && v !== "cards";
  const priceOf = (u: Unit, n?: number) => (cfg.hideTakenPrice && u.status !== "available" ? "–" : money(n));
  const pdfHref = (u: Unit) => u.pdf || (p && locate(p, u) ? `/plan/${p.id}/${u.id}` : "");
  const applyBtn = (u: Unit, cls = "apply") => {
    if (u.status !== "available") return <a className={`${cls} muted`} href="#waitlist" onClick={(e) => e.stopPropagation()}>Waiting list</a>;
    const url = applyLink(cfg, u);
    return url
      ? <a className={cls} href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{cfg.applyLabel}</a>
      : <button type="button" className={cls} onClick={(e) => { e.stopPropagation(); setOpenState(null); applyToForm(u.ref); }}>{cfg.applyLabel}</button>;
  };
  const pdfIcon = <svg width="15" height="18" viewBox="0 0 15 18" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" aria-hidden><path d="M9 1H2.5A1.5 1.5 0 0 0 1 2.5v13A1.5 1.5 0 0 0 2.5 17h10a1.5 1.5 0 0 0 1.5-1.5V6L9 1Z" /><path d="M9 1v5h5" /></svg>;

  const selects = apt ? (
    <div className="filters" role="group" aria-label="Filter">
      <select className="s-select" value={floor} onChange={(e) => setFloor(e.target.value)} aria-label="Floor">
        <option value="">All floors</option>
        {p && floorsOf(p).map((f) => <option key={f} value={f}>{floorName(f)}</option>)}
      </select>
      <select className="s-select" value={rooms} onChange={(e) => setRooms(e.target.value)} aria-label="Rooms">
        <option value="">All rooms</option>
        {roomOpts.map((r) => <option key={r} value={r}>{r} rooms</option>)}
      </select>
    </div>
  ) : null;
  const model = showModel && p ? (
    <div className="finder-model">
      {p.isometry && ((p.isoMode ?? "2d") === "2d" || !p.floorPlans.length) ? <IsometryView iso={p.isometry} units={units} accent={p.accent} active={active} hover={hover} selected={open} onHover={hoverModel} onSelect={setOpen} /> : <Building3D project={p} accent={p.accent} active={active} hover={hover} selected={open} onHover={hoverModel} onSelect={setOpen} />}
    </div>
  ) : puck?.isEditing && apt && !hasModel && v !== "table" && v !== "cards" ? <div className="note">Upload your isometry (SVG) under “Isometry”, or a floor plan PDF under “Floor plans”, to get the interactive building here.</div> : null;
  const foot = note ? <p className="finder-note">{note}</p> : null;
  const ranges = (
    <div className="finder-filters">
      {priceR && bounds.price && bounds.price[1] > bounds.price[0] ? <Range label={tab === "parking" ? "Rent" : rentMode ? "Gross rent" : "Price"} min={bounds.price[0]} max={bounds.price[1]} step={bounds.step} value={priceR} onChange={setPrice} format={([a, b]) => `${chf(a).replace("CHF ", "")} – ${chf(b).replace("CHF ", "")} CHF`} /> : null}
      {tab !== "parking" && areaR && bounds.area && bounds.area[1] > bounds.area[0] ? <Range label="Area" min={bounds.area[0]} max={bounds.area[1]} step={1} value={areaR} onChange={setArea} format={([a, b]) => `${a} – ${b} m²`} /> : null}
      <label className="s-check">
        <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} />
        <span>Only available {apt ? "apartments" : tab === "parking" ? "spaces" : "units"}</span>
      </label>
      <span className="finder-count">{list.length} of {units.length}</span>
    </div>
  );

  const perM2 = tab === "commercial" && rent && has("perM2");
  const row = (u: Unit) => (
    <tr key={u.id} data-unit={u.id} className={`${u.status === "available" ? "" : "off"} ${hover === u.id ? "hl" : ""}`} onMouseEnter={() => setHover(u.id)} onMouseLeave={() => setHover(null)} onClick={() => apt && setOpen(u.id)} style={{ cursor: apt ? "pointer" : "default" }}>
      <td>{u.ref}</td>
      {apt ? <>{has("floor") ? <td>{floorName(u.floor)}</td> : null}{has("rooms") ? <td>{u.rooms}</td> : null}</> : <><td>{u.label ?? "–"}</td>{tab === "commercial" && has("floor") ? <td>{floorName(u.floor)}</td> : null}</>}
      {tab !== "parking" && has("area") ? <td className="num">{u.areaM2} m²</td> : null}
      {tab === "parking" || !rent ? (has("net") || has("gross") ? <td className="num">{priceOf(u, u.price)}</td> : null) : (<>{has("net") ? <td className="num hide-sm">{priceOf(u, u.price)}</td> : null}{has("charges") ? <td className="num hide-sm">{priceOf(u, u.charges)}</td> : null}{has("gross") ? <td className="num">{priceOf(u, u.price + (u.charges ?? 0))}</td> : null}</>)}
      {perM2 ? <td className="num hide-sm">{u.areaM2 && u.price ? priceOf(u, Math.round((u.price * 12) / u.areaM2)) : "–"}</td> : null}
      {has("note") ? <td className="hide-sm">{u.note ?? ""}</td> : null}
      {apt && has("plan") ? <td><button className="link" onClick={(e) => { e.stopPropagation(); setOpen(u.id); }} aria-label={`Floor plan of ${u.ref}`}>View</button>{pdfHref(u) ? <a className="pdf" href={pdfHref(u)} target="_blank" rel="noreferrer" download={u.pdf ? u.pdfName || `${u.ref}.pdf` : undefined} onClick={(e) => e.stopPropagation()} aria-label={`Floor plan of ${u.ref} as PDF`} title="Floor plan as PDF">{pdfIcon}</a> : null}</td> : null}
      {has("status") ? <td><span className="status"><i style={{ background: STATUS_COLOR[u.status] }} />{STATUS_LABEL[u.status]}</span></td> : null}
      {has("apply") ? <td className="apply-cell">{applyBtn(u)}</td> : null}
    </tr>
  );
  const byFloor = v === "floors" && apt ? [...new Set(list.map((u) => u.floor))].sort((a, b) => b - a) : null;
  const table = (
    <div className="finder-table" ref={tableBox}>
      <table className={`units ${has("apply") ? "has-apply" : ""}`}>
        <thead>
          <tr><th>No.</th>{apt ? <>{has("floor") ? <th>Floor</th> : null}{has("rooms") ? <th>Rms</th> : null}</> : <><th>{tab === "commercial" ? "Use" : "Type"}</th>{tab === "commercial" && has("floor") ? <th>Floor</th> : null}</>}{tab !== "parking" && has("area") ? <th className="num">Area</th> : null}
            {tab === "parking" ? (has("net") || has("gross") ? <th className="num">Rent / mo. (CHF)</th> : null) : rent ? (<>{has("net") ? <th className="num hide-sm">Net (CHF)</th> : null}{has("charges") ? <th className="num hide-sm">Charges</th> : null}{has("gross") ? <th className="num">Gross (CHF)</th> : null}</>) : has("net") || has("gross") ? <th className="num">Price (CHF)</th> : null}
            {perM2 ? <th className="num hide-sm">Per m² / year</th> : null}{has("note") ? <th className="hide-sm">Remark</th> : null}{apt && has("plan") ? <th>Plan</th> : null}{has("status") ? <th>Status</th> : null}{has("apply") ? <th aria-label="Apply" /> : null}</tr>
        </thead>
        <tbody>
          {list.length === 0 ? <tr><td colSpan={12} style={{ color: "#6b665f" }}>No apartments match these filters.</td></tr>
            : byFloor ? byFloor.flatMap((f) => [<tr key={`f${f}`} className="grp"><td colSpan={12}>{floorName(f)} <span>{list.filter((u) => u.floor === f).length}</span></td></tr>, ...list.filter((u) => u.floor === f).map(row)])
            : list.map(row)}
        </tbody>
      </table>
    </div>
  );
  const cards = (
    <div className="unit-cards">
      {list.length === 0 ? <div className="note">No apartments match these filters.</div> : list.map((u) => (
        <article key={u.id} className={`unit-card ${u.status === "available" ? "" : "off"}`} onClick={() => apt && setOpen(u.id)} style={{ cursor: apt ? "pointer" : "default" }}>
          <div className="uc-top"><span className="uc-ref">{u.ref}</span>{has("status") ? <span className="status"><i style={{ background: STATUS_COLOR[u.status] }} />{STATUS_LABEL[u.status]}</span> : null}</div>
          <div className="uc-main">{apt ? (has("rooms") ? `${u.rooms} rooms` : "Apartment") : u.label ?? USE_LABEL[tab]}</div>
          <dl>
            {apt && has("floor") ? <div><dt>Floor</dt><dd>{floorName(u.floor)}</dd></div> : null}
            {tab !== "parking" && has("area") ? <div><dt>Area</dt><dd>{u.areaM2} m²</dd></div> : null}
            {has("gross") || has("net") ? <div><dt>{tab === "parking" ? "Rent" : rent ? (has("gross") ? "Gross rent" : "Net rent") : "Price"}</dt><dd>{priceOf(u, u.price + (rent && tab !== "parking" && has("gross") ? u.charges ?? 0 : 0))}</dd></div> : null}
            {has("note") && u.note ? <div><dt>Remark</dt><dd>{u.note}</dd></div> : null}
          </dl>
          <div className="uc-foot">
            {apt && has("plan") && pdfHref(u) ? <a className="pdf" href={pdfHref(u)} target="_blank" rel="noreferrer" download={u.pdf ? u.pdfName || `${u.ref}.pdf` : undefined} onClick={(e) => e.stopPropagation()} title="Floor plan as PDF">{pdfIcon}<span>Plan</span></a> : <span />}
            {has("apply") ? applyBtn(u) : apt ? <span className="link">Details</span> : null}
          </div>
        </article>
      ))}
    </div>
  );

  return (
    <section id="units" className={`finder-sec fv-${v}`}>
      <div className="wrap">
        <h2>{title}</h2>
        {text ? <p style={{ marginBottom: 24, color: "#45413b", maxWidth: "44em" }}>{text}</p> : null}
        {uses.length > 1 ? (
          <div className="seg" role="tablist" aria-label="Offer" style={{ marginBottom: 24 }}>
            {uses.map((u) => <button key={u} role="tab" aria-selected={tab === u} aria-pressed={tab === u} onClick={() => { setTab(u); setOpen(null); setPrice(null); setArea(null); }}>{USE_LABEL[u]} <span style={{ opacity: 0.6, marginLeft: 4 }}>{all.filter((x) => useOf(x) === u).length}</span></button>)}
          </div>
        ) : null}
        {all.length === 0 ? <div className="note">No apartments yet. Add them in the dashboard under “Apartments”.</div>
          : v === "split" || v === "floors" ? (
            <div className={`finder ${showModel ? "" : "no-model"}`}>
              <div className="finder-left">{selects}{model}{foot}</div>
              <div className="finder-right">{ranges}{table}</div>
            </div>
          ) : (
            <div className="finder-stack">
              {v === "stacked" ? model : null}
              <div className="finder-bar">{selects}{ranges}</div>
              {v === "cards" ? cards : table}
              {foot}
            </div>
          )}
      </div>
      {p && openUnit ? <Detail p={p} unit={openUnit} cfg={cfg} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

/** middle part of the apartment page */
export function UnitPage({ unitId, puck }: any) {
  const p = useProject(puck?.metadata?.projectId) ?? null;
  const { base } = useSite();
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const unit = p?.units.find((u) => u.id === unitId);
  if (!p || !unit) return null;
  const loc = locate(p, unit);
  const plan = loc ? subPlan(loc.plan, loc.group) : null;
  const rooms = plan ? (plan.rooms.some((r) => r.confirmed) ? plan.rooms.filter((r) => r.confirmed) : plan.rooms) : [];
  const rent = p.type === "rent";
  const apts = p.units.filter((u) => useOf(u) === "apartment");
  const svg = p.isometry && ((p.isoMode ?? "2d") === "2d" || !p.floorPlans.length);
  const facts: [string, string][] = [
    ["Type", unit.use === "commercial" ? "Commercial" : "Apartment"],
    ["Building", unit.building],
    ["Floor", floorName(unit.floor)],
    ["Rooms", String(unit.rooms || "–")],
    ["Living space", `${unit.areaM2} m²`],
    ...(rent ? ([["Net rent", `${chf(unit.price)} / month`], ["Charges", unit.charges ? `${chf(unit.charges)} / month` : "–"], ["Gross rent", `${chf(unit.price + (unit.charges ?? 0))} / month`]] as [string, string][]) : ([["Price", chf(unit.price)]] as [string, string][])),
    ["Status", STATUS_LABEL[unit.status]],
  ];
  return (
    <section className="unit-page">
      <div className="wrap">
        <a className="unit-back" href={`${base ?? ""}#units`}>← All apartments</a>
        <div className="unit-grid">
          <div className="unit-main">
            <div className="s-eyebrow">Overview</div>
            <h1>Apartment {unit.ref}</h1>
            <div className="unit-stage">
              {!plan || !rooms.length ? <div className="note">The floor plan for this apartment follows.</div> : mode === "2d" ? <Plan2D plan={{ ...plan, rooms }} /> : <Plan3D plan={{ ...plan, rooms }} accent={p.accent} />}
            </div>
            <div className="unit-actions">
              {plan && rooms.length ? <div className="seg" role="group" aria-label="View"><button aria-pressed={mode === "2d"} onClick={() => setMode("2d")}>Floor plan 2D</button><button aria-pressed={mode === "3d"} onClick={() => setMode("3d")}>3D</button></div> : null}
              {plan || unit.pdf ? <a className="s-btn ghost" style={{ height: 40 }} href={unit.pdf || `/plan/${p.id}/${unit.id}`} download={unit.pdf ? unit.pdfName || `${unit.ref}.pdf` : undefined} target="_blank" rel="noreferrer">Floor plan PDF</a> : null}
            </div>
            {rooms.length ? <ul className="finder-rooms" style={{ maxWidth: 360 }}>{rooms.map((r) => <li key={r.id}><span>{r.name}</span><span>{r.areaM2.toFixed(1)} m²</span></li>)}</ul> : null}
          </div>
          <aside className="unit-info">
            <h2>Information</h2>
            {svg || p.floorPlans.length ? (
              <div className="unit-iso">
                {svg ? <IsometryView iso={p.isometry!} units={apts} accent="#ffffff" selected={unit.id} /> : <Building3D project={p} accent={p.accent} selected={unit.id} />}
              </div>
            ) : null}
            <dl>{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            {unit.status === "available" && applyLink(unitSettings(p), unit) ? <a className="s-btn" href={applyLink(unitSettings(p), unit)} target="_blank" rel="noreferrer">{unitSettings(p).applyLabel}</a> : <a className="s-btn" href="#contact">{unit.status === "available" ? "Enquire about this apartment" : "Join the waiting list"}</a>}
          </aside>
        </div>
      </div>
    </section>
  );
}
