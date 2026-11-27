import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { unitsFromFile } from "@/lib/units-import";

const file = (rows: unknown[][]) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Wohnungsspiegel");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([buf], "Wohnungsspiegel_v3.xlsx");
};

describe("unit list from Excel", () => {
  it("reads a real Wohnungsspiegel with title rows above the table", async () => {
    const u = await unitsFromFile(file([
      ["Wohnen am Mühlebach, Horgen"],
      ["Wohnungsspiegel v3, Stand 20.11.2026"],
      [],
      ["Whg.-Nr.", "Haus", "Geschoss", "Zi.", "Wohnfläche m²", "Nettomiete CHF/Mt.", "NK Akonto", "Status"],
      ["A.01", "Haus A", "EG", "3.5", "84.5", "2'480", "220", "frei"],
      ["A.11", "Haus A", "1. OG", "4.5", "108", "3'150", "260", "Vermietet"],
      ["B.31", "Haus B", "Attika", "2.5", "62", "2'790", "180", "reserviert"],
    ]));
    expect(u).toHaveLength(3);
    expect(u[0]).toMatchObject({ ref: "A.01", building: "A", floor: 0, rooms: 3.5, areaM2: 84.5, price: 2480, charges: 220, status: "available" });
    expect(u[1]).toMatchObject({ floor: 1, status: "rented" });
    expect(u[2]).toMatchObject({ building: "B", floor: 9, status: "reserved" });
  });
});
