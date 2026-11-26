import type { FloorPlan, PlanGroup, Project, Pt, Unit, UnitUse } from "./types";

export const useOf = (u: Unit): UnitUse => u.use ?? "apartment";
export const apartments = (p: Pick<Project, "units">) => p.units.filter((u) => useOf(u) === "apartment");

/** apartments on a plan; older plans without grouping count as one apartment */
export function groupsOf(plan: FloorPlan): PlanGroup[] {
  return plan.groups?.length ? plan.groups : [{ name: "Apt 1" }];
}
export const groupOf = (plan: FloorPlan, roomGroup: number | undefined) => (plan.groups?.length ? roomGroup ?? 0 : 0);

/** apartment slots (non-common groups) in plan order */
export function slotsOf(plan: FloorPlan) {
  return groupsOf(plan).map((g, i) => ({ g, i })).filter((x) => !x.g.common);
}

export const GROUP_COLORS = ["#1F5C4A", "#1D4E89", "#8A5A1B", "#7A2E2E", "#5B3E7A", "#2F6F7A", "#6B6B2A", "#874C6B"];
export const groupColor = (i: number, common?: boolean) => (common ? "#8A8580" : GROUP_COLORS[i % GROUP_COLORS.length]);

export function buildingsOf(p: Pick<Project, "units">) {
  return [...new Set(apartments(p).map((u) => u.building))].sort();
}
export function floorsOf(p: Pick<Project, "units">, building?: string) {
  return [...new Set(apartments(p).filter((u) => !building || u.building === building).map((u) => u.floor))].sort((a, b) => a - b);
}

/** the plan that describes a given building + floor */
export function planFor(p: Pick<Project, "floorPlans">, building: string, floor: number) {
  const multi = p.floorPlans.filter((f) => slotsOf(f).length > 1 && !f.levels);
  const pool = multi.length ? multi : p.floorPlans;
  return pool.find((f) => (!f.building || f.building === building) && (!f.floors || f.floors.includes(floor)));
}

/** units of one floor in the order they are matched to the apartments of the plan */
export function unitsOnFloor(p: Pick<Project, "units">, building: string, floor: number): Unit[] {
  return apartments(p).filter((u) => u.building === building && u.floor === floor).sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));
}

/** where a unit sits: its plan and the apartment (group index) on that plan */
export function locate(p: Pick<Project, "units" | "floorPlans">, unit: Unit) {
  const plan = planFor(p, unit.building, unit.floor);
  if (!plan) return null;
  const slot = unitsOnFloor(p, unit.building, unit.floor).findIndex((u) => u.id === unit.id);
  const s = slotsOf(plan)[slot];
  return s ? { plan, group: s.i } : null;
}

/** a plan reduced to one apartment, for the detail view */
export function subPlan(plan: FloorPlan, group: number): FloorPlan {
  const rooms = plan.rooms.filter((r) => groupOf(plan, r.group) === group);
  if (!rooms.length || !plan.groups?.length) return plan;
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const r of rooms) for (const [x, y] of r.polygon) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pad = 0.022;
  const walls = plan.walls.filter(([x, y, w, h]) => x + w > x0 - pad && x < x1 + pad && y + h > y0 - pad * (plan.width / plan.height) && y < y1 + pad * (plan.width / plan.height))
    .map(([x, y, w, h, k]) => {
      // clip to the apartment so neighbours do not leak in
      const cx0 = Math.max(x, x0 - pad), cy0 = Math.max(y, y0 - pad * (plan.width / plan.height));
      const cx1 = Math.min(x + w, x1 + pad), cy1 = Math.min(y + h, y1 + pad * (plan.width / plan.height));
      return [cx0, cy0, cx1 - cx0, cy1 - cy0, k] as FloorPlan["walls"][number];
    });
  return { ...plan, id: `${plan.id}-g${group}`, rooms, walls, groups: undefined };
}

export const polyArea = (p: Pt[]) => Math.abs(p.reduce((s, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + x * y2 - x2 * y; }, 0) / 2);
