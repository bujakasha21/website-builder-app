import type { Data } from "@puckeditor/core";
import type { Project, TemplateId, Unit } from "./types";
import type { Brief, FeatureId } from "./profile";
import { SECTION_DEFAULTS } from "./section-defaults";

type Tpl = { id: TemplateId; name: string; note: string; head: string; body: string; accent: string; hero: string; heroHeight?: string; heroAlign?: string; nav: string; advantages: string; textImage: string; gallery: string; map: string };
/** the three templates a new site can start from: fonts, colour and the block versions each one opens with */
export const TEMPLATES: Tpl[] = [
  { id: "atelier", name: "Atelier", note: "Editorial: large serif headlines, warm paper, numbered sections", head: "fraunces", body: "dmsans", accent: "#8A5A2B", hero: "background", heroHeight: "full", heroAlign: "bottom", nav: "overlay", advantages: "split", textImage: "left", gallery: "mosaic", map: "side" },
  { id: "kontrast", name: "Kontrast", note: "Bold: giant capitals, black and white, one signal colour", head: "grotesk", body: "grotesk", accent: "#E5482D", hero: "background", heroHeight: "full", heroAlign: "bottom", nav: "overlay", advantages: "band", textImage: "right", gallery: "grid", map: "full" },
  { id: "lumen", name: "Lumen", note: "Light: rounded pictures, soft colour, friendly and calm", head: "bricolage", body: "dmsans", accent: "#2F6F5E", hero: "split", nav: "classic", advantages: "cards", textImage: "right", gallery: "masonry", map: "side" },
];
/** earlier templates: still drawn for the sites that use them, no longer offered for new ones */
const LEGACY: Tpl[] = [
  { id: "t1", name: "Template 1", note: "Dark photo hero, centred title", head: "inter", body: "inter", accent: "#4A6FA5", hero: "center", nav: "overlay", advantages: "cards", textImage: "right", gallery: "slider", map: "full" },
  { id: "t2", name: "Template 2", note: "Split hero, capitals, sand tones", head: "barlow", body: "barlow", accent: "#B08D66", hero: "split", nav: "classic", advantages: "band", textImage: "left", gallery: "grid", map: "side" },
  { id: "t3", name: "Template 3", note: "Large image, centred headings, cream", head: "outfit", body: "outfit", accent: "#C9A227", hero: "below", nav: "classic", advantages: "list", textImage: "round", gallery: "slider", map: "full" },
  { id: "t4", name: "Template 4", note: "Framed hero, big capitals", head: "outfit", body: "outfit", accent: "#3E8E5A", hero: "framed", nav: "overlay", advantages: "cards", textImage: "left", gallery: "slider", map: "stacked" },
  { id: "t5", name: "Template 5", note: "Serif, centre band, sage green", head: "merriweather", body: "lora", accent: "#6F9E84", hero: "band", nav: "minimal", advantages: "cards", textImage: "left", gallery: "masonry", map: "side" },
];
export const isLegacy = (id: string | undefined) => LEGACY.some((t) => t.id === id);
/** what a template picker shows: the three, plus the site's own earlier template so it can be kept */
export const templatesFor = (current?: string) => [...TEMPLATES, ...LEGACY.filter((t) => t.id === current).map((t) => ({ ...t, name: `${t.name} (earlier)` }))];
export const templateOf = (id: string | undefined) => [...TEMPLATES, ...LEGACY].find((t) => t.id === id);

export const chf = (n: number) => "CHF " + Math.round(n).toLocaleString("de-CH").replace(/[’’]/g, "'");

export function facts(p: Pick<Project, "units" | "type">) {
  const u: Unit[] = p.units.filter((x) => (x.use ?? "apartment") === "apartment");
  const commercial = p.units.filter((x) => x.use === "commercial").length;
  const parking = p.units.filter((x) => x.use === "parking").length;
  if (!u.length) return null;
  const rooms = u.map((x) => x.rooms);
  const area = u.map((x) => x.areaM2);
  const open = u.filter((x) => x.status === "available");
  const prices = (open.length ? open : u).map((x) => x.price).filter(Boolean);
  const r = (a: number[]) => {
    const lo = Math.min(...a), hi = Math.max(...a);
    return lo === hi ? `${lo}` : `${lo} – ${hi}`;
  };
  return {
    count: u.length,
    commercial,
    parking,
    available: open.length,
    rooms: r(rooms),
    area: r(area),
    priceFrom: prices.length ? Math.min(...prices) : 0,
  };
}

