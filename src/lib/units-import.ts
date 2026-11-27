"use client";
import type { Unit, UnitStatus, UnitUse } from "./types";

const USE: Record<string, UnitUse> = { commercial: "commercial", gewerbe: "commercial", büro: "commercial", office: "commercial", retail: "commercial", parking: "parking", parkplatz: "parking", garage: "parking", pp: "parking" };

const STATUS: Record<string, UnitStatus> = {
  available: "available", frei: "available", free: "available", verfügbar: "available",
  reserved: "reserved", reserviert: "reserved",
  sold: "sold", verkauft: "sold",
  rented: "rented", vermietet: "rented",
};
/** header names compared without case, dots, spaces and dashes ("Whg.-Nr." = "whgnr") */
const norm = (k: string) => k.toLowerCase().replace(/[.\s\-_/()²]/g, "").replace("m2", "");
const pick = (row: Record<string, unknown>, keys: string[]) => {
  const want = keys.map(norm);
  // exact name first, then a header that starts with one of the names ("Nettomiete CHF/Mt." = "nettomiete")
  for (const k of Object.keys(row)) if (want.includes(norm(k))) return row[k];
  for (const k of Object.keys(row)) if (want.some((w) => w.length > 2 && norm(k).startsWith(w))) return row[k];
  return undefined;
};
const num = (v: unknown) => parseFloat(String(v ?? "").replace(/['’\s]/g, "").replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0;

const REF = ["ref", "nr", "id", "wohnung", "wohnungsnr", "whgnr", "whg", "objekt", "objektnr", "einheit", "unit", "apartment", "nretage"];
const BUILDING = ["building", "haus", "gebäude", "house", "block"];
const FLOOR = ["floor", "etage", "geschoss", "stockwerk", "level"];
const ROOMS = ["rooms", "zimmer", "zi", "anzahlzimmer", "zimmeranzahl"];
const AREA = ["area", "aream2", "fläche", "flaeche", "m", "wohnfläche", "wohnflaeche", "nettowohnfläche", "nwf", "hnf"];
const PRICE = ["price", "rent", "miete", "preis", "kaufpreis", "bruttomiete", "mietzinsbrutto", "brutto", "nettomiete", "mietzins", "netto"];
const CHARGES = ["charges", "nk", "nebenkosten", "nkakonto", "akonto"];
const KNOWN = [...REF, ...BUILDING, ...FLOOR, ...ROOMS, ...AREA, ...PRICE, ...CHARGES, "status", "verfügbarkeit", "use", "nutzung", "typ"];

/** "EG" 0, "UG" -1, "1. OG" 1, "Attika" / "DG" one above the rest (9), plain numbers as they are */
function floorOf(v: unknown): number {
  const t = String(v ?? "").trim().toLowerCase();
  if (!t) return 0;
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  if (/attika|dach|\bdg\b|penthouse|top/.test(t)) return 9;
  if (/\bug\b|unter|basement/.test(t)) return -1;
  if (/\beg\b|erdgeschoss|parterre|ground|\bgf\b|\brdc\b|pt/.test(t)) return 0;
  const n = t.match(/(\d+)/);
  return n ? parseInt(n[1], 10) : 0;
}
const statusOf = (v: unknown): UnitStatus => {
  const t = String(v ?? "").trim().toLowerCase();
  for (const [k, s] of Object.entries(STATUS)) if (t.includes(k)) return s;
  return "available";
};

/**
 * CSV or Excel → units, also a real "Wohnungsspiegel": title lines above the table are skipped (the header is the
 * first row with three or more known column names), "Haus A" becomes A, "1. OG" floor 1, "Attika" the top floor.
 * Columns (DE or EN): Nr / Whg.-Nr., Haus, Etage / Geschoss, Zimmer, Fläche, Miete / Preis, NK, Status, Nutzung
 */
export async function unitsFromFile(file: File): Promise<Unit[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const out: Unit[] = [];
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "", raw: false });
    const at = grid.slice(0, 25).findIndex((r) => r.filter((c) => KNOWN.includes(norm(String(c))) || KNOWN.some((k) => k.length > 3 && norm(String(c)).startsWith(k))).length >= 3);
    if (at < 0) continue;
    const head = grid[at].map((c, i) => String(c).trim() || `col${i}`);
    const rows = grid.slice(at + 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])) as Record<string, unknown>);
    rows.forEach((r, i) => {
      const ref = String(pick(r, REF) ?? "").trim() || `W${out.length + 1}`;
      const use = USE[String(pick(r, ["use", "type", "typ", "nutzung", "art"]) ?? "").trim().toLowerCase()];
      const u: Unit = {
        use,
        charges: num(pick(r, CHARGES)) || undefined,
        id: "u-" + ref.replace(/\W+/g, "-").toLowerCase() + "-" + out.length + "-" + i,
        ref,
        building: String(pick(r, BUILDING) ?? "").replace(/^(haus|house|gebäude|block)\s*/i, "").trim() || "A",
        floor: floorOf(pick(r, FLOOR)),
        rooms: num(pick(r, ROOMS)),
        areaM2: num(pick(r, AREA)),
        price: num(pick(r, PRICE)),
        status: statusOf(pick(r, ["status", "verfügbarkeit", "verfuegbarkeit", "availability"])),
      };
      if (u.rooms || u.areaM2 || u.use) out.push(u);
    });
    if (out.length) break; // the first sheet with a unit table
  }
  return out;
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
