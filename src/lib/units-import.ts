"use client";
import type { Unit, UnitStatus, UnitUse } from "./types";

const USE: Record<string, UnitUse> = { commercial: "commercial", gewerbe: "commercial", büro: "commercial", office: "commercial", retail: "commercial", parking: "parking", parkplatz: "parking", garage: "parking", pp: "parking" };

const STATUS: Record<string, UnitStatus> = {
  available: "available", frei: "available", free: "available", verfügbar: "available",
  reserved: "reserved", reserviert: "reserved",
  sold: "sold", verkauft: "sold",
  rented: "rented", vermietet: "rented",
};
const pick = (row: Record<string, unknown>, keys: string[]) => {
  for (const k of Object.keys(row)) if (keys.includes(k.trim().toLowerCase())) return row[k];
  return undefined;
};
const num = (v: unknown) => parseFloat(String(v ?? "").replace(/['’\s]/g, "").replace(",", ".")) || 0;

/** CSV or Excel → units. Columns (DE or EN): ref/nr, building/haus, floor/etage, rooms/zimmer, area/fläche, price/miete/preis, status */
export async function unitsFromFile(file: File): Promise<Unit[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  return rows
    .map((r, i) => {
      const ref = String(pick(r, ["ref", "nr", "nr.", "id", "wohnung", "objekt"]) ?? "").trim() || `W${i + 1}`;
      const use = USE[String(pick(r, ["use", "type", "typ", "nutzung", "art"]) ?? "").trim().toLowerCase()];
      return {
        use,
        charges: num(pick(r, ["charges", "nk", "nebenkosten"])) || undefined,
        id: "u-" + ref.replace(/\W+/g, "-").toLowerCase() + "-" + i,
        ref,
        building: String(pick(r, ["building", "haus", "gebäude"]) ?? "").trim() || "A",
        floor: num(pick(r, ["floor", "etage", "geschoss", "stockwerk"])),
        rooms: num(pick(r, ["rooms", "zimmer", "zi"])),
        areaM2: num(pick(r, ["area", "aream2", "fläche", "flaeche", "m2", "m²", "wohnfläche"])),
        price: num(pick(r, ["price", "rent", "miete", "preis", "kaufpreis", "bruttomiete"])),
        status: STATUS[String(pick(r, ["status"]) ?? "").trim().toLowerCase()] ?? "available",
      } satisfies Unit;
    })
    .filter((u) => u.rooms || u.areaM2 || u.use);
}

export function unitsToCsv(units: Unit[]) {
  const head = "ref;use;building;floor;rooms;area;price;charges;status";
  return [head, ...units.map((u) => [u.ref, u.use ?? "apartment", u.building, u.floor, u.rooms, u.areaM2, u.price, u.charges ?? "", u.status].join(";"))].join("\n");
}

export function download(name: string, text: string, type = "text/csv") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
