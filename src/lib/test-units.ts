"use client";
import { parseIsometry, type Isometry } from "./isometry";
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

export async function testIsometry(units: Unit[]): Promise<Isometry> {
  return parseIsometry(await (await fetch("/samples/isometry-sample.svg")).text(), units);
}
