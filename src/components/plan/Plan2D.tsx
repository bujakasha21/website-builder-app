"use client";
import { useMemo, useRef, useState } from "react";
import { clampToRoom, furnish, piecesOf, type Piece } from "@/lib/floorplan/furnish";
import type { FloorPlan, Pt, Room } from "@/lib/types";

interface Props {
  plan: FloorPlan;
  mode?: "view" | "edit";
  showImage?: boolean;
  onlyConfirmed?: boolean;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (rooms: Room[]) => void;
  tint?: string;
  colorFor?: (room: Room) => string;
  /** draw typical furniture per room type */
  furniture?: boolean;
  /** makes furniture selectable and draggable; receives the new arrangement per room */
  onFurniture?: (next: Record<string, Piece[]>) => void;
  piece?: string | null;
  onPiece?: (id: string | null) => void;
}

export function planBounds(plan: FloorPlan) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const [x, y, w, h] of plan.walls) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); }
  for (const r of plan.rooms) for (const [x, y] of r.polygon) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 <= x0) return { x0: 0, y0: 0, x1: 1, y1: 1 };
  return { x0, y0, x1, y1 };
}

const centroid = (p: Pt[]): Pt => {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-9) return p[0];
  return [cx / (3 * a), cy / (3 * a)];
};

