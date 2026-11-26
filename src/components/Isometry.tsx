"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { isoMarkup, type Isometry } from "@/lib/isometry";
import { STATUS_COLOR, STATUS_LABEL, type Unit } from "@/lib/types";

interface ViewProps {
  iso: Isometry;
  units: Unit[];
  accent?: string;
  active?: Set<string>;
  hover?: string | null;
  selected?: string | null;
  onHover?: (unitId: string | null) => void;
  onSelect?: (unitId: string) => void;
}

/** the uploaded isometric drawing on the public site: every mapped shape is an apartment you can hover and click */
export function IsometryView({ iso, units, accent = "#1F5C4A", active, hover, selected, onHover, onSelect }: ViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const markup = isoMarkup(iso);
  const html = useMemo(() => ({ __html: markup }), [markup]);
  const byId = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  // geometry of every drawn element, measured once per drawing (before any transform is applied)
  const boxes = useRef<{ el: SVGGraphicsElement; x0: number; x1: number; y0: number; y1: number; shape?: string }[]>([]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    boxes.current = [...el.querySelectorAll<SVGGraphicsElement>("polygon, path, rect, line, polyline, circle, ellipse, text")]
      .filter((e) => !e.closest("defs, clipPath, mask, pattern, symbol"))
      .map((e) => { e.style.transform = ""; const b = e.getBBox(); return { el: e, x0: b.x, x1: b.x + b.width, y0: b.y, y1: b.y + b.height, shape: (e as unknown as SVGElement).dataset.shape }; });
  }, [markup]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const svg = el.querySelector("svg");
    const vb = svg?.viewBox?.baseVal;
    const lift = (vb && vb.height ? vb.height : 500) * 0.13;
    const focus = byId.get(hover ?? selected ?? "");
    // like on our tower sites: everything above the hovered apartment's floor rises and reveals that floor
    let bx0 = Infinity, bx1 = -Infinity, floorTop = Infinity;
    if (focus)
      for (const b of boxes.current) {
        const u = b.shape ? byId.get(iso.map[b.shape] ?? "") : undefined;
        if (!u || u.building !== focus.building) continue;
        bx0 = Math.min(bx0, b.x0); bx1 = Math.max(bx1, b.x1);
        if (u.floor === focus.floor) floorTop = Math.min(floorTop, b.y0);
      }
    for (const b of boxes.current) {
      const s = b.el as unknown as SVGElement;
      const unit = b.shape ? byId.get(iso.map[b.shape] ?? "") : undefined;
      let up = false;
      if (focus) {
        if (unit) up = unit.building === focus.building && unit.floor > focus.floor;
        // roof, window lines and other undrawn-as-unit parts follow the floors they sit on
        else up = (b.y0 + b.y1) / 2 < floorTop && (b.x0 + b.x1) / 2 >= bx0 && (b.x0 + b.x1) / 2 <= bx1 && b.y1 <= floorTop + (b.y1 - b.y0) * 0.5;
      }
      s.style.transition = "fill 160ms, transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1)";
      s.style.transform = up ? `translateY(${-lift}px)` : "";
      s.style.filter = "";
      if (!unit) { if (b.shape) { s.style.cursor = ""; s.style.pointerEvents = ""; } continue; }
      s.style.cursor = "pointer";
      s.style.pointerEvents = "all";
      s.style.fill =
        unit.id === selected ? accent
        : unit.id === hover ? `color-mix(in srgb, ${accent} 75%, white)`
        : active && !active.has(unit.id) ? "#eeebe5"
        : unit.status !== "available" ? "#d9d5ce"
        : `color-mix(in srgb, ${accent} 18%, white)`;
      s.style.fillOpacity = "1";
    }
  }, [iso, byId, accent, active, hover, selected]);

  const unitOf = (t: EventTarget | null) => {
    const s = (t as Element | null)?.closest?.("[data-shape]") as SVGElement | null;
    const id = s ? iso.map[s.dataset.shape ?? ""] : undefined;
    return id && byId.has(id) ? id : null;
  };
  return (
    <div
      ref={host}
      className="iso-view"
      dangerouslySetInnerHTML={html}
      onPointerOver={(e) => onHover?.(unitOf(e.target))}
      onPointerLeave={() => onHover?.(null)}
      onClick={(e) => { const id = unitOf(e.target); if (id) onSelect?.(id); }}
      role="img"
      aria-label="Building isometry"
    />
  );
}

