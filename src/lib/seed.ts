import type { Project, Unit, UnitStatus, ViewingSlot } from "./types";
import { buildPage } from "./templates";

function demoUnits(): Unit[] {
  const types = [
    { rooms: 2.5, area: 62, rent: 2480 },
    { rooms: 3.5, area: 84, rent: 3150 },
    { rooms: 4.5, area: 108, rent: 3890 },
    { rooms: 3.5, area: 91, rent: 3320 },
  ];
  const status: UnitStatus[] = ["available", "available", "reserved", "available", "rented", "available"];
  const out: Unit[] = [];
  let i = 0;
  for (const building of ["A", "B"]) {
    for (let floor = 0; floor < 3; floor++) {
      for (let k = 0; k < 4; k++) {
        const t = types[(k + (building === "B" ? 1 : 0)) % 4];
        out.push({
          id: `u${i}`,
          ref: `${building}.${floor}${k + 1}`,
          building,
          floor,
          rooms: t.rooms,
          areaM2: t.area + floor,
          price: t.rent + floor * 90,
          charges: Math.round(t.area * 2.6 / 10) * 10,
          status: status[(i * 5 + floor) % status.length],
        });
        i++;
      }
    }
  }
  return out;
}

/** extra sample units for mixed-use buildings, like the commercial floors and parking on our reference sites */
export function demoExtras(uses: string[]): Unit[] {
  const out: Unit[] = [];
  if (uses.includes("commercial"))
    out.push(
      { id: "c1", ref: "G.01", use: "commercial", label: "Retail / gastronomy", building: "A", floor: 0, rooms: 0, areaM2: 159, price: 2700, charges: 300, status: "available" },
      { id: "c2", ref: "G.02", use: "commercial", label: "Office", building: "A", floor: 0, rooms: 0, areaM2: 119, price: 1985, charges: 180, status: "available" },
      { id: "c3", ref: "G.03", use: "commercial", label: "Practice", building: "B", floor: 0, rooms: 0, areaM2: 96, price: 1640, charges: 150, status: "rented" },
    );
  if (uses.includes("parking"))
    for (let i = 1; i <= 8; i++)
      out.push({ id: `p${i}`, ref: `P.${String(i).padStart(2, "0")}`, use: "parking", label: i > 6 ? "Motorbike space" : "Underground space", building: "A", floor: -1, rooms: 0, areaM2: 0, price: i > 6 ? 50 : 130, status: i % 3 === 0 ? "rented" : "available" });
  return out;
}

function demoSlots(): ViewingSlot[] {
  const d = (days: number, h: number) => {
    const x = new Date();
    x.setDate(x.getDate() + days);
    x.setHours(h, 0, 0, 0);
    return x.toISOString();
  };
  return [
    { id: "s1", start: d(4, 17), durationMin: 60, capacity: 4, label: "Group viewing" },
    { id: "s2", start: d(6, 10), durationMin: 30, capacity: 1, label: "Private viewing" },
    { id: "s3", start: d(11, 17), durationMin: 60, capacity: 4, label: "Group viewing" },
  ];
}

export function seedProjects(): Project[] {
  const base = {
    id: "wohnen-am-park",
    name: "Wohnen am Park",
    slug: "wohnen-am-park",
    address: "Parkweg 12",
    zip: "8050",
    city: "Zürich",
    lat: 47.4106,
    lng: 8.5446,
    type: "rent" as const,
    locale: "en",
    accent: "#1F5C4A",
    template: "atelier" as const,
    units: demoUnits(),
    floorPlans: [],
    leads: [
      { id: "l1", at: Date.now() - 86400000 * 2, name: "Lea Baumann", email: "lea.baumann@example.ch", phone: "079 555 01 20", message: "Is apartment A.21 ready to move into from April?", unitRef: "A.21", interests: ["Send me the brochure"] },
      { id: "l2", at: Date.now() - 86400000 * 5, name: "Marco Keller", email: "m.keller@example.ch", interests: ["Please call me back"] },
    ],
    slots: demoSlots(),
    bookings: [{ id: "b1", slotId: "s1", at: Date.now() - 3600000, name: "Lea Baumann", email: "lea.baumann@example.ch" }],
    views: 318,
    createdAt: Date.now() - 86400000 * 9,
    published: null,
  };
  return [{ ...base, draft: buildPage(base, "atelier") }];
}
