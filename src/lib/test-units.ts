"use client";
import { planFromUrl } from "./floorplan/pdf";
import type { FloorPlan } from "./types";
import { demoExtras, seedProjects } from "./seed";
import type { Unit } from "./types";

/**
 * Generated apartments for testing: two buildings (A, B), three floors, four apartments each, mixed status,
 * plus commercial spaces for commercial sites. Their numbers match the shapes of the sample isometry,
 * so the building view is linked straight away.
 */
export function testUnits(offer: "rent" | "sale" = "rent", commercial = false): Unit[] {
  const sale = (x: Unit): Unit => (offer === "sale" ? { ...x, price: x.price * 290, charges: undefined, status: x.status === "rented" ? "sold" : x.status } : x);
  return [...seedProjects()[0].units, ...demoExtras(commercial ? ["commercial"] : [])].map(sale);
}


/**
 * The test building in 3D: the sample floor plan (four apartments around a stairwell) read like any uploaded PDF,
 * so the stacked model, the 2D plans and the walk-through all work. Read once per session.
 */
let building: Promise<FloorPlan> | null = null;
export function testBuilding(): Promise<FloorPlan> {
  building ??= planFromUrl("/samples/floor-plan-typical-floor.pdf", "Typical floor (test)").then((p) => ({ ...p, rooms: p.rooms.map((r) => ({ ...r, confirmed: true })) }));
  building.catch(() => { building = null; });
  return building;
}
