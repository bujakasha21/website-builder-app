import type { FloorPlan, PlanDoor, Pt, Room } from "../types";
import type { PlanRead } from "./read-schema";

/**
 * Merges Claude's reading of a plan into what the wall detector found.
 * The detector is exact about where walls are; Claude knows what the rooms are called, how big the label says
 * they are, which way doors open and which fittings are drawn. Where both see the same room the detector's
 * outline is kept; rooms the detector missed or merged come from Claude.
 */

const polyArea = (p: Pt[]) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };
export const inPoly = (p: Pt[], x: number, y: number) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };

/** overlap of two outlines, sampled on a grid over both: intersection / union and intersection / area of a */
function overlap(a: Pt[], b: Pt[], n = 96) {
  const xs = [...a, ...b].map((q) => q[0]), ys = [...a, ...b].map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let both = 0, either = 0, inA = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = x0 + ((i + 0.5) / n) * (x1 - x0), y = y0 + ((j + 0.5) / n) * (y1 - y0);
    const pa = inPoly(a, x, y), pb = inPoly(b, x, y);
    if (pa && pb) both++;
    if (pa || pb) either++;
    if (pa) inA++;
  }
  return { iou: either ? both / either : 0, ofA: inA ? both / inA : 0 };
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const pt = (q: { x: number; y: number }): Pt => [clamp(q.x), clamp(q.y)];

/** German defaults for a kind, used when a plan prints no name */
const NAME: Record<string, string> = { living: "Wohnen", kitchen: "Küche", bedroom: "Zimmer", bath: "Bad", wc: "WC", hall: "Entrée", office: "Büro", balcony: "Balkon", storage: "Reduit", other: "Raum" };
/** catalogue piece for a drawn fitting; size-driven ones take the long side as their size */
const PIECE: Record<string, { type: string; sized: boolean }> = {
  shower: { type: "shower", sized: true }, tub: { type: "tub", sized: false }, toilet: { type: "toilet", sized: false }, basin: { type: "basin", sized: true },
  washer: { type: "washer", sized: false }, counter: { type: "counter", sized: true }, fridge: { type: "tall", sized: true }, wardrobe: { type: "wardrobe", sized: true },
};
const ROT = { top: 0, right: 1, bottom: 2, left: 3 } as const;

