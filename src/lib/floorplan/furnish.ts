import type { FloorPlan, Room } from "../types";

/**
 * Rule-based furnishing: works out what each room is (from its name, otherwise from its size)
 * and places typical furniture along the walls, keeping doors clear.
 * Everything is in metres; one catalogue of simple parts feeds both the 2D symbols and the 3D boxes.
 */
export type RoomKind = "living" | "kitchen" | "bedroom" | "bath" | "wc" | "hall" | "office" | "none";

export interface Part {
  shape: "box" | "round";
  x: number; z: number; w: number; d: number; // footprint in metres (axis-aligned, plan coordinates)
  y0: number; h: number; // 3D: base height and height
  color: string;
  flat?: boolean; // 2D: draw lightly (rugs), 3D: no shadow
  glass?: boolean;
  line?: boolean; // 2D only: keep the outline even though it is covered in 3D
  /** id of the piece of furniture this part belongs to */
  piece?: string;
}
/** one piece of furniture: a catalogue type placed in a room. x/z = centre in metres (plan coordinates), rot = quarter turns */
export interface Piece { id: string; type: string; s?: number; x: number; z: number; rot: number }
export interface PlacedPiece extends Piece { roomId: string; parts: Part[]; w: number; d: number }
export interface Furnished { kinds: Record<string, RoomKind>; parts: Part[]; pieces: PlacedPiece[] }

const WOOD = "#c8b596", FABRIC = "#b7b1a6", WHITE = "#f5f3ef", DARK = "#3a3835", SOFT = "#ddd6ca", STEEL = "#b9bdbf", GREEN = "#6f8f6a";

export function kindOf(name: string, area: number): RoomKind {
  const n = name.toLowerCase();
  if (/balkon|terrass|loggia|garten|garden|sitzplatz|patio|keller|cellar|reduit|abstell|storage|technik|treppenhaus|stairwell|lift/.test(n)) return "none";
  if (/bad|dusche|du\s*\/|bath|shower|douche|bagno|nasszelle/.test(n)) return "bath";
  if (/\bwc\b|toilet/.test(n)) return "wc";
  if (/k(ü|ue)che|kitchen|cuisine|cucina/.test(n) && !/wohn|living/.test(n)) return "kitchen";
  if (/wohn|living|s(é|e)jour|soggiorno|salon|essen|dining/.test(n)) return "living";
  if (/schlaf|zimmer|bedroom|chambre|camera|kind|eltern|master/.test(n)) return "bedroom";
  if (/b(ü|ue)ro|office|arbeit|studio/.test(n)) return "office";
  if (/entr|korridor|gang|flur|hall|diele|vorraum|garderobe|treppe|stair/.test(n)) return "hall";
  // no usable name: go by size
  if (area < 2.6) return "wc";
  if (area < 7.5) return "bath";
  if (area >= 18) return "living";
  return "bedroom";
}

