import { describe, expect, it } from "vitest";
import { mergeRead } from "../refine";
import { PlanReadSchema } from "../read-schema";
import { piecesOf } from "../furnish";
import type { FloorPlan, Pt } from "../../types";
import read from "./user-plan-read.json";

const W = 484, H = 516;
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0 / W, y0 / H], [x1 / W, y0 / H], [x1 / W, y1 / H], [x0 / W, y1 / H]];

/** what the wall detector found on this plan: Zimmer right, Wohnen and Entrée merged into one, no balcony, wrong scale */
const detected: FloorPlan = {
  id: "fp-test", name: "test", image: "", width: W, height: H, walls: [], createdAt: 0,
  metersPerUnit: 6, scaleSource: "doors",
  rooms: [
    { id: "d1", name: "Kitchen", polygon: rect(27, 137, 181, 381), areaM2: 8.4, confirmed: false, group: 0 },
    { id: "d2", name: "Living / Dining", polygon: [[190 / W, 232 / H], [455 / W, 232 / H], [455 / W, 480 / H], [190 / W, 480 / H]], areaM2: 16.4, confirmed: false, group: 0 },
    { id: "d3", name: "WC", polygon: rect(27, 392, 181, 478), areaM2: 2.2, confirmed: false, group: 0 },
  ],
};

describe("mergeRead", () => {
  const plan = mergeRead(detected, PlanReadSchema.parse(read));
  const byName = (n: string) => plan.rooms.find((r) => r.name === n)!;

  it("names every room as printed and keeps the detector outline where both agree", () => {
    expect(plan.rooms.map((r) => r.name).sort()).toEqual(["Balkon/Loggia", "Du/WC", "Entrée", "Wohnen/Essen/Kochen", "Zimmer"]);
    expect(byName("Zimmer").id).toBe("d1");
    expect(byName("Du/WC").id).toBe("d3");
    // the merged detector room does not survive next to Claude's split rooms
    expect(plan.rooms.some((r) => r.id === "d2")).toBe(false);
  });

  it("derives the scale from the printed areas", () => {
    expect(plan.scaleSource).toBe("labels");
    // the plan is about 9.5 m wide (≈ 51 px per metre)
    expect(plan.metersPerUnit).toBeGreaterThan(8.8);
    expect(plan.metersPerUnit).toBeLessThan(10);
    expect(byName("Zimmer").areaM2).toBe(15.2);
  });

  it("keeps door swings and places drawn fittings in their rooms", () => {
    expect(plan.doors).toHaveLength(9);
    expect(plan.doors!.filter((d) => d.glass)).toHaveLength(6);
    const types = (n: string) => (plan.fixtures?.[byName(n).id] ?? []).map((f) => f.type).sort();
    expect(types("Du/WC")).toEqual(["basin", "shower", "toilet", "washer"]);
    expect(types("Wohnen/Essen/Kochen")).toEqual(["counter"]);
    expect(types("Entrée")).toEqual(["tall"]);
    const shower = plan.fixtures![byName("Du/WC").id].find((f) => f.type === "shower")!;
    expect(shower.rot).toBe(3);
    expect(shower.s).toBeGreaterThan(1.4); // the walk-in shower runs along the wall, ~1.6 m
  });

  it("furnishes wet rooms with the drawn fittings only and does not add a second kitchen", () => {
    expect(piecesOf(plan, byName("Du/WC")).map((p) => p.type).sort()).toEqual(["basin", "shower", "toilet", "washer"]);
    const living = piecesOf(plan, byName("Wohnen/Essen/Kochen")).map((p) => p.type);
    expect(living.filter((t) => t === "counter")).toHaveLength(1);
    expect(living).not.toContain("fridge");
    expect(living).toContain("sofa");
  });
});