export function mergeRead(plan: FloorPlan, read: PlanRead): FloorPlan {
  const aspect = plan.height / plan.width;
  const claude = read.rooms
    .map((r) => ({ ...r, poly: r.polygon.map(pt) }))
    .filter((r) => r.poly.length >= 3 && polyArea(r.poly) > 1e-5);
  if (!claude.length) return { ...plan, reader: "claude" };

  // 1. rooms: keep the detector's outline where it matches one of Claude's rooms
  const used = new Set<string>();
  const rooms: Room[] = [];
  claude.forEach((c, i) => {
    let best: Room | null = null, score = 0;
    for (const d of plan.rooms) {
      if (used.has(d.id)) continue;
      const o = overlap(c.poly, d.polygon).iou;
      if (o <= score) continue;
      // a detector room that also covers another of Claude's rooms has merged two rooms: its outline is no good
      const spill = claude.reduce((t, other) => (other === c ? t : t + overlap(d.polygon, other.poly).ofA), 0);
      if (spill > 0.08) continue;
      score = o; best = d;
    }
    const name = c.name.trim() || NAME[c.kind] || "Raum";
    if (best && score >= 0.55) {
      used.add(best.id);
      rooms.push({ ...best, name, areaFromPdf: c.areaM2 != null, areaM2: c.areaM2 ?? best.areaM2 });
    } else {
      rooms.push({ id: `cr${i}-${Math.random().toString(36).slice(2, 6)}`, name, polygon: c.poly, areaM2: c.areaM2 ?? 0, areaFromPdf: c.areaM2 != null, confirmed: false, group: plan.rooms[0]?.group });
    }
  });
  // detector rooms Claude did not name: keep only those that are not already covered by Claude's rooms
  for (const d of plan.rooms) {
    if (used.has(d.id)) continue;
    const covered = claude.reduce((t, c) => t + overlap(d.polygon, c.poly).ofA, 0);
    if (covered < 0.3) rooms.push(d);
  }

  // 2. scale from the printed areas (median, so one misread label cannot skew it)
  let metersPerUnit = plan.metersPerUnit, scaleSource = plan.scaleSource;
  if (scaleSource !== "labels" && scaleSource !== "manual") {
    const ks = rooms.filter((r) => r.areaFromPdf && r.areaM2 > 0).map((r) => Math.sqrt(r.areaM2 / (polyArea(r.polygon) * aspect))).filter(Number.isFinite).sort((a, b) => a - b);
    if (ks.length) { metersPerUnit = ks[ks.length >> 1]; scaleSource = "labels"; }
  }
  for (const r of rooms) if (!r.areaFromPdf) r.areaM2 = Math.round(polyArea(r.polygon) * aspect * metersPerUnit * metersPerUnit * 10) / 10;

  // 3. doors with their swing
  const doors: PlanDoor[] = read.doors
    .map((d) => ({ hinge: pt(d.hinge), tip: pt(d.tip), into: pt(d.into), glass: d.glass || undefined }))
    .filter((d) => { const len = Math.hypot(d.tip[0] - d.hinge[0], (d.tip[1] - d.hinge[1]) * aspect) * metersPerUnit; return len > 0.3 && len < 1.6; });

  // 4. drawn fittings become fixed pieces of the room they stand in
  const mx = metersPerUnit, mz = metersPerUnit * aspect;
  const fixtures: Record<string, NonNullable<FloorPlan["fixtures"]>[string]> = {};
  read.fixtures.forEach((f, i) => {
    const def = PIECE[f.type];
    if (!def) return;
    const x0 = clamp(Math.min(f.box.x0, f.box.x1)), x1 = clamp(Math.max(f.box.x0, f.box.x1)), y0 = clamp(Math.min(f.box.y0, f.box.y1)), y1 = clamp(Math.max(f.box.y0, f.box.y1));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const room = rooms.find((r) => inPoly(r.polygon, cx, cy));
    if (!room) return;
    const rot = ROT[f.against];
    const along = rot % 2 === 0 ? (x1 - x0) * mx : (y1 - y0) * mz;
    (fixtures[room.id] ??= []).push({ id: `${room.id}-f${i}`, type: def.type, s: def.sized ? Math.round(Math.max(0.4, along) * 100) / 100 : undefined, x: cx * mx, z: cy * mz, rot });
  });

  return { ...plan, rooms, metersPerUnit, scaleSource, doors, fixtures, reader: "claude" };
}

/** the picture Claude gets: the plan with a labelled 0.1 grid, so coordinates can be read off precisely */
async function withGrid(src: string): Promise<string> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const k = Math.min(1, 1568 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0, c.width, c.height);
  g.strokeStyle = "rgba(220, 40, 40, 0.35)"; g.lineWidth = 1;
  g.fillStyle = "rgba(200, 30, 30, 0.9)"; g.font = `${Math.max(10, Math.round(c.width / 90))}px sans-serif`;
  for (let t = 1; t < 10; t++) {
    const x = Math.round((t / 10) * c.width) + 0.5, y = Math.round((t / 10) * c.height) + 0.5;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke();
    g.fillText(`0.${t}`, x + 2, 12); g.fillText(`0.${t}`, 2, y - 2);
  }
  return c.toDataURL("image/jpeg", 0.9);
}

/** asks Claude to read the plan and merges the answer; returns the plan unchanged plus why, if that was not possible */
export async function refineWithClaude(plan: FloorPlan): Promise<{ plan: FloorPlan; note?: string }> {
  try {
    const ok = (await (await fetch("/api/ai/plan")).json()) as { available?: boolean };
    if (!ok.available) return { plan, note: "Claude is not connected, so rooms, doors and fittings come from the wall detector alone." };
    const res = await fetch("/api/ai/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: await withGrid(plan.image) }) });
    const j = (await res.json().catch(() => ({}))) as { read?: PlanRead; error?: string };
    if (!res.ok || !j.read) return { plan, note: j.error ?? "Claude could not read the plan; the wall detector's result is shown." };
    return { plan: mergeRead(plan, j.read) };
  } catch {
    return { plan, note: "Could not reach Claude; the wall detector's result is shown." };
  }
}