/** friendly names for rooms the PDF did not label (many sales sheets have their text converted to outlines) */
export function guessNames(plan: FloorPlan): FloorPlan {
  const unnamed = plan.rooms.filter((r) => /^Room \d+$/.test(r.name));
  if (!unnamed.length) return plan;
  const firstGroup = Math.min(...plan.rooms.map((r) => r.group ?? 0));
  const pool = plan.levels ? unnamed.filter((r) => (r.group ?? 0) === firstGroup) : unnamed;
  const living = [...(pool.length ? pool : unnamed)].sort((a, b) => b.areaM2 - a.areaM2)[0];
  // the level with the living room normally has the kitchen, not a bathroom: the first mid-sized side room there is the kitchen
  const kitchen = living ? unnamed.filter((r) => r !== living && (r.group ?? 0) === (living.group ?? 0) && r.areaM2 >= 3.5 && r.areaM2 < 12).sort((x, y) => y.areaM2 - x.areaM2)[0] : undefined;
  let bed = 0;
  const names = new Map<string, string>();
  for (const r of [...unnamed].sort((a, b) => (a.group ?? 0) - (b.group ?? 0) || b.areaM2 - a.areaM2)) {
    const xs = r.polygon.map((p) => p[0]), ys = r.polygon.map((p) => p[1]);
    const w = (Math.max(...xs) - Math.min(...xs)) * plan.metersPerUnit, h = (Math.max(...ys) - Math.min(...ys)) * plan.metersPerUnit * (plan.height / plan.width);
    const slim = Math.max(w, h) / Math.max(0.1, Math.min(w, h)) > 2.2;
    let name: string;
    if (r === kitchen) name = "Kitchen";
    else if (r.areaM2 < 2.6) name = "WC";
    else if (r.areaM2 < 7.5 && !slim) name = "Bathroom";
    else if (r === living && r.areaM2 >= 15) name = r.areaM2 >= 28 && !kitchen ? "Living / Kitchen" : "Living / Dining";
    else if (slim && r.areaM2 < 10) name = "Hall";
    else name = `Bedroom ${++bed}`;
    names.set(r.id, name);
  }
  return { ...plan, rooms: plan.rooms.map((r) => (names.has(r.id) ? { ...r, name: names.get(r.id)! } : r)) };
}

type Rect = { x: number; z: number; w: number; d: number };
const hit = (a: Rect, b: Rect, m = 0) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.z < b.z + b.d + m && a.z + a.d + m > b.z;

function inside(poly: [number, number][], x: number, z: number) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** local (back wall at z = 0, width along x) → plan rectangle for one of the four orientations */
function local(item: Rect, rot: number, lw: number, ld: number, lx: number, lz: number, sw: number, sd: number): Rect {
  if (rot === 0) return { x: item.x + lx, z: item.z + lz, w: sw, d: sd };
  if (rot === 2) return { x: item.x + lw - lx - sw, z: item.z + ld - lz - sd, w: sw, d: sd };
  if (rot === 1) return { x: item.x + ld - lz - sd, z: item.z + lx, w: sd, d: sw }; // back on the right
  return { x: item.x + lz, z: item.z + lw - lx - sw, w: sd, d: sw }; // back on the left
}