export default function Plan2D({ plan, mode = "view", showImage = false, onlyConfirmed = false, selected, onSelect, onChange, tint = "var(--accent)", colorFor, furniture = true, onFurniture, piece, onPiece }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{ room: string; idx: number } | null>(null);
  const grab = useRef<{ id: string; from: Pt; moved: boolean } | null>(null);
  const [live, setLive] = useState<{ id: string; dx: number; dz: number } | null>(null);
  const W = plan.width, H = plan.height;
  const rooms = onlyConfirmed ? plan.rooms.filter((r) => r.confirmed) : plan.rooms;
  const vb = useMemo(() => {
    if (showImage) return [0, 0, W, H];
    const b = planBounds(plan);
    const pad = 0.03;
    return [(b.x0 - pad) * W, (b.y0 - pad) * H, (b.x1 - b.x0 + pad * 2) * W, (b.y1 - b.y0 + pad * 2) * H];
  }, [plan, showImage, W, H]);
  const unit = vb[2] / 700;
  const furn = useMemo(() => (furniture ? furnish(plan, rooms).pieces : []), [furniture, plan, rooms.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const editFurn = !!onFurniture && mode === "edit";
  const mz = plan.metersPerUnit * (H / W);
  const m2px = W / plan.metersPerUnit; // ≈1px at typical display size

  const toLocal = (e: React.PointerEvent | React.MouseEvent): Pt => {
    const pt = svg.current!.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return [p.x / W, p.y / H];
  };

  /** drop a dragged piece: the room switches to the owner's own arrangement */
  const dropPiece = () => {
    const g = grab.current;
    grab.current = null;
    if (!g || !live || !onFurniture) return setLive(null);
    const placed = furn.find((f) => f.id === g.id);
    const room = placed && plan.rooms.find((r) => r.id === placed.roomId);
    if (placed && room && g.moved) {
      const list = piecesOf(plan, room);
      const cur = list.find((q) => q.id === g.id);
      if (cur) onFurniture({ ...(plan.furniture ?? {}), [room.id]: list.map((q) => (q.id === g.id ? clampToRoom(plan, room, { ...q, x: q.x + live.dx, z: q.z + live.dz }, q) : q)) });
    }
    setLive(null);
  };
  const move = (e: React.PointerEvent) => {
    const g = grab.current;
    if (g) {
      const [x, y] = toLocal(e);
      const dx = (x - g.from[0]) * plan.metersPerUnit, dz = (y - g.from[1]) * mz;
      if (Math.hypot(dx, dz) > 0.03) g.moved = true;
      setLive({ id: g.id, dx, dz });
      return;
    }
    const d = drag.current;
    if (!d || !onChange) return;
    let [x, y] = toLocal(e);
    const room = plan.rooms.find((r) => r.id === d.room)!;
    const n = room.polygon.length;
    // snap to right angles with both neighbours
    const snap = (6 * unit) / W;
    for (const k of [(d.idx + n - 1) % n, (d.idx + 1) % n]) {
      if (Math.abs(room.polygon[k][0] - x) < snap) x = room.polygon[k][0];
      if (Math.abs(room.polygon[k][1] - y) < (snap * W) / H) y = room.polygon[k][1];
    }
    onChange(plan.rooms.map((r) => (r.id === d.room ? { ...r, polygon: r.polygon.map((p, i) => (i === d.idx ? ([x, y] as Pt) : p)) } : r)));
  };

  const addPoint = (e: React.MouseEvent, room: Room, i: number) => {
    if (!onChange) return;
    e.stopPropagation();
    const p = toLocal(e);
    const poly = [...room.polygon.slice(0, i + 1), p, ...room.polygon.slice(i + 1)];
    onChange(plan.rooms.map((r) => (r.id === room.id ? { ...r, polygon: poly } : r)));
  };
  const removePoint = (e: React.MouseEvent, room: Room, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onChange || room.polygon.length <= 3) return;
    onChange(plan.rooms.map((r) => (r.id === room.id ? { ...r, polygon: r.polygon.filter((_, k) => k !== i) } : r)));
  };

  const furnLayer = (
    <g transform={`scale(${m2px})`} style={editFurn ? undefined : { pointerEvents: "none" }} stroke="#2B2926" strokeWidth={0.022} strokeLinejoin="round">
      {furn.map((pc) => {
        const on = editFurn && piece === pc.id;
        const mv = live?.id === pc.id ? live : null;
        return (
          <g
            key={pc.id}
            transform={mv ? `translate(${mv.dx} ${mv.dz})` : undefined}
            style={editFurn ? { cursor: mv ? "grabbing" : "grab" } : undefined}
            stroke={on ? "var(--accent-strong, #4f7d12)" : undefined}
            strokeWidth={on ? 0.05 : undefined}
            onPointerDown={editFurn ? (e) => { e.stopPropagation(); (e.currentTarget as Element).setPointerCapture?.(e.pointerId); grab.current = { id: pc.id, from: toLocal(e), moved: false }; onPiece?.(pc.id); onSelect?.(pc.roomId); } : undefined}
            onClick={editFurn ? (e) => e.stopPropagation() : undefined}
          >
            {pc.parts.map((f, i) =>
              f.shape === "round" ? (
                <ellipse key={i} cx={f.x + f.w / 2} cy={f.z + f.d / 2} rx={f.w / 2} ry={f.d / 2} fill={f.flat ? "#f1eee8" : "#fff"} />
              ) : (
                <rect key={i} x={f.x} y={f.z} width={f.w} height={f.d} rx={f.flat ? 0 : 0.03} fill={f.flat ? "#f3f0ea" : f.glass ? "none" : "#fff"} strokeOpacity={f.flat ? 0.35 : 1} />
              )
            )}
          </g>
        );
      })}
    </g>
  );

  return (
    <svg
      ref={svg}
      viewBox={vb.join(" ")}
      className="plan2d"
      style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
      onPointerMove={move}
      onPointerUp={() => { drag.current = null; dropPiece(); }}
      onPointerLeave={() => { drag.current = null; dropPiece(); }}
      onClick={() => { onSelect?.(null); onPiece?.(null); }}
      role="img"
      aria-label={`Floor plan ${plan.name}`}
    >
      {showImage ? (
        <image href={plan.image} width={W} height={H} opacity={mode === "edit" ? 0.55 : 1} />
      ) : (
        <g>
          {plan.walls.map(([x, y, w, h, k], i) =>
            k === 1 ? (
              <rect key={i} x={x * W} y={y * H} width={w * W} height={h * H} fill="#2B2926" />
            ) : k === 3 ? (
              <rect key={i} x={x * W} y={y * H} width={w * W} height={h * H} fill="#fff" stroke="#2B2926" strokeWidth={unit * 0.8} />
            ) : null
          )}
        </g>
      )}
      {furn.length && !editFurn ? furnLayer : null}
      {rooms.map((r) => {
        const active = selected === r.id || hover === r.id;
        const c = centroid(r.polygon);
        const col = colorFor?.(r) ?? tint;
        const fs = Math.max(unit * 7.5, Math.min(unit * 13, vb[2] / 62));
        return (
          <g key={r.id}>
            <polygon
              points={r.polygon.map(([x, y]) => `${x * W},${y * H}`).join(" ")}
              fill={col}
              fillOpacity={active ? 0.32 : mode === "edit" ? (r.confirmed ? 0.16 : 0.06) : 0.1}
              stroke={col}
              strokeWidth={unit * (active ? 2 : 1)}
              strokeDasharray={mode === "edit" && !r.confirmed ? `${unit * 4} ${unit * 3}` : undefined}
              style={{ cursor: "pointer", transition: "fill-opacity 160ms" }}
              onPointerEnter={() => setHover(r.id)}
              onPointerLeave={() => setHover(null)}
              onClick={(e) => { e.stopPropagation(); onSelect?.(r.id); }}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect?.(r.id); }}
            />
            <text x={c[0] * W} y={c[1] * H} textAnchor="middle" fontSize={fs} fontWeight={500} fill="#1c1b19" style={{ pointerEvents: "none" }}>
              {r.name}
            </text>
            <text x={c[0] * W} y={c[1] * H + fs * 1.3} textAnchor="middle" fontSize={fs * 0.9} fill="#5c5852" style={{ pointerEvents: "none", fontVariantNumeric: "tabular-nums" }}>
              {r.areaM2.toFixed(1)} m²
            </text>
            {mode === "edit" && selected === r.id && (
              <g>
                {r.polygon.map((p, i) => {
                  const q = r.polygon[(i + 1) % r.polygon.length];
                  return (
                    <line key={"e" + i} x1={p[0] * W} y1={p[1] * H} x2={q[0] * W} y2={q[1] * H} stroke="transparent" strokeWidth={unit * 10} style={{ cursor: "copy" }} onDoubleClick={(e) => addPoint(e, r, i)}>
                      <title>Double-click: insert point</title>
                    </line>
                  );
                })}
                {r.polygon.map((p, i) => (
                  <circle
                    key={i}
                    cx={p[0] * W}
                    cy={p[1] * H}
                    r={unit * 5}
                    fill="#fff"
                    stroke={col}
                    strokeWidth={unit * 1.5}
                    style={{ cursor: "grab" }}
                    onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { room: r.id, idx: i }; }}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => removePoint(e, r, i)}
                  >
                    <title>Drag: move · Right-click: delete</title>
                  </circle>
                ))}
              </g>
            )}
          </g>
        );
      })}
      {furn.length && editFurn ? furnLayer : null}
    </svg>
  );
}
