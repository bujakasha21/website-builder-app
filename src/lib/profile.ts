import type { SiteKind } from "@/doc/schema";

/** who is building: asked once on the first visit, editable later; drives defaults and how much UI is shown */
export type Role = "freelancer" | "agency" | "company" | "developer-re" | "property-manager" | "marketing" | "saas" | "developer" | "exploring" | "other";
export type Experience = "none" | "some" | "experienced" | "pro";

export interface Profile {
  role: Role;
  roleOther?: string;
  experience: Experience;
  /** what this person makes websites for */
  purposes: SiteKind[];
  company?: string;
  /** they skipped the questions; ask again only from the menu */
  skipped?: boolean;
  at: number;
}

/** the interview for one new website; kept on the project as `brief` */
export interface Brief {
  kind: SiteKind;
  name: string;
  description: string;
  features: FeatureId[];
  vibe?: Vibe;
  languages: string[];
  /** property sites: let or sell */
  offer?: "rent" | "sale";
  /** uploaded logo (data URL); light logos need a dark surface */
  logo?: string;
  logoOnDark?: boolean;
  /** colours read from the logo in code (src/lib/logo.ts), and the one picked as the main colour */
  palette?: string[];
  /** how many of `palette` were found in the logo; the rest are suggestions that go with it */
  paletteFromLogo?: number;
  accent?: string;
  /** texts written for this site (by Claude, or by rules); the page generator uses them instead of writing its own */
  copy?: import("./copy").Copy;
  /** who wrote `copy`, e.g. "claude-opus-5-5" or "rules" */
  copyBy?: string;
  /** where the apartments come from; "test" = generated sample apartments for trying things out */
  unitSource?: UnitSource;
  units?: import("./types").Unit[];
  /** API feed settings (no live sync in this preview; the site starts with test apartments) */
  connector?: { provider: string; baseUrl: string; projectRef: string };
  /** building view: an SVG drawing (clickable apartments) or a PNG/JPG picture */
  isometry?: import("./isometry").Isometry;
  /** floor plans the 3D building is stacked from (the test building, for now) */
  floorPlans?: import("./types").FloorPlan[];
  /** what the site shows: the rotatable 3D model or the uploaded drawing */
  buildingView?: "3d" | "drawing";
  start?: StartMode;
}

export const ROLES: { id: Role; label: string; note: string }[] = [
  { id: "freelancer", label: "Freelancer", note: "I build sites for my clients" },
  { id: "agency", label: "Agency", note: "A team building many client sites" },
  { id: "company", label: "Company owner", note: "A site for my own business" },
  { id: "developer-re", label: "Real-estate developer", note: "We build and market projects" },
  { id: "property-manager", label: "Property manager", note: "We let and manage buildings" },
  { id: "marketing", label: "Marketing team", note: "Campaigns and landing pages" },
  { id: "saas", label: "SaaS / platform", note: "Sites for our customers at scale" },
  { id: "developer", label: "Developer", note: "I want full control and code" },
  { id: "exploring", label: "Just exploring", note: "Looking around first" },
];

export const EXPERIENCE: { id: Experience; label: string; note: string }[] = [
  { id: "none", label: "None", note: "This is my first website" },
  { id: "some", label: "Some", note: "I have used a builder before" },
  { id: "experienced", label: "Experienced", note: "I build sites regularly" },
  { id: "pro", label: "Professional", note: "Web design or development is my job" },
];

/** beginners get the guided editor: fewer panels, advanced options folded away, Pascal open */
export const isGuided = (p: Profile | null | undefined) => !p || p.experience === "none" || p.experience === "some";

export const KINDS: { id: SiteKind; label: string; note: string }[] = [
  { id: "residential", label: "Residential project", note: "Apartments to let or sell" },
  { id: "commercial", label: "Commercial / offices", note: "Offices, retail, workshop space" },
  { id: "shopping-centre", label: "Shopping centre", note: "Shops, opening hours, events" },
  { id: "booking", label: "Booking site", note: "Rooms, desks, meeting rooms, slots" },
  { id: "blog", label: "Blog / news", note: "Articles and updates" },
  { id: "other", label: "Something else", note: "A business or landing page" },
];

export type FeatureId =
  | "units" | "isometry" | "floorplans" | "tour" | "facts" | "waitlist" | "viewing"
  | "gallery" | "location" | "contact" | "team" | "faq" | "downloads"
  | "blog" | "booking" | "shops" | "hours" | "reviews" | "newsletter" | "popup" | "multilingual";

