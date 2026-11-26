"use client";
/* eslint-disable @next/next/no-img-element */
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import Plan2D from "@/components/plan/Plan2D";
import { CATALOGUE, catalogueFor, kindOf, newPiece, piecesOf, type Piece } from "@/lib/floorplan/furnish";
import { planFromFile, planFromUrl } from "@/lib/floorplan/pdf";
import { updateProject, useProject } from "@/lib/store";
import { buildingsOf, floorsOf, groupColor, groupOf, groupsOf, slotsOf, unitsOnFloor } from "@/lib/building";
import { findRenderer, noRenderer, RENDER_STYLES, type RenderProvider, type RenderStyle } from "@/lib/render/provider";
import type { FloorPlan, PlanView, Room } from "@/lib/types";
import { download } from "@/lib/units-import";

const Plan3D = dynamic(() => import("@/components/plan/Plan3D"), { ssr: false });
const Building3D = dynamic(() => import("@/components/plan/Building3D"), { ssr: false });

const SAMPLES = [
  ["/samples/floor-plan-typical-floor.pdf", "Whole floor (4 apartments)"],
  ["/samples/floor-plan-4-5-rooms.pdf", "4.5-room type"],
  ["/samples/floor-plan-2-5-rooms.pdf", "2.5-room type"],
];
const SCALE: Record<FloorPlan["scaleSource"], string> = {
  labels: "Scale calculated from the m² labels in the PDF",
  doors: "Scale estimated from door widths (approx. 85 cm) – please check the areas",
  walls: "Scale estimated from wall thickness – please check the areas",
  manual: "Scale set manually",
};