// ── catalogue: every piece is described once, back to the wall at z = 0 ──
type L = [Part["shape"], number, number, number, number, number, number, string, Partial<Part>?];
export interface PieceDef { label: string; kinds: RoomKind[]; s?: number; size: (s: number) => [number, number]; build: (s: number) => L[] }
const bedParts = (w: number): L[] => {
  const pw = w > 1.2 ? (w - 0.4) / 2 : w - 0.3;
  return [
    ["box", 0, 0, w, 0.08, 0, 0.95, WOOD],
    ["box", 0, 0.05, w, 2.0, 0.08, 0.24, WOOD],
    ["box", 0.03, 0.08, w - 0.06, 1.94, 0.32, 0.2, WHITE],
    ["box", 0.14, 0.16, pw, 0.42, 0.5, 0.1, WHITE, { line: true }],
    ...(w > 1.2 ? ([["box", 0.26 + pw, 0.16, pw, 0.42, 0.5, 0.1, WHITE, { line: true }]] as L[]) : []),
    ["box", 0.03, 0.72, w - 0.06, 1.3, 0.5, 0.05, SOFT, { line: true }],
  ];
};
const diningParts = (n: number): L[] => {
  const tw = n >= 6 ? 1.9 : 1.3;
  const list: L[] = [["box", 0, 0.5, tw, 0.9, 0.72, 0.05, WOOD], ["box", 0.06, 0.56, 0.06, 0.06, 0, 0.72, WOOD], ["box", tw - 0.12, 0.56, 0.06, 0.06, 0, 0.72, WOOD], ["box", 0.06, 1.28, 0.06, 0.06, 0, 0.72, WOOD], ["box", tw - 0.12, 1.28, 0.06, 0.06, 0, 0.72, WOOD]];
  const half = n >= 6 ? 3 : 2;
  for (let k = 0; k < half; k++) {
    const cx = (tw / half) * (k + 0.5) - 0.21;
    list.push(["box", cx, 0.08, 0.42, 0.42, 0.42, 0.06, FABRIC], ["box", cx, 0.05, 0.42, 0.05, 0.42, 0.45, FABRIC], ["box", cx, 1.4, 0.42, 0.42, 0.42, 0.06, FABRIC], ["box", cx, 1.8, 0.42, 0.05, 0.42, 0.45, FABRIC]);
  }
  return list;
};
export const CATALOGUE: Record<string, PieceDef> = {
  bed: { label: "Double bed", kinds: ["bedroom"], s: 1.6, size: (s) => [s, 2.05], build: bedParts },
  "bed-single": { label: "Single bed", kinds: ["bedroom", "office"], s: 0.9, size: (s) => [s, 2.05], build: bedParts },
  wardrobe: { label: "Wardrobe", kinds: ["bedroom", "hall"], s: 1.6, size: (s) => [s, 0.6], build: (s) => [["box", 0, 0, s, 0.6, 0, 2.1, WOOD]] },
  desk: { label: "Desk and chair", kinds: ["bedroom", "office", "living"], size: () => [1.3, 1.15], build: () => [["box", 0, 0, 1.3, 0.62, 0.72, 0.04, WOOD], ["box", 0, 0, 0.05, 0.62, 0, 0.72, WOOD], ["box", 1.25, 0, 0.05, 0.62, 0, 0.72, WOOD], ["box", 0.43, 0.7, 0.44, 0.44, 0.4, 0.07, FABRIC], ["box", 0.43, 1.1, 0.44, 0.05, 0.4, 0.45, FABRIC]] },
  sofa: {
    label: "Sofa with table", kinds: ["living"], size: () => [2.3, 0.95],
    build: () => [
      ["box", 0, 0, 2.3, 0.95, 0, 0.4, FABRIC], ["box", 0, 0, 2.3, 0.22, 0.4, 0.42, FABRIC, { line: true }], ["box", 0, 0.22, 0.2, 0.73, 0.4, 0.22, FABRIC, { line: true }], ["box", 2.1, 0.22, 0.2, 0.73, 0.4, 0.22, FABRIC, { line: true }],
      ["box", 0.05, 0.75, 2.2, 1.5, 0, 0.012, SOFT, { flat: true }], ["box", 0.6, 1.35, 1.1, 0.55, 0.3, 0.05, WOOD, { line: true }], ["box", 0.7, 1.42, 0.9, 0.41, 0, 0.3, WOOD],
    ],
  },
  armchair: { label: "Armchair", kinds: ["living", "bedroom", "office"], size: () => [0.85, 0.85], build: () => [["box", 0, 0, 0.85, 0.85, 0, 0.38, FABRIC], ["box", 0, 0, 0.85, 0.2, 0.38, 0.4, FABRIC, { line: true }], ["box", 0, 0.2, 0.16, 0.65, 0.38, 0.2, FABRIC, { line: true }], ["box", 0.69, 0.2, 0.16, 0.65, 0.38, 0.2, FABRIC, { line: true }]] },
  tv: { label: "TV unit", kinds: ["living", "bedroom"], size: () => [1.6, 0.4], build: () => [["box", 0, 0, 1.6, 0.4, 0, 0.45, WOOD], ["box", 0.25, 0.04, 1.1, 0.05, 0.5, 0.62, DARK, { line: true }]] },
  dining: { label: "Dining table", kinds: ["living", "kitchen"], s: 4, size: (s) => [s >= 6 ? 1.9 : 1.3, 1.9], build: diningParts },
  plant: { label: "Plant", kinds: ["living", "bedroom", "office", "hall", "bath"], size: () => [0.45, 0.45], build: () => [["round", 0.08, 0.08, 0.3, 0.3, 0, 0.35, WOOD], ["round", 0, 0, 0.45, 0.45, 0.35, 0.7, GREEN, { line: true }]] },
  shelf: { label: "Shelf", kinds: ["living", "office", "bedroom", "hall"], size: () => [1.2, 0.35], build: () => [["box", 0, 0, 1.2, 0.35, 0, 1.8, WOOD]] },
  bench: { label: "Sideboard", kinds: ["hall", "living", "bedroom"], s: 1.2, size: (s) => [s, 0.38], build: (s) => [["box", 0, 0, s, 0.38, 0, 0.45, WOOD]] },
  counter: {
    label: "Kitchen counter", kinds: ["kitchen", "living"], s: 2.4, size: (s) => [s, 0.62],
    build: (len) => [
      ["box", 0, 0, len, 0.6, 0, 0.88, WHITE],
      ["box", 0, 0, len, 0.62, 0.88, 0.04, DARK, { line: true }],
      ["box", len * 0.12, 0.12, 0.5, 0.38, 0.92, 0.01, STEEL, { line: true }],
      ["box", len - 0.72, 0.1, 0.56, 0.44, 0.92, 0.01, DARK, { line: true }],
      ["round", len - 0.67, 0.14, 0.2, 0.2, 0.93, 0.01, STEEL, { line: true }],
      ["round", len - 0.41, 0.3, 0.2, 0.2, 0.93, 0.01, STEEL, { line: true }],
    ],
  },
  fridge: { label: "Fridge", kinds: ["kitchen", "living"], size: () => [0.62, 0.64], build: () => [["box", 0, 0, 0.62, 0.64, 0, 1.95, STEEL]] },
  tub: { label: "Bathtub", kinds: ["bath"], size: () => [1.7, 0.76], build: () => [["box", 0, 0, 1.7, 0.76, 0, 0.56, WHITE], ["box", 0.08, 0.08, 1.54, 0.6, 0.5, 0.07, STEEL, { line: true }]] },
  shower: { label: "Shower", kinds: ["bath"], size: () => [0.9, 0.9], build: () => [["box", 0, 0, 0.9, 0.9, 0, 0.05, WHITE], ["box", 0, 0.87, 0.9, 0.03, 0.05, 1.95, STEEL, { glass: true }], ["round", 0.37, 0.37, 0.16, 0.16, 0.05, 0.01, STEEL, { line: true }]] },
  toilet: { label: "Toilet", kinds: ["bath", "wc"], size: () => [0.42, 0.68], build: () => [["box", 0.02, 0, 0.38, 0.18, 0, 0.82, WHITE], ["round", 0.03, 0.16, 0.36, 0.5, 0, 0.42, WHITE]] },
  basin: { label: "Washbasin", kinds: ["bath", "wc"], s: 0.65, size: (s) => [s, 0.46], build: (w) => [["box", 0, 0, w, 0.46, 0, 0.85, WHITE], ["round", w * 0.2, 0.08, w * 0.6, 0.3, 0.85, 0.02, STEEL, { line: true }]] },
};
/** what the "Add furniture" list offers for a room: its own kind first, then everything else */
export function catalogueFor(kind: RoomKind): { type: string; label: string; fits: boolean }[] {
  return Object.entries(CATALOGUE).map(([type, d]) => ({ type, label: d.label, fits: d.kinds.includes(kind) })).sort((a, b) => Number(b.fits) - Number(a.fits));
}
/** width, depth (before turning) and size parameter of a piece */
export const sizeOf = (p: Pick<Piece, "type" | "s">): [number, number, number] => { const d = CATALOGUE[p.type]; const s = p.s ?? d?.s ?? 0; const [w, dd] = d ? d.size(s) : [0.6, 0.6]; return [w, dd, s]; };
/** footprint of a placed piece on the plan */
export function pieceRect(p: Piece): Rect {
  const [w, d] = sizeOf(p);
  const W = p.rot % 2 ? d : w, D = p.rot % 2 ? w : d;
  return { x: p.x - W / 2, z: p.z - D / 2, w: W, d: D };
}
function place(p: Piece, roomId: string): PlacedPiece {
  const def = CATALOGUE[p.type];
  const [w, d, s] = sizeOf(p);
  const item = pieceRect(p);
  const parts: Part[] = (def ? def.build(s) : []).map(([shape, lx, lz, sw, sd, y0, h, color, extra]) => {
    const q = local(item, p.rot, w, d, lx, lz, sw, sd);
    return { shape, x: q.x, z: q.z, w: q.w, d: q.d, y0, h, color, ...(extra ?? {}), piece: p.id };
  });
  return { ...p, roomId, parts, w: item.w, d: item.d };
}
const roomPoly = (plan: FloorPlan, room: Room) => { const mx = plan.metersPerUnit, mz = plan.metersPerUnit * (plan.height / plan.width); return room.polygon.map(([x, y]) => [x * mx, y * mz] as [number, number]); };

