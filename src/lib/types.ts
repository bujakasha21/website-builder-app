import type { Data } from "@puckeditor/core";
import type { Isometry } from "./isometry";
import type { SeoMeta, SiteKind, ThemeTokens } from "@/doc/schema";
import type { Brief } from "./profile";

export type UnitStatus = "available" | "reserved" | "sold" | "rented";
export type TemplateId = "atelier" | "kontrast" | "lumen" | "t1" | "t2" | "t3" | "t4" | "t5" | "calm" | "bold" | "compact";
export type Pt = [number, number];

export type UnitUse = "apartment" | "commercial" | "parking";
export const USE_LABEL: Record<UnitUse, string> = { apartment: "Apartments", commercial: "Commercial / offices", parking: "Parking" };

export interface Unit {
  id: string;
  ref: string;
  /** undefined = apartment */
  use?: UnitUse;
  /** e.g. "Office", "Retail", "Underground space" */
  label?: string;
  building: string;
  floor: number;
  rooms: number;
  areaM2: number;
  price: number;
  /** ancillary costs per month (NK) for rentals */
  charges?: number;
  status: UnitStatus;
  floorPlanId?: string;
  /** own floor plan PDF (data URL); replaces the generated one */
  pdf?: string;
  pdfName?: string;
  /** own apply link for this unit; overrides the project setting */
  applyUrl?: string;
  /** short remark shown in the optional "Remark" column, e.g. "Balcony" */
  note?: string;
}

/** how the apartment table behaves on the website */
export interface UnitSettings {
  columns: string[];
  apply: "contact" | "link";
  /** may contain {ref}, replaced with the unit number */
  applyUrl: string;
  applyLabel: string;
  /** no prices for reserved, let and sold units */
  hideTakenPrice: boolean;
}

export interface Room {
  id: string;
  name: string;
  polygon: Pt[]; // normalized 0–1
  areaM2: number;
  confirmed: boolean;
  areaFromPdf?: boolean;
  /** index into FloorPlan.groups (which apartment on this floor the room belongs to) */
  group?: number;
}

/** one apartment (or the shared stairwell) on a floor plan */
export interface PlanGroup {
  name: string;
  common?: boolean;
  outline?: Pt[]; // footprint, normalized
}

/** a door leaf read from the plan: hinge jamb, the opposite jamb (where the closed leaf ends) and a point in the room it swings into; normalized coords */
export interface PlanDoor { hinge: Pt; tip: Pt; into: Pt; glass?: boolean }

/** wall rect in normalized coords: x, y, w, h, kind (1 wall, 2 door opening, 3 window) */
export type WallRect = [number, number, number, number, 1 | 2 | 3];

export interface PlanView { id: string; name: string; roomId: string | null; x: number; z: number; yaw: number; image: string; photo?: string; at: number }

export interface FloorPlan {
  id: string;
  name: string;
  image: string; // data URL of the rendered page
  width: number;
  height: number;
  rooms: Room[];
  walls: WallRect[];
  metersPerUnit: number; // real-world metres for normalized width 1
  scaleSource: "labels" | "doors" | "walls" | "manual";
  createdAt: number;
  groups?: PlanGroup[];
  /** groups are levels of one apartment (maisonette sheet), not apartments on a floor */
  levels?: boolean;
  /** "" or undefined = every building */
  building?: string;
  /** undefined = every floor */
  floors?: number[];
  /** saved camera views of this plan: the plain 3D view, and the rendered photo once an image model made one */
  views?: PlanView[];
  /** door leaves with their swing, when the plan was read by Claude; without them doors open a standard way */
  doors?: PlanDoor[];
  /** built-in fittings read from the plan (shower, WC, kitchen run, washer …): room id → pieces, kept when furnishing automatically */
  fixtures?: Record<string, { id: string; type: string; s?: number; x: number; z: number; rot: number }[]>;
  /** who read the plan: the wall detector alone, or the detector checked by Claude */
  reader?: "detector" | "claude";
  /** rooms the owner furnished by hand (room id → pieces); rooms without an entry are furnished automatically */
  furniture?: Record<string, { id: string; type: string; s?: number; x: number; z: number; rot: number }[]>;
  /** the plan read the colleague's Studio way (src/lib/floorplan/studio.ts): clean 2D picture and a wall/floor grid for 3D */
  studio?: { clean: string; variant: number; floor: string; grid: { gw: number; gh: number; walls: number[][]; floors: number[][] }; mpp: number; crop: [number, number, number, number]; size: [number, number]; at: number };
}

export interface Lead {
  id: string;
  at: number;
  name: string;
  email: string;
  phone?: string;
  message?: string;
  unitRef?: string;
  interests: string[];
}

export interface WaitlistEntry {
  id: string;
  at: number;
  name: string;
  email: string;
  phone?: string;
  rooms: string[];
  note?: string;
}

export interface ViewingSlot {
  id: string;
  start: string; // ISO
  durationMin: number;
  capacity: number;
  label: string;
}

export interface Booking {
  id: string;
  /** a viewing slot, or "resource:<name>@<ISO start>" for the booking system */
  slotId: string;
  /** booking system: what was booked and when */
  resource?: string;
  start?: string;
  durationMin?: number;
  at: number;
  name: string;
  email: string;
}

/** a further page of the site (the home page stays in Project.draft / published); the menu bar and footer come from the home page */
export interface SitePage { id: string; slug: string; title: string; draft: Data; published: Data | null; seo?: SeoMeta }

export interface Project {
  id: string;
  name: string;
  slug: string;
  address: string;
  zip: string;
  city: string;
  lat: number;
  lng: number;
  type: "rent" | "sale";
  /** what the building offers; drives the tabs on the site */
  uses?: UnitUse[];
  locale: string;
  /** primary brand colour; the rest of the theme is in `theme` */
  accent: string;
  /** document format version, see src/doc/migrate.ts */
  docVersion?: number;
  kind?: SiteKind;
  /** design tokens on top of the template (missing = template default) */
  theme?: ThemeTokens;
  /** search engine and share settings of the home page; further pages carry their own */
  seo?: SeoMeta;
  /** the answers from the new-site interview: what the site is for and which features it needs */
  brief?: Brief;
  template: TemplateId;
  logo?: string;
  /** unit feed configured in the wizard (credentials are not kept in this preview) */
  connector?: { provider: string; baseUrl: string; projectRef: string };
  /** the logo is light (e.g. white lettering) and needs a dark surface */
  logoOnDark?: boolean;
  draft: Data;
  published: Data | null;
  /** more pages next to the home page, e.g. /apartments or /contact */
  pages?: SitePage[];
  publishedAt?: number;
  units: Unit[];
  unitSettings?: Partial<UnitSettings>;
  floorPlans: FloorPlan[];
  /** uploaded isometric SVG of the building with shapes linked to units */
  isometry?: Isometry;
  /** which building view the site shows: the uploaded 2D drawing or the rotatable 3D model */
  isoMode?: "2d" | "3d";
  /** extra site languages besides `locale`; each has its own copy of the page */
  locales?: string[];
  drafts?: Record<string, Data>;
  publishedByLocale?: Record<string, Data>;
  leads: Lead[];
  waitlist?: WaitlistEntry[];
  slots: ViewingSlot[];
  bookings: Booking[];
  views: number;
  createdAt: number;
}

export const STATUS_LABEL: Record<UnitStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
  rented: "Let",
};

export const STATUS_COLOR: Record<UnitStatus, string> = {
  available: "#2F7D5B",
  reserved: "#B7791F",
  sold: "#8A8580",
  rented: "#8A8580",
};