export default function PlansWorkspace({ id }: { id: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const p = useProject(id);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState<string | null>(null);
  const [view, setView] = useState<"orig" | "2d" | "3d" | "bld">("2d");
  const [underlay, setUnderlay] = useState(false);
  const [furn, setFurn] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [piece, setPiece] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  if (!p) return null;
  const plan = p.floorPlans.find((f) => f.id === current) ?? p.floorPlans[0];

  const add = async (make: () => Promise<FloorPlan>, label: string) => {
    setBusy(label);
    setError("");
    try {
      const t0 = performance.now();
      const fp = await make();
      await new Promise((r) => setTimeout(r, Math.max(0, 600 - (performance.now() - t0)))); // let the scan read as a step
      if (!fp.rooms.length) setError(`No enclosed rooms were found in “${label}”. Plans with solid, filled walls work best.`);
      updateProject(p.id, (x) => ({ ...x, floorPlans: [...x.floorPlans, fp] }));
      setCurrent(fp.id);
      setView("2d");
      setSel(null);
    } catch (e) {
      console.error(e);
      setError("The file could not be processed.");
    }
    setBusy(null);
  };
  const removePlan = (f: FloorPlan) => {
    if (!confirm(`Remove “${f.name}”? Its rooms and 2D/3D views are deleted; the PDF on your computer is not touched.`)) return;
    updateProject(p.id, (x) => ({ ...x, floorPlans: x.floorPlans.filter((q) => q.id !== f.id), units: x.units.map((u) => (u.floorPlanId === f.id ? { ...u, floorPlanId: undefined } : u)) }));
    if (current === f.id) setCurrent(null);
    setSel(null);
  };
  const onFiles = (files: FileList | null) => { const f = files?.[0]; if (f) add(() => planFromFile(f, f.name), f.name); };
  const patch = (fn: (f: FloorPlan) => FloorPlan) => plan && updateProject(p.id, (x) => ({ ...x, floorPlans: x.floorPlans.map((f) => (f.id === plan.id ? fn(f) : f)) }));
  const setRooms = (rooms: Room[]) => patch((f) => ({ ...f, rooms }));
  const patchRoom = (rid: string, r: Partial<Room>) => patch((f) => ({ ...f, rooms: f.rooms.map((x) => (x.id === rid ? { ...x, ...r } : x)) }));
  // ── furniture: automatic by default; any change makes the room the owner's own arrangement ──
  const setFurniture = (next: Record<string, Piece[]>) => patch((f) => ({ ...f, furniture: next }));
  const room = plan?.rooms.find((r) => r.id === sel);
  const roomPieces = plan && room ? piecesOf(plan, room) : [];
  const pieceRoom = plan && piece ? plan.rooms.find((r) => piecesOf(plan, r).some((q) => q.id === piece)) : undefined;
  const chosen = plan && pieceRoom ? piecesOf(plan, pieceRoom).find((q) => q.id === piece) : undefined;
  const setRoomPieces = (rid: string, list: Piece[]) => plan && setFurniture({ ...(plan.furniture ?? {}), [rid]: list });
  const addPiece = (type: string) => { if (!plan || !room) return; const n = newPiece(plan, room, type, roomPieces); setRoomPieces(room.id, [...roomPieces, n]); setPiece(n.id); setAdding(false); };
  const autoRoom = () => { if (!plan || !room) return; const next = { ...(plan.furniture ?? {}) }; delete next[room.id]; setFurniture(next); setPiece(null); };
  // ── pictures: views taken while standing in the flat ──
  const addView = (s: { image: string; x: number; z: number; yaw: number; roomId: string | null }) => patch((f) => {
    const name = f.rooms.find((r) => r.id === s.roomId)?.name ?? "View";
    const n = (f.views ?? []).filter((v) => v.roomId === s.roomId).length;
    const v: PlanView = { id: Math.random().toString(36).slice(2, 10), name: n ? `${name} ${n + 1}` : name, roomId: s.roomId, x: s.x, z: s.z, yaw: s.yaw, image: s.image, at: Date.now() };
    return { ...f, views: [...(f.views ?? []), v] };
  });
  const [renderer, setRenderer] = useState<RenderProvider>(noRenderer);
  const [style, setStyle] = useState<RenderStyle>("scandinavian");
  const [rendering, setRendering] = useState<string[]>([]);
  const [renderErr, setRenderErr] = useState<Record<string, string>>({});
  const [plain, setPlain] = useState<string[]>([]);
  useEffect(() => { findRenderer().then(setRenderer); }, []);
  const renderView = async (v: PlanView) => {
    if (!renderer.available || rendering.includes(v.id)) return;
    setRendering((x) => [...x, v.id]); setRenderErr((x) => ({ ...x, [v.id]: "" }));
    try {
      const { image } = await renderer.render({ view: v.image, room: v.name, style });
      patch((f) => ({ ...f, views: (f.views ?? []).map((q) => (q.id === v.id ? { ...q, photo: image } : q)) }));
      setPlain((x) => x.filter((id) => id !== v.id));
    } catch (e) { setRenderErr((x) => ({ ...x, [v.id]: e instanceof Error ? e.message : "Rendering failed." })); }
    setRendering((x) => x.filter((id) => id !== v.id));
  };
  const hasUnits = buildingsOf(p).length > 0;
  const fileBase = (plan?.name ?? "floor-plan").replace(/[^\w]+/g, "-").toLowerCase();
  const savePng = (url: string) => { const a = document.createElement("a"); a.href = url; a.download = `${fileBase}-${view}.png`; a.click(); };
  const exportSvg = () => {
    const svg = stage.current?.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.querySelectorAll("circle, line[stroke=transparent]").forEach((n) => n.remove());
    download(`${fileBase}.svg`, new XMLSerializer().serializeToString(clone).replaceAll("var(--accent)", p.accent), "image/svg+xml");
  };
  const exportPng = () => {
    const el = stage.current;
    if (!el) return;
    const canvas = el.querySelector("canvas");
    if (canvas) return savePng(canvas.toDataURL("image/png"));
    const svg = el.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.querySelectorAll("circle, line[stroke=transparent]").forEach((n) => n.remove());
    const vb = svg.viewBox.baseVal, k = 2400 / vb.width;
    clone.setAttribute("width", String(vb.width * k));
    clone.setAttribute("height", String(vb.height * k));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = vb.width * k; c.height = vb.height * k;
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0);
      savePng(c.toDataURL("image/png"));
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone).replaceAll("var(--accent)", p.accent));
  };
  const confirmed = plan?.rooms.filter((r) => r.confirmed).length ?? 0;
  const total = plan?.rooms.reduce((s, r) => s + r.areaM2, 0) ?? 0;

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 lg:col-span-3 grid gap-4 content-start">
        <label
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}
          className={`block border border-dashed p-5 text-center cursor-pointer transition-all ${over ? "border-accent bg-surface scale-[1.01]" : "border-line-strong hover:border-ink"}`}
          style={{ borderRadius: 6 }}
        >
          <div className="font-medium">Upload a PDF or image</div>
          <div className="text-muted text-[13px] mt-1">Drop it here or click. The 2D and 3D views are generated from the plan.</div>
          <input type="file" accept="application/pdf,image/*" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        </label>
        <div className="text-[13px] text-muted">
          Try a sample:{" "}
          {SAMPLES.map(([url, name], i) => (
            <span key={url}>{i ? " · " : ""}<button className="underline text-ink" disabled={!!busy} onClick={() => add(() => planFromUrl(url, name), name)}>{name}</button></span>
          ))}
        </div>
        {error ? <div className="panel p-3 text-[13px]" style={{ borderLeft: "3px solid var(--warn)" }} role="alert">{error}</div> : null}
        <div className="panel">
          {p.floorPlans.length === 0 ? <div className="p-4 text-muted text-[13px]">No floor plans yet.</div> : p.floorPlans.map((f) => (
            <div key={f.id} className={`group relative border-b border-line last:border-0 transition-colors ${plan?.id === f.id ? "bg-sunken" : "hover:bg-bg"}`}>
              <button onClick={() => { setCurrent(f.id); setSel(null); }} className="w-full text-left p-3 pr-11 flex gap-3 items-center">
                <img src={f.image} alt="" className="w-12 h-9 object-cover border border-line" style={{ borderRadius: 3 }} />
                <span className="min-w-0"><span className="block font-medium truncate">{f.name}</span><span className="text-muted text-[12px] tnum">{f.rooms.filter((r) => r.confirmed).length}/{f.rooms.length} rooms confirmed</span></span>
              </button>
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center border border-transparent text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-err hover:border-err transition-all"
                style={{ borderRadius: "50%" }}
                title="Remove this plan" aria-label={`Remove ${f.name}`}
                onClick={() => removePlan(f)}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5M6.8 7v3.5M9.2 7v3.5" /></svg>
              </button>
            </div>
          ))}
        </div>
        {p.floorPlans.length > 1 ? <button className="text-[13px] text-muted underline justify-self-start hover:text-err" onClick={() => { if (confirm(`Remove all ${p.floorPlans.length} floor plans?`)) { updateProject(p.id, (x) => ({ ...x, floorPlans: [], units: x.units.map((u) => ({ ...u, floorPlanId: undefined })) })); setCurrent(null); setSel(null); } }}>Remove all plans</button> : null}
      </div>

      <div className="col-span-12 lg:col-span-9">
        {busy ? (
          <div className="panel h-[560px] flex flex-col items-center justify-center gap-4 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-full pointer-events-none" style={{ background: "linear-gradient(to bottom, transparent 46%, color-mix(in srgb, var(--accent) 16%, transparent) 50%, transparent 54%)", animation: "scan 1.2s linear infinite" }} />
            <div className="font-medium">Reading “{busy}”</div>
            <div className="text-muted text-[13px]">Detecting walls · closing openings · measuring rooms</div>
          </div>
        ) : !plan ? (
          <div className="panel h-[560px] flex items-center justify-center text-muted">Upload a floor plan on the left or pick a sample.</div>
        ) : (
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 xl:col-span-8">
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <div className="inline-flex border border-line-strong overflow-hidden" style={{ borderRadius: 4 }} role="group" aria-label="View">
                  {([["orig", "Original"], ["2d", "Floor 2D"], ["3d", "Floor 3D"], ["bld", "Building"]] as const).filter(([v]) => v !== "bld" || hasUnits).map(([v, l]) => (
                    <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={`h-8 px-4 text-[13px] transition-colors ${view === v ? "bg-ink text-white" : "bg-surface hover:bg-sunken"}`}>{l}</button>
                  ))}
                </div>
                <div className="flex gap-2 ml-auto">
                  {view === "2d" ? <button className="btn btn-sm" onClick={exportSvg}>SVG</button> : null}
                  {view !== "orig" ? <button className="btn btn-sm" onClick={exportPng}>Download PNG</button> : null}
                </div>
                {view === "2d" || view === "3d" ? <label className="text-[13px] flex items-center gap-2"><input type="checkbox" checked={furn} onChange={(e) => setFurn(e.target.checked)} className="accent-[var(--accent)]" />Furniture</label> : null}
                {view === "2d" ? <label className="text-[13px] flex items-center gap-2"><input type="checkbox" checked={underlay} onChange={(e) => setUnderlay(e.target.checked)} className="accent-[var(--accent)]" />Original as underlay</label> : null}
              </div>
              <div ref={stage} className="panel h-[560px] p-3 settle" key={plan.id + view}>
                {view === "orig" ? <img src={plan.image} alt={plan.name} className="w-full h-full object-contain" />
                  : view === "2d" ? <Plan2D plan={plan} mode="edit" furniture={furn} onFurniture={setFurniture} piece={piece} onPiece={setPiece} showImage={underlay} selected={sel} onSelect={setSel} onChange={setRooms} colorFor={(r) => groupColor(groupOf(plan, r.group), groupsOf(plan)[groupOf(plan, r.group)]?.common)} />
                  : view === "bld" ? <Building3D project={p} accent={p.accent} />
                  : <Plan3D plan={plan} furniture={furn} onCapture={addView} onFurniture={setFurniture} piece={piece} onPiece={setPiece} selected={sel} onSelect={setSel} accent={p.accent} />}
              </div>
              <p className="text-[12px] text-muted mt-2">
                {view === "2d" ? "Click a room, then drag its points (they snap to right angles). Double-click an edge to insert a point, right-click to delete one. Furniture can be dragged." : view === "3d" ? "Drag to rotate, scroll to zoom. Walls, door lintels and windows come from the detected plan." : view === "bld" ? "The floor plan stacked over every floor it applies to. Each volume is one apartment from the unit list; grey ones are let or sold." : "First page of the uploaded file."}
              </p>
              {view === "3d" ? (
                <div className="shots">
                  <div className="shots-head">
                    <span className="furn-title">Pictures<small>{plan.views?.length ? `${plan.views.length} saved · the plain 3D view, measured from the plan` : "Press “Walk through”, stand where you like and take a picture. Or let Pascal take one per room."}</small></span>
                    {renderer.available ? (
                      <span className="shots-note">
                        <select value={style} onChange={(e) => setStyle(e.target.value as RenderStyle)} aria-label="Photo style">{RENDER_STYLES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
                        {renderer.label} · the picture is sent to Google
                      </span>
                    ) : <span className="shots-note">Photo rendering: no image model connected yet</span>}
                  </div>
                  {plan.views?.length ? (
                    <div className="shots-grid">
                      {plan.views.map((v) => (
                        <figure key={v.id} className="rise">
                          <div className={`shots-pic ${rendering.includes(v.id) ? "busy" : ""}`}>
                            <img src={v.photo && !plain.includes(v.id) ? v.photo : v.image} alt={v.name} />
                            {v.photo ? <button type="button" className="shots-tag" onClick={() => setPlain((x) => (x.includes(v.id) ? x.filter((i) => i !== v.id) : [...x, v.id]))} title="Switch between the AI photo and the 3D view">{plain.includes(v.id) ? "3D view" : "AI photo"}</button> : null}
                            {rendering.includes(v.id) ? <span className="shots-wait">Rendering … about half a minute</span> : null}
                          </div>
                          <figcaption>
                            <input value={v.name} onChange={(e) => patch((f) => ({ ...f, views: (f.views ?? []).map((q) => (q.id === v.id ? { ...q, name: e.target.value } : q)) }))} aria-label="Picture name" />
                            <a href={v.photo ?? v.image} download={`${fileBase}-${v.name.replace(/[^\w]+/g, "-").toLowerCase()}.jpg`} title="Download" aria-label={`Download ${v.name}`}>↓</a>
                            <button type="button" title="Delete" aria-label={`Delete ${v.name}`} onClick={() => patch((f) => ({ ...f, views: (f.views ?? []).filter((q) => q.id !== v.id) }))}>×</button>
                          </figcaption>
                          <button type="button" className="shots-render" disabled={!renderer.available || rendering.includes(v.id)} onClick={() => renderView(v)} title={renderer.available ? "Turn this view into a photo" : "Needs an image model, which is not connected in this preview"}>{rendering.includes(v.id) ? "Rendering …" : v.photo ? "Render again" : "Render as photo"}</button>
                          {renderErr[v.id] ? <span className="shots-err" role="alert">{renderErr[v.id]}</span> : null}
                        </figure>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {furn && (view === "2d" || view === "3d") ? (
                <div className="furn-bar">
                  {chosen && pieceRoom ? (
                    <div className="furn-row">
                      <span className="furn-title">{CATALOGUE[chosen.type]?.label ?? "Furniture"}<small>in {pieceRoom.name} · drag it to move</small></span>
                      <button className="btn btn-sm" onClick={() => setRoomPieces(pieceRoom.id, piecesOf(plan, pieceRoom).map((q) => (q.id === chosen.id ? { ...q, rot: (q.rot + 1) % 4 } : q)))}>Rotate</button>
                      <button className="btn btn-sm" onClick={() => { setRoomPieces(pieceRoom.id, piecesOf(plan, pieceRoom).filter((q) => q.id !== chosen.id)); setPiece(null); }}>Remove</button>
                    </div>
                  ) : null}
                  {room ? (
                    <div className="furn-row">
                      <span className="furn-title">{room.name}<small>{plan.furniture?.[room.id] ? "your own arrangement" : "furnished automatically"} · {roomPieces.length} {roomPieces.length === 1 ? "piece" : "pieces"}</small></span>
                      <button className="btn btn-sm btn-primary" aria-expanded={adding} onClick={() => setAdding(!adding)}>+ Add furniture</button>
                      <button className="btn btn-sm" disabled={!roomPieces.length} onClick={() => { setRoomPieces(room.id, []); setPiece(null); }}>Clear room</button>
                      <button className="btn btn-sm" disabled={!plan.furniture?.[room.id]} onClick={autoRoom}>Furnish automatically</button>
                    </div>
                  ) : !chosen ? <div className="furn-hint">Click a room to add or clear furniture, or click a piece to move, rotate or remove it.</div> : null}
                  {room && adding ? (
                    <div className="furn-cat rise">
                      {catalogueFor(kindOf(room.name, room.areaM2)).map((c) => <button key={c.type} className={c.fits ? "fits" : ""} onClick={() => addPiece(c.type)}>{c.label}</button>)}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="col-span-12 xl:col-span-4">
              <input className="input font-medium" value={plan.name} onChange={(e) => patch((f) => ({ ...f, name: e.target.value }))} aria-label="Floor plan name" />
              <div className="text-[12px] text-muted mt-2">{SCALE[plan.scaleSource]}</div>
              <div className="flex items-center justify-between mt-5 mb-2">
                <h2 className="font-semibold">Rooms <span className="text-muted font-normal tnum">{confirmed}/{plan.rooms.length}</span></h2>
                <button className="btn btn-sm" onClick={() => setRooms(plan.rooms.map((r) => ({ ...r, confirmed: confirmed !== plan.rooms.length })))} disabled={!plan.rooms.length}>{confirmed === plan.rooms.length && plan.rooms.length ? "Unconfirm all" : "Confirm all"}</button>
              </div>
              <div className="grid gap-3">
                {groupsOf(plan).map((g, gi) => {
                  const rs = plan.rooms.filter((r) => groupOf(plan, r.group) === gi);
                  if (!rs.length) return null;
                  const slot = slotsOf(plan).findIndex((x) => x.i === gi);
                  const b0 = plan.building || buildingsOf(p)[0];
                  const refs = b0 && slot >= 0 ? (plan.floors ?? floorsOf(p, b0)).map((f) => unitsOnFloor(p, b0, f)[slot]?.ref).filter(Boolean) : [];
                  return (
                    <div className="panel" key={gi}>
                      <div className="p-2 pl-3 border-b border-line flex items-center gap-2">
                        <span className="dot" style={{ background: groupColor(gi, g.common), marginRight: 0 }} />
                        <input className="input !h-7 text-[13px] font-medium flex-1 min-w-0 !border-transparent hover:!border-line-strong" value={g.name} onChange={(e) => patch((f) => ({ ...f, groups: groupsOf(f).map((x, k) => (k === gi ? { ...x, name: e.target.value } : x)) }))} aria-label="Apartment name" />
                        <span className="text-[12px] text-muted tnum whitespace-nowrap">{rs.reduce((t, r) => t + r.areaM2, 0).toFixed(1)} m²</span>
                      </div>
                      {!g.common && refs.length ? <div className="px-3 py-1.5 text-[11px] text-muted border-b border-line tnum">Units: {refs.slice(0, 6).join(" · ")}{refs.length > 6 ? " …" : ""}</div> : null}
                      {rs.map((r) => (
                        <div key={r.id} onMouseEnter={() => setSel(r.id)} className={`p-2 border-b border-line last:border-0 flex gap-2 items-center transition-colors ${sel === r.id ? "bg-sunken" : ""}`}>
                          <input type="checkbox" checked={r.confirmed} onChange={(e) => patchRoom(r.id, { confirmed: e.target.checked })} className="accent-[var(--accent)] w-4 h-4" aria-label={`Confirm ${r.name}`} title="Confirm (will be published)" />
                          <input className="input !h-8 text-[13px] flex-1 min-w-0" value={r.name} onChange={(e) => patchRoom(r.id, { name: e.target.value })} aria-label="Room name" />
                          <input className="input !h-8 text-[13px] tnum text-right" style={{ width: 62 }} type="number" step="0.1" value={r.areaM2} onChange={(e) => patchRoom(r.id, { areaM2: parseFloat(e.target.value) || 0 })} aria-label="Area in m²" />
                          {groupsOf(plan).length > 1 ? (
                            <select className="select !h-8 !w-[72px] text-[12px] !px-1" value={gi} title="Move to another apartment" aria-label="Apartment" onChange={(e) => patch((f) => ({ ...f, rooms: f.rooms.map((x) => (x.id === r.id ? { ...x, group: Number(e.target.value) } : x)), groups: groupsOf(f).map((x) => ({ ...x, outline: undefined })) }))}>
                              {groupsOf(plan).map((x, k) => <option key={k} value={k}>{x.name}</option>)}
                            </select>
                          ) : null}
                          <button className="btn btn-sm btn-ghost !px-2" onClick={() => setRooms(plan.rooms.filter((x) => x.id !== r.id))} aria-label={`Delete ${r.name}`}>×</button>
                        </div>
                      ))}
                    </div>
                  );
                })}
                {plan.rooms.length === 0 ? <div className="panel p-4 text-muted text-[13px]">No rooms detected.</div> : (
                  <div className="flex justify-between text-[13px] font-medium tnum px-1"><span>Total · {slotsOf(plan).length} {plan.levels ? (slotsOf(plan).length === 1 ? "level" : "levels") : slotsOf(plan).length === 1 ? "apartment" : "apartments"}</span><span>{total.toFixed(1)} m²</span></div>
                )}
              </div>
              <div className="mt-5" hidden={!hasUnits}>
                <span className="label">Applies to</span>
                <div className="flex gap-2 flex-wrap items-center">
                  <select className="select !h-8 !w-auto text-[13px]" value={plan.building ?? ""} onChange={(e) => patch((f) => ({ ...f, building: e.target.value || undefined }))} aria-label="Building">
                    <option value="">All buildings</option>
                    {buildingsOf(p).map((b) => <option key={b} value={b}>Building {b}</option>)}
                  </select>
                  {floorsOf(p, plan.building || undefined).map((fl) => {
                    const on = !plan.floors || plan.floors.includes(fl);
                    return (
                      <button key={fl} aria-pressed={on} title={on ? "Plan applies to this floor" : "Not on this floor"} onClick={() => patch((f) => { const all = floorsOf(p, f.building || undefined); const cur = f.floors ?? all; const next = on ? cur.filter((x) => x !== fl) : [...cur, fl].sort((a, c) => a - c); return { ...f, floors: next.length === all.length ? undefined : next }; })} className={`h-8 px-2.5 text-[12px] border tnum transition-colors ${on ? "bg-ink text-white border-ink" : "bg-surface border-line-strong text-muted"}`} style={{ borderRadius: 4 }}>
                        {fl === 0 ? "GF" : fl}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="text-[12px] text-muted mt-3">Only confirmed rooms appear on the website (block “Floor plan 2D / 3D”).</p>
              <button className="text-[13px] text-err underline mt-4" onClick={() => removePlan(plan)}>Delete floor plan</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