/** the automatic furnishing of one room: typical pieces along the walls, doors kept clear */
export function autoPieces(plan: FloorPlan, room: Room): Piece[] {
  const mx = plan.metersPerUnit, mz = plan.metersPerUnit * (plan.height / plan.width);
  const doors: Rect[] = plan.walls.filter((w) => w[4] === 2).map(([x, y, w, h]) => ({ x: x * mx - 0.75, z: y * mz - 0.75, w: w * mx + 1.5, d: h * mz + 1.5 }));
  const windows: Rect[] = plan.walls.filter((w) => w[4] === 3).map(([x, y, w, h]) => ({ x: x * mx - 0.1, z: y * mz - 0.1, w: w * mx + 0.2, d: h * mz + 0.2 }));
  const out: Piece[] = [];
  const kind = kindOf(room.name, room.areaM2);
  if (kind === "none") return out;
  const poly = roomPoly(plan, room);
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
  const bx0 = Math.min(...xs), bx1 = Math.max(...xs), bz0 = Math.min(...zs), bz1 = Math.max(...zs);
  const bw = bx1 - bx0, bd = bz1 - bz0;
  if (bw < 0.7 || bd < 0.7) return out;
  const taken: Rect[] = [];
  const fits = (r: Rect, clearDoors = true, clear = 0.04) => {
    const e = 0.03;
    for (const [px, pz] of [[r.x + e, r.z + e], [r.x + r.w - e, r.z + e], [r.x + e, r.z + r.d - e], [r.x + r.w - e, r.z + r.d - e], [r.x + r.w / 2, r.z + r.d / 2], [r.x + r.w / 2, r.z + e], [r.x + r.w / 2, r.z + r.d - e], [r.x + e, r.z + r.d / 2], [r.x + r.w - e, r.z + r.d / 2]])
      if (!inside(poly, px, pz)) return false;
    if (taken.some((t) => hit(r, t, clear))) return false;
    if (clearDoors && doors.some((dr) => hit(r, dr))) return false;
    return true;
  };
  type Spot = { r: Rect; rot: number };
  /** a spot with the back to a wall; sides are tried in the given order, sliding along each wall */
  const wall = (w: number, d: number, opts: { sides?: number[]; avoidWindows?: boolean; reserve?: number; from?: "start" | "center" } = {}): Spot | null => {
    const order = opts.sides ?? (bw >= bd ? [0, 2, 3, 1] : [3, 1, 0, 2]);
    for (const rot of order) {
      const along = rot % 2 === 0 ? bw : bd;
      if (w > along + 0.01) continue;
      const steps: number[] = [];
      for (let s = 0; s <= along - w + 0.001; s += 0.1) steps.push(s);
      if (opts.from !== "start") steps.sort((a, b) => Math.abs(a - (along - w) / 2) - Math.abs(b - (along - w) / 2));
      // the wall face may be set in from the bounding box (L-shaped rooms), so also step inwards
      for (let inset = 0; inset <= 1.2; inset += 0.15)
        for (const s of steps) {
          const r: Rect = rot === 0 ? { x: bx0 + s, z: bz0 + inset, w, d } : rot === 2 ? { x: bx0 + s, z: bz1 - inset - d, w, d } : rot === 3 ? { x: bx0 + inset, z: bz0 + s, w: d, d: w } : { x: bx1 - inset - d, z: bz0 + s, w: d, d: w };
          if (inset > 0) {
            // only accept an inset position if it really touches a wall there
            const probe = rot === 0 ? [r.x + r.w / 2, r.z - 0.12] : rot === 2 ? [r.x + r.w / 2, r.z + r.d + 0.12] : rot === 3 ? [r.x - 0.12, r.z + r.d / 2] : [r.x + r.w + 0.12, r.z + r.d / 2];
            if (inside(poly, probe[0], probe[1])) continue;
          }
          if (!fits(r)) continue;
          if (opts.avoidWindows && windows.some((wn) => hit(r, wn))) continue;
          taken.push(opts.reserve ? { x: r.x - (rot % 2 ? (rot === 3 ? 0 : opts.reserve) : 0), z: r.z - (rot % 2 ? 0 : rot === 0 ? 0 : opts.reserve), w: r.w + (rot % 2 ? opts.reserve : 0), d: r.d + (rot % 2 ? 0 : opts.reserve) } : r);
          return { r, rot };
        }
    }
    return null;
  };
  /** free-standing: the valid spot furthest from everything else */
  const free = (w: number, d: number): Spot | null => {
    let best: (Spot & { score: number }) | null = null;
    for (const rot of bw >= bd ? [0, 3] : [3, 0])
      for (let x = bx0 + 0.5; x <= bx1 - 0.5; x += 0.2)
        for (let z = bz0 + 0.5; z <= bz1 - 0.5; z += 0.2) {
          const r: Rect = rot === 0 ? { x, z, w, d } : { x, z, w: d, d: w };
          if (!fits(r, true, 0.45)) continue;
          const cx = r.x + r.w / 2, cz = r.z + r.d / 2;
          const score = Math.min(...taken.map((t) => Math.hypot(cx - (t.x + t.w / 2), cz - (t.z + t.d / 2))), 9) + (rot === (bw >= bd ? 0 : 3) ? 0.2 : 0);
          if (!best || score > best.score) best = { r, rot, score };
        }
    if (best) taken.push(best.r);
    return best;
  };
  const put = (type: string, it: Spot | null, s?: number) => {
    if (it) out.push({ id: `${room.id}-a${out.length}`, type, s, x: it.r.x + it.r.w / 2, z: it.r.z + it.r.d / 2, rot: it.rot });
    return it;
  };
  const counter = (len: number) => { if (put("counter", wall(len, 0.62, { from: "start" }), len)) put("fridge", wall(0.62, 0.64)); };

  if (kind === "bedroom") {
    const w = room.areaM2 >= 10.5 ? 1.6 : 0.9;
    if (!put(w > 1 ? "bed" : "bed-single", wall(w, 2.05, { avoidWindows: true, reserve: 0.5 }), w)) put("bed-single", wall(0.9, 2.05, { avoidWindows: true, reserve: 0.5 }), 0.9);
    const ww = Math.min(2.0, Math.max(1.0, Math.min(bw, bd) - 1.2));
    put("wardrobe", wall(ww, 0.6, { avoidWindows: true }), ww);
    if (room.areaM2 >= 12) put("desk", wall(1.3, 1.15, {}));
  } else if (kind === "living") {
    if (/k(ü|ue)che|kitchen|cuisine|cucina/i.test(room.name)) counter(Math.min(3.0, Math.max(1.8, Math.max(bw, bd) * 0.4)));
    const sofa = put("sofa", wall(2.3, 0.95, { avoidWindows: false, reserve: 1.3 }));
    if (sofa) {
      const opp = [2, 3, 0, 1][sofa.rot];
      put("tv", wall(1.6, 0.4, { sides: [opp, (opp + 1) % 4, (opp + 3) % 4] }));
    }
    if (room.areaM2 >= 17) { const n = room.areaM2 >= 24 ? 6 : 4; put("dining", free(n === 6 ? 1.9 : 1.3, 1.9), n); }
    put("plant", wall(0.45, 0.45, { from: "start" }));
  } else if (kind === "kitchen") {
    counter(Math.min(3.2, Math.max(1.6, Math.max(bw, bd) - 0.9)));
  } else if (kind === "bath") {
    if (room.areaM2 >= 4.6) put("tub", wall(1.7, 0.76, { from: "start" }));
    else put("shower", wall(0.9, 0.9, { from: "start" }));
    put("toilet", wall(0.42, 0.68, { from: "start" }));
    put("basin", wall(0.65, 0.46, { from: "start" }), 0.65);
  } else if (kind === "wc") {
    put("toilet", wall(0.42, 0.68, { from: "start" }));
    put("basin", wall(0.42, 0.46, { from: "start" }), 0.42);
  } else if (kind === "hall") {
    const w = Math.min(1.4, Math.max(0.8, Math.max(bw, bd) * 0.35));
    put("bench", wall(w, 0.38), w);
  } else if (kind === "office") {
    put("desk", wall(1.3, 1.15, {}));
    put("shelf", wall(1.2, 0.35, { avoidWindows: true }));
  }
  return out;
}