let n = 0;
const id = (t: string) => `${t}-${Date.now().toString(36)}${(n++).toString(36)}`;
const block = (type: string, props: Record<string, unknown>) => ({ type, props: { id: id(type), ...props } as Record<string, unknown> & { id: string } });

type Base = Pick<Project, "name" | "address" | "zip" | "city" | "type" | "units" | "floorPlans"> & { heroImage?: string; gallery?: { src: string; caption: string }[] };

/** every starter block of a template, filled from the project */
function starter(p: Base, template: TemplateId) {
  const f = facts(p);
  const tpl = templateOf(template) ?? TEMPLATES[0];
  const rent = p.type === "rent";
  const place = [p.address, [p.zip, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const offer = rent ? "rental apartments" : "apartments for sale";

  const hero = block("Hero", {
    eyebrow: place || p.city,
    title: p.name,
    text: f
      ? `${f.count} ${offer} with ${f.rooms} rooms and ${f.area} m² of living space${p.city ? ` in ${p.city}` : ""}${f.commercial ? `, plus ${f.commercial} commercial ${f.commercial === 1 ? "space" : "spaces"}` : ""}.`
      : `${offer[0].toUpperCase()}${offer.slice(1)}${p.city ? ` in ${p.city}` : ""}.`,
    cta: "View apartments",
    ctaHref: "#units",
    image: p.heroImage ?? "",
    variant: tpl.hero,
    height: tpl.heroHeight ?? "large",
    align: tpl.heroAlign ?? "left",
    overlay: 45,
  });
  const factsBlock = block("Facts", {
    title: "At a glance",
    items: f
      ? [
          { value: String(f.count), label: "Apartments" },
          { value: f.rooms, label: "Rooms" },
          { value: `${f.area} m²`, label: "Living space" },
          { value: f.priceFrom ? chf(f.priceFrom) : "on request", label: rent ? "Rent from / month" : "Price from" },
        ]
      : [{ value: "–", label: "Apartments to follow" }],
  });
  const text = block("Text", {
    title: "The project",
    body: `${p.name} is located at ${place || "–"}. Describe the location, architecture and fit-out here – or let Pascal write a first draft from the project facts.`,
    columns: "1",
  });
  const gallery = block("Gallery", { title: "Impressions", layout: tpl.gallery, columns: tpl.id === "t2" ? "4" : tpl.id === "kontrast" ? "2" : "3", images: p.gallery?.length ? p.gallery : [{ src: "", caption: "Exterior" }, { src: "", caption: "Living room" }, { src: "", caption: "Kitchen" }, { src: "", caption: "View" }, { src: "", caption: "Surroundings" }] });
  const advantages = block("Advantages", {
    title: "Good reasons to move in",
    variant: tpl.advantages,
    items: [
      { icon: "shop", title: "Shopping", text: "Everything for daily life is around the corner." },
      { icon: "food", title: "Restaurants", text: "A good choice of cafés and restaurants nearby." },
      { icon: "transport", title: "Transport", text: "Bus and train are a short walk away." },
      { icon: "park", title: "Green spaces", text: "Parks and paths for a walk start at the door." },
    ],
  });
  const textImage = block("TextImage", {
    title: "The property",
    text: `${p.name} offers bright floor plans, generous windows and quality materials. Replace this text with what makes the property special.`,
    image: p.gallery?.[0]?.src ?? "",
    cta: "See the apartments",
    ctaHref: "#units",
    variant: tpl.textImage,
  });
  const header = block("Header", { links: [{ label: "Project", href: "#project" }, { label: "Apartments", href: "#units" }, { label: "Location", href: "#location" }, { label: "Gallery", href: "#gallery" }], cta: "Contact", ctaHref: "#contact" });
  const waitlist = block("Waitlist", { title: "Waiting list", text: "Nothing suitable at the moment? Leave your details and we will contact you as soon as a matching apartment becomes available.", privacyLabel: "I have read and accept the privacy policy.", privacyHref: "/privacy" });
  const finder = block("UnitFinder", {
    title: p.units.some((x) => x.use && x.use !== "apartment") ? "Offer" : "Apartments",
    text: "Hover over the building or the list to find an apartment. Click it for the floor plan in 2D and 3D.",
    note: rent ? "Charges = ancillary costs per month, paid on account." : "",
  });
  const location = block("Location", { title: "Location", text: place, zoom: 15, layout: tpl.map, mapStyle: "grey", mapHeight: "m", showAddress: "yes" });
  const viewing = block("Viewing", { title: "Viewings", text: "Pick a slot. You will receive a confirmation by email." });
  const contact = block("ContactForm", {
    title: "Contact",
    text: "We will get back to you within one working day.",
    interests: [{ label: "Send me the brochure" }, { label: "Please call me back" }],
    privacyLabel: "I have read and accept the privacy policy.",
    privacyHref: "/privacy",
  });
  const contacts = block("Contacts", {
    title: "Your contacts",
    people: [{ name: "First Last", role: rent ? "Lettings" : "Sales", phone: "", email: "" }],
  });
  const footer = block("Footer", { company: p.name, imprintHref: "/imprint", privacyHref: "/privacy" });

  return { tpl, header, hero, advantages, textImage, text, factsBlock, finder, waitlist, gallery, location, viewing, contact, contacts, footer };
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const ANCHOR: Record<string, [string, string]> = {
  TextImage: ["Project", "#project"], UnitFinder: ["Apartments", "#units"], Shops: ["Shops", "#shops"], Booking: ["Book", "#booking"],
  Hours: ["Opening hours", "#hours"], Blog: ["News", "#news"], Gallery: ["Gallery", "#gallery"], Location: ["Location", "#location"],
};

/**
 * The page a new site starts with, built from the interview: only the features the owner picked, in a sensible order,
 * menu links to the main sections. Without a brief this is the classic residential page (buildPage).
 */
function fromBrief(p: Base, template: TemplateId, brief: Brief): Data {
  const b = starter(p, template);
  const F = new Set<FeatureId>(brief.features);
  const property = brief.kind === "residential" || brief.kind === "commercial";
  const kindLine: Record<string, string> = { "shopping-centre": "Shops, restaurants and services under one roof.", booking: "Rooms and desks to book by the hour or day.", blog: "News, stories and updates.", other: "" };
  if (!property || !p.units.length) {
    b.hero.props.text = brief.description || kindLine[brief.kind] || "";
    b.hero.props.eyebrow = [p.city, KIND_EYEBROW[brief.kind]].filter(Boolean).join(" · ");
  }
  if (brief.description) b.textImage.props.text = brief.description;
  if (!property) { b.textImage.props.title = "About us"; b.textImage.props.cta = ""; }
  if (F.has("units") || F.has("isometry")) b.finder.props.variant = F.has("isometry") ? "split" : "table";
  // the hero button leads to the most important section the site actually has
  const heroTarget: [FeatureId, string, string][] = [["units", "View apartments", "#units"], ["isometry", "View apartments", "#units"], ["shops", "See the shops", "#shops"], ["booking", "Book now", "#booking"], ["blog", "Read the news", "#news"], ["contact", "Get in touch", "#contact"]];
  const go = heroTarget.find(([f]) => F.has(f));
  b.hero.props.cta = go?.[1] ?? "";
  b.hero.props.ctaHref = go?.[2] ?? "";
  if (!(F.has("units") || F.has("isometry"))) { b.textImage.props.cta = ""; b.textImage.props.ctaHref = ""; }
  const sec = (type: string, props: Record<string, unknown> = {}) => block(type, { ...clone((SECTION_DEFAULTS as Record<string, Record<string, unknown>>)[type] ?? {}), ...props });
  const pick = (f: FeatureId, x: ReturnType<typeof block>) => (F.has(f) ? [x] : []);
  const order = [
    b.header, b.hero,
    ...(property ? [b.advantages] : []),
    b.textImage,
    ...(F.has("facts") && p.units.length ? [b.factsBlock] : []),
    ...(F.has("units") || F.has("isometry") ? [b.finder] : []),
    ...pick("tour", block("Embed", { title: "Take a look around", text: "Walk through the show flat in 3D.", url: "", ratio: "wide" })),
    ...pick("waitlist", b.waitlist),
    ...pick("shops", sec("Shops")),
    ...pick("hours", sec("Hours")),
    ...pick("booking", sec("Booking")),
    ...pick("viewing", b.viewing),
    ...pick("gallery", b.gallery),
    ...pick("blog", sec("Blog", property ? {} : { title: brief.kind === "blog" ? "Latest posts" : "News & events" })),
    ...pick("reviews", sec("Testimonials")),
    ...pick("location", b.location),
    ...pick("faq", block("Faq", {})),
    ...pick("downloads", block("Downloads", { title: "Downloads" })),
    ...pick("newsletter", sec("Newsletter")),
    ...pick("contact", b.contact),
    ...pick("team", b.contacts),
    b.footer,
  ];
  // menu: the main sections that made it onto the page, at most five
  b.header.props.links = order.map((x) => ANCHOR[x.type]).filter(Boolean).slice(0, 5).map(([label, href]) => ({ label, href }));
  if (!F.has("contact")) { b.header.props.cta = ""; }
  const root: Record<string, unknown> = { template: b.tpl.id, navVariant: b.tpl.nav };
  if (property && p.units.length) root.disturber = { enabled: true, text: "Move in from spring", href: "#units", position: "hero", shape: "round" };
  if (F.has("floorplans")) root.unitDetail = "page";
  if (F.has("popup")) root.modal = { enabled: true, title: `Welcome to ${p.name}`, text: brief.description || "Register now and be the first to hear the news.", image: "", cta: "", ctaHref: "", form: F.has("newsletter") || !property ? "contact" : "waitlist", once: true };
  return { root: { props: root }, content: order, zones: {} } as Data;
}
const KIND_EYEBROW: Record<string, string> = { residential: "", commercial: "Offices & commercial space", "shopping-centre": "Shopping centre", booking: "Book online", blog: "Blog", other: "" };

export function buildPage(p: Base, template: TemplateId, brief?: Brief): Data {
  if (brief) return fromBrief(p, template, brief);
  const b = starter(p, template);
  // running order: hero, advantages, property, offer, gallery, location, contact
  const order = [b.header, b.hero, b.advantages, b.textImage, b.factsBlock, b.finder, b.waitlist, b.gallery, b.location, b.viewing, b.contact, b.contacts, b.footer];
  return { root: { props: { template: b.tpl.id, navVariant: b.tpl.nav, disturber: { enabled: true, text: "Move in from spring", href: "#units", position: "hero", shape: "round" } } }, content: order, zones: {} } as Data;
}

/** ready-made further pages; each one starts with a short page title and the blocks that belong on it */
export const PAGE_KINDS: { id: string; title: string; note: string }[] = [
  { id: "apartments", title: "Apartments", note: "The unit list with building view and waiting list" },
  { id: "location", title: "Location", note: "Map, travel times and what is nearby" },
  { id: "gallery", title: "Gallery", note: "All pictures on one page" },
  { id: "contact", title: "Contact", note: "Form, contacts and viewing dates" },
  { id: "about", title: "The project", note: "Text and pictures about the building" },
  { id: "blank", title: "New page", note: "Just a title; add blocks yourself" },
];
export function buildSubPage(kind: string, title: string, p: Base, template: TemplateId): Data {
  const b = starter(p, template);
  const head = block("Text", { title, body: "", columns: "1" });
  const content =
    kind === "apartments" ? [b.finder, b.waitlist]
    : kind === "location" ? [b.location, b.advantages]
    : kind === "gallery" ? [b.gallery]
    : kind === "contact" ? [b.contact, b.contacts, b.viewing]
    : kind === "about" ? [head, b.textImage, b.factsBlock, b.gallery]
    : [head];
  return { root: { props: {} }, content, zones: {} } as Data;
}