/** every feature is real: it adds these sections (or settings) to the generated site */
export const FEATURES: { id: FeatureId; label: string; note: string; group: "Property" | "Content" | "Business"; blocks: string[] }[] = [
  { id: "units", label: "Apartment table", note: "Nr, floor, rooms, area, price, status, filters", group: "Property", blocks: ["UnitFinder"] },
  { id: "isometry", label: "Building view", note: "Isometry or 3D building, linked to the table", group: "Property", blocks: ["UnitFinder"] },
  { id: "floorplans", label: "Floor plans 2D / 3D", note: "Plan per apartment with 3D walk-through", group: "Property", blocks: ["FloorPlanBlock"] },
  { id: "tour", label: "Live 3D tour", note: "360° tour or video of the flat, embedded", group: "Property", blocks: ["Embed"] },
  { id: "facts", label: "Key figures", note: "Apartments, sizes, prices at a glance", group: "Property", blocks: ["Facts"] },
  { id: "waitlist", label: "Waiting list", note: "Collect interest before or after letting", group: "Property", blocks: ["Waitlist"] },
  { id: "viewing", label: "Viewing dates", note: "Visitors book a viewing slot", group: "Property", blocks: ["Viewing"] },
  { id: "gallery", label: "Gallery", note: "Grid, slider, mosaic", group: "Content", blocks: ["Gallery"] },
  { id: "location", label: "Map & location", note: "Map, travel times, nearby", group: "Content", blocks: ["Location"] },
  { id: "blog", label: "Blog / news", note: "Articles, news and events", group: "Content", blocks: ["Blog"] },
  { id: "faq", label: "Questions & answers", note: "The usual questions, answered", group: "Content", blocks: ["Faq"] },
  { id: "downloads", label: "Downloads", note: "Brochure, plans, documents", group: "Content", blocks: ["Downloads"] },
  { id: "reviews", label: "Testimonials", note: "What tenants and clients say", group: "Content", blocks: ["Testimonials"] },
  { id: "contact", label: "Contact form", note: "Enquiries go to Leads", group: "Business", blocks: ["ContactForm"] },
  { id: "team", label: "Contacts / team", note: "People with phone and email", group: "Business", blocks: ["Contacts"] },
  { id: "booking", label: "Booking system", note: "Rooms, desks or services by the hour", group: "Business", blocks: ["Booking"] },
  { id: "shops", label: "Shop directory", note: "Shops and restaurants with filters", group: "Business", blocks: ["Shops"] },
  { id: "hours", label: "Opening hours", note: "Week schedule and holidays", group: "Business", blocks: ["Hours"] },
  { id: "newsletter", label: "Newsletter sign-up", note: "Collect e-mail addresses", group: "Business", blocks: ["Newsletter"] },
  { id: "popup", label: "Pop-up on entry", note: "Announcement or sign-up when the site opens", group: "Business", blocks: [] },
  { id: "multilingual", label: "Several languages", note: "German, French, Italian, English", group: "Business", blocks: [] },
];

/** what each kind of site usually needs; preselected, the owner adds or removes */
export const KIND_FEATURES: Record<SiteKind, FeatureId[]> = {
  residential: ["units", "isometry", "floorplans", "facts", "gallery", "location", "waitlist", "contact", "team"],
  commercial: ["units", "floorplans", "facts", "gallery", "location", "downloads", "contact", "team"],
  "shopping-centre": ["shops", "hours", "blog", "gallery", "location", "newsletter", "contact"],
  booking: ["booking", "gallery", "hours", "location", "faq", "contact"],
  blog: ["blog", "newsletter", "contact"],
  other: ["gallery", "location", "contact"],
};

export type Vibe = "elegant" | "bold" | "friendly";
export const VIBES: { id: Vibe; label: string; note: string; template: "atelier" | "kontrast" | "lumen" }[] = [
  { id: "elegant", label: "Elegant", note: "Serif headlines, warm paper, calm", template: "atelier" },
  { id: "bold", label: "Bold", note: "Big capitals, black and white, one signal colour", template: "kontrast" },
  { id: "friendly", label: "Friendly", note: "Rounded pictures, soft colour", template: "lumen" },
];

export type UnitSource = "test" | "manual" | "api" | "sheet";
export const UNIT_SOURCES: { id: UnitSource; label: string; note: string }[] = [
  { id: "test", label: "Test apartments", note: "24 generated apartments with a matching isometry – for trying things out" },
  { id: "manual", label: "By hand", note: "Type the apartments into a table" },
  { id: "api", label: "From an API", note: "Wincasa, Flatfox, CasaGateway, Melon …" },
  { id: "sheet", label: "From a sheet", note: "Excel or CSV letting list" },
];
export const API_PROVIDERS = [["wincasa", "Wincasa"], ["flatfox", "Flatfox"], ["casagateway", "CasaGateway / CasaOne"], ["melon", "Melon"], ["custom", "Other REST / JSON"]] as const;

export type StartMode = "ai" | "steps" | "template" | "blank" | "document" | "url";

/** property features only make sense with apartments; other kinds start the plain way */
export const needsUnits = (b: Pick<Brief, "features">) => b.features.some((f) => f === "units" || f === "isometry" || f === "floorplans" || f === "viewing" || f === "waitlist");