/** the pieces of a room: the owner's own arrangement if there is one, otherwise the automatic one */
export const piecesOf = (plan: FloorPlan, room: Room): Piece[] => plan.furniture?.[room.id] ?? autoPieces(plan, room);

/** a sensible free spot for a new piece in a room (the owner then drags it where it belongs) */
export function newPiece(plan: FloorPlan, room: Room, type: string, existing: Piece[]): Piece {
  const poly = roomPoly(plan, room);
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const id = `${room.id}-m${Date.now().toString(36)}${Math.floor(Math.random() * 99)}`;
  const taken = existing.map(pieceRect);
  let best: Piece | null = null, score = -1;
  for (const rot of [0, 1])
    for (let x = x0 + 0.3; x <= x1 - 0.3; x += 0.2)
      for (let z = z0 + 0.3; z <= z1 - 0.3; z += 0.2) {
        const p: Piece = { id, type, x, z, rot };
        const r = pieceRect(p);
        if (![[r.x, r.z], [r.x + r.w, r.z], [r.x, r.z + r.d], [r.x + r.w, r.z + r.d]].every(([px, pz]) => inside(poly, px, pz))) continue;
        if (taken.some((t) => hit(r, t, 0.05))) continue;
        const sc = Math.min(...taken.map((t) => Math.hypot(x - (t.x + t.w / 2), z - (t.z + t.d / 2))), 6) + (rot === 0 ? 0.1 : 0);
        if (sc > score) { score = sc; best = p; }
      }
  return best ?? { id, type, x: (x0 + x1) / 2, z: (z0 + z1) / 2, rot: 0 };
}
/** keeps a moved piece inside its room: the centre may not leave the room's outline */
export function clampToRoom(plan: FloorPlan, room: Room, p: Piece, prev: Piece): Piece {
  return inside(roomPoly(plan, room), p.x, p.z) ? p : prev;
}

/**
 * Furniture for the given rooms. Automatic by default; a room the owner has arranged (plan.furniture[roomId]) keeps exactly their pieces.
 */
export function furnish(plan: FloorPlan, rooms: Room[] = plan.rooms): Furnished {
  const kinds: Record<string, RoomKind> = {};
  const pieces: PlacedPiece[] = [];
  for (const room of rooms) {
    kinds[room.id] = kindOf(room.name, room.areaM2);
    for (const p of piecesOf(plan, room)) pieces.push(place(p, room.id));
  }
  return { kinds, parts: pieces.flatMap((p) => p.parts), pieces };
}