/** back office: click a shape in the drawing, then pick the unit it stands for */
export function IsometryMapper({ iso, units, onChange, accent = "#1F5C4A" }: { iso: Isometry; units: Unit[]; onChange: (iso: Isometry) => void; accent?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [shape, setShape] = useState<string | null>(null);
  const markup = isoMarkup(iso);
  const html = useMemo(() => ({ __html: markup }), [markup]);
  const used = useMemo(() => new Map(Object.entries(iso.map).map(([s, u]) => [u, s])), [iso.map]);
  const mapped = Object.keys(iso.map).filter((s) => units.some((u) => u.id === iso.map[s])).length;

  useEffect(() => {
    host.current?.querySelectorAll<SVGElement>("[data-shape]").forEach((s) => {
      const id = s.dataset.shape ?? "";
      s.style.cursor = "pointer";
      s.style.pointerEvents = "all";
      s.style.transition = "fill 160ms";
      s.style.fill = id === shape ? accent : iso.map[id] ? `color-mix(in srgb, ${accent} 30%, white)` : "";
      s.style.fillOpacity = id === shape || iso.map[id] ? "1" : "";
    });
  }, [iso, shape, accent]);

  const assign = (unitId: string) => {
    if (!shape) return;
    const map = { ...iso.map };
    for (const k of Object.keys(map)) if (map[k] === unitId) delete map[k];
    if (unitId) map[shape] = unitId; else delete map[shape];
    onChange({ ...iso, map });
    // jump to the next shape that has no unit yet, so mapping a building is click, click, click
    const next = iso.shapes.find((s) => s !== shape && !map[s]);
    setShape(unitId && next ? next : shape);
  };
  const current = shape ? units.find((u) => u.id === iso.map[shape]) : undefined;

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 lg:col-span-8">
        <div className="panel p-4 iso-view" style={{ height: 520 }} ref={host} dangerouslySetInnerHTML={html}
          onClick={(e) => { const s = (e.target as Element).closest?.("[data-shape]") as SVGElement | null; setShape(s?.dataset.shape ?? null); }} />
        <p className="text-[12px] text-muted mt-2">Click a shape in the drawing, then choose the unit on the right. Shapes whose id equals a unit number are matched automatically.</p>
      </div>
      <div className="col-span-12 lg:col-span-4">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-semibold">Shapes <span className="text-muted font-normal tnum">{mapped}/{iso.shapes.length} linked</span></h2>
          {mapped ? <button className="btn btn-sm btn-ghost" onClick={() => onChange({ ...iso, map: {} })}>Unlink all</button> : null}
        </div>
        <div className="panel p-4">
          {!shape ? <div className="text-muted text-[13px]">No shape selected.</div> : (
            <>
              <div className="eyebrow">Selected shape</div>
              <div className="font-medium tnum mt-1 mb-3 break-all">{shape}</div>
              <span className="label">Unit</span>
              <select className="select" value={current?.id ?? ""} onChange={(e) => assign(e.target.value)} aria-label="Unit for the selected shape">
                <option value="">– not an apartment –</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.ref || "(no number)"} · {u.rooms ? `${u.rooms} rooms · ` : ""}{STATUS_LABEL[u.status]}{used.has(u.id) && used.get(u.id) !== shape ? " · linked" : ""}</option>)}
              </select>
            </>
          )}
        </div>
        <div className="panel mt-4" style={{ maxHeight: 300, overflow: "auto" }}>
          {units.length === 0 ? <div className="p-4 text-muted text-[13px]">Add units first, then link them here.</div> : units.map((u) => {
            const s = used.get(u.id);
            return (
              <button key={u.id} onClick={() => (shape && !s ? assign(u.id) : s ? setShape(s) : undefined)} className={`w-full text-left px-3 py-2 border-b border-line last:border-0 flex items-center gap-2 text-[13px] transition-colors hover:bg-bg ${s && s === shape ? "bg-sunken" : ""}`} title={s ? "Show its shape" : shape ? "Link to the selected shape" : "Select a shape first"}>
                <span className="dot" style={{ background: STATUS_COLOR[u.status], marginRight: 0 }} />
                <span className="font-medium tnum">{u.ref || "–"}</span>
                <span className="ml-auto text-[12px]" style={{ color: s ? "var(--ok)" : "var(--muted)" }}>{s ? "linked" : "not linked"}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
