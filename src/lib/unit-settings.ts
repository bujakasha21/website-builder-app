import type { Project, Unit, UnitSettings } from "./types";

/** columns that can be switched on and off (the unit number always shows) */
export const UNIT_COLUMNS: { key: string; label: string; hint?: string }[] = [
  { key: "floor", label: "Floor" },
  { key: "rooms", label: "Rooms" },
  { key: "area", label: "Area" },
  { key: "net", label: "Net rent / price" },
  { key: "charges", label: "Charges", hint: "Rentals only" },
  { key: "gross", label: "Gross rent", hint: "Rentals only" },
  { key: "perM2", label: "Rent per m² a year", hint: "Commercial rentals only" },
  { key: "note", label: "Remark" },
  { key: "plan", label: "Floor plan" },
  { key: "status", label: "Status" },
  { key: "apply", label: "Apply button" },
];

export const UNIT_DEFAULTS: UnitSettings = {
  columns: ["floor", "rooms", "area", "net", "charges", "gross", "perM2", "plan", "status", "apply"],
  apply: "contact",
  applyUrl: "",
  applyLabel: "Apply",
  hideTakenPrice: false,
};

export const unitSettings = (p?: Pick<Project, "unitSettings"> | null): UnitSettings => ({ ...UNIT_DEFAULTS, ...(p?.unitSettings ?? {}) });

/** external link for a unit, or "" when the button leads to the contact form */
export function applyLink(s: UnitSettings, u: Unit): string {
  const url = (u.applyUrl || (s.apply === "link" ? s.applyUrl : "")).trim();
  return url ? url.replaceAll("{ref}", encodeURIComponent(u.ref)) : "";
}

/** jump to the contact form with this unit preselected */
export function applyToForm(ref: string) {
  window.dispatchEvent(new CustomEvent("sb-apply", { detail: ref }));
  document.getElementById("contact")?.scrollIntoView({ behavior: "smooth", block: "start" });
}
