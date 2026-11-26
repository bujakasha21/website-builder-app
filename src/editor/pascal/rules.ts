import type { Data } from "@puckeditor/core";
import { chf, facts } from "@/lib/templates";
import type { Project } from "@/lib/types";
import { config } from "../config";
import type { Block, Issue, Proposal } from "./types";

export const blocksOf = (d: Data) => d.content as Block[];
const rid = () => Math.random().toString(36).slice(2, 10);
export const makeBlock = (type: string, props: Record<string, unknown> = {}): Block => ({ type, props: { ...((config.components[type]?.defaultProps as object) ?? {}), ...props, id: `${type}-${rid()}` } });
export const setProps = (d: Data, id: string, patch: Record<string, unknown>) => ({ ...d, content: blocksOf(d).map((c) => (c.props.id === id ? { ...c, props: { ...c.props, ...patch } } : c)) }) as Data;

/** where a block naturally sits on a property page */
export const ORDER = ["Header", "Hero", "Advantages", "TextImage", "Text", "Facts", "UnitFinder", "UnitList", "FloorPlanBlock", "Waitlist", "Gallery", "Embed", "Location", "Faq", "Downloads", "Viewing", "ContactForm", "Contacts", "Footer"];
export function insertBlock(d: Data, b: Block, at?: number) {
  const list = [...blocksOf(d)];
  let i = at;
  if (i === undefined) {
    const rank = ORDER.indexOf(b.type);
    i = list.findIndex((c) => ORDER.indexOf(c.type) > rank);
    if (i < 0) i = list.length;
  }
  list.splice(Math.max(0, Math.min(list.length, i)), 0, b);
  return { ...d, content: list } as Data;
}

// ── copy assembled strictly from the project's own data ──────────
export function introFromFacts(p: Project) {
  const f = facts(p);
  if (!f) return null;
  const rent = p.type === "rent";
  return `${f.count} ${rent ? "rental apartments" : "apartments for sale"} with ${f.rooms} rooms in ${p.city}. ${f.available} are currently available${f.priceFrom ? `, ${rent ? "rent" : "prices"} from ${chf(f.priceFrom)}` : ""}.`;
}
export function aboutFromFacts(p: Project) {
  const f = facts(p);
  if (!f) return null;
  const rent = p.type === "rent";
  return [
    `${p.name} comprises ${f.count} ${rent ? "rental apartments" : "apartments for sale"} at ${p.address}, ${p.zip} ${p.city}.`,
    `The apartments have ${f.rooms} rooms and ${f.area} m² of living space.`,
    `${f.available} apartments are currently available${f.priceFrom ? `; ${rent ? "rents start at" : "prices start at"} ${chf(f.priceFrom)}${rent ? " per month" : ""}` : ""}.`,
  ].join(" ");
}
export function factItems(p: Project) {
  const f = facts(p);
  if (!f) return null;
  const rent = p.type === "rent";
  return [
    { value: String(f.count), label: "Apartments" },
    { value: String(f.available), label: "currently available" },
    { value: f.rooms, label: "Rooms" },
    { value: `${f.area} m²`, label: "Living space" },
    { value: f.priceFrom ? chf(f.priceFrom) : "on request", label: rent ? "Rent from / month" : "Price from" },
  ];
}

const STARTER = ["Describe what makes the property special.", "Text about the project.", "A short introduction to the project.", "Project name", "Title"];
const isBlank = (v: unknown) => !String(v ?? "").trim() || STARTER.includes(String(v).trim());
const NAME: Record<string, string> = { Hero: "top section", TextImage: "text + image section", Text: "text section", Advantages: "advantages", Gallery: "gallery", Facts: "facts", UnitFinder: "apartments section", Location: "location", ContactForm: "contact form" };

// ── one short suggestion per block, from clear rules ─────────────
export function suggestFor(b: Block, p: Project, d: Data): (Proposal & { id: string }) | null {
  const id = String(b.props.id);
  const apts = p.units.filter((u) => (u.use ?? "apartment") === "apartment");
  if (b.type === "UnitFinder") {
    const v = b.props.variant ?? "split";
    if (apts.length > 0 && apts.length <= 6 && (v === "table" || v === "stacked"))
      return { id: `${id}-cards`, reply: `You have only ${apts.length} apartments: cards look fuller than a table.`, changes: ["Apartments: show as cards"], apply: (x) => setProps(x, id, { variant: "cards" }) };
    if (apts.length > 14 && v === "cards")
      return { id: `${id}-table`, reply: `With ${apts.length} apartments a table is quicker to scan than cards.`, changes: ["Apartments: show as a table with the building"], apply: (x) => setProps(x, id, { variant: "split" }) };
    if (apts.length > 0 && apts.every((u) => u.status !== "available") && !blocksOf(d).some((c) => c.type === "Waitlist"))
      return { id: `${id}-wait`, reply: "Everything is taken right now: a waiting list keeps interested people in touch.", changes: ["Add a waiting list under the apartments"], apply: (x) => insertBlock(x, makeBlock("Waitlist"), blocksOf(x).findIndex((c) => c.props.id === id) + 1) };
  }
  if (b.type === "Hero") {
    const v = b.props.variant ?? "background";
    if (!b.props.image && !["plain", "slider", "video"].includes(v))
      return { id: `${id}-plain`, reply: "There is no photo here yet: “Text only” looks finished until you have one.", changes: ["Top section: switch to “Text only”"], apply: (x) => setProps(x, id, { variant: "plain" }) };
    const intro = introFromFacts(p);
    if (isBlank(b.props.text) && intro)
      return { id: `${id}-intro`, reply: "The introduction is still empty: I can write it from your apartment data.", changes: [`Top section text: “${intro}”`], apply: (x) => setProps(x, id, { text: intro }) };
    if (String(b.props.text ?? "").length > 240)
      return { id: `${id}-short`, reply: "The introduction is long: two sentences read better over a photo.", changes: ["Keep the first two sentences"], apply: (x) => setProps(x, id, { text: (String(b.props.text).match(/[^.!?]+[.!?]+/g) ?? [String(b.props.text)]).slice(0, 2).join("").trim() }) };
  }
  if (b.type === "Gallery") {
    const n = ((b.props.images as { src: string }[]) ?? []).filter((i) => i?.src).length;
    const l = b.props.layout ?? "grid";
    if (n >= 5 && l === "grid") return { id: `${id}-mosaic`, reply: `You have ${n} photos: a mosaic shows your best one large.`, changes: ["Gallery: switch to mosaic"], apply: (x) => setProps(x, id, { layout: "mosaic" }) };
    if (n > 0 && n <= 2 && l !== "slider") return { id: `${id}-slider`, reply: `With ${n === 1 ? "one photo" : "two photos"} a slider looks fuller than a grid.`, changes: ["Gallery: switch to slider"], apply: (x) => setProps(x, id, { layout: "slider" }) };
  }
  if (b.type === "Advantages") {
    const n = ((b.props.items as unknown[]) ?? []).length;
    if (n > 5 && (b.props.variant ?? "band") === "band") return { id: `${id}-cards`, reply: `${n} points are a lot for one row: cards give each one room.`, changes: ["Advantages: show as cards"], apply: (x) => setProps(x, id, { variant: "cards" }) };
  }
  if (b.type === "Facts") {
    const items = factItems(p);
    const cur = (b.props.items as { value: string }[]) ?? [];
    if (items && (cur.length <= 1 || cur.some((i) => i.value === "–")))
      return { id: `${id}-facts`, reply: "These facts are still placeholders: I can fill them from your apartments.", changes: [items.map((i) => `${i.value} ${i.label}`).join(" · ")], apply: (x) => setProps(x, id, { items }) };
  }
  if (b.type === "Text" || b.type === "TextImage") {
    const field = b.type === "Text" ? "body" : "text";
    const about = aboutFromFacts(p);
    if (isBlank(b.props[field]) && about) return { id: `${id}-about`, reply: "This text is still the placeholder: I can write it from your apartment data.", changes: [`“${about}”`], apply: (x) => setProps(x, id, { [field]: about }) };
  }
  if (b.type === "ContactForm") {
    const fields = (b.props.fields as { required?: string; type: string }[]) ?? [];
    if (fields.length > 8) return { id: `${id}-short`, reply: `${fields.length} fields is a long form: shorter forms get more enquiries.`, changes: ["Keep required fields, the apartment picker and the message"], apply: (x) => setProps(x, id, { fields: fields.filter((f) => f.required === "yes" || f.type === "apartment" || f.type === "textarea") }) };
  }
  return null;
}

// ── "Check my site": what is missing or weak before publishing ───
export function checkSite(p: Project, d: Data): Issue[] {
  const list = blocksOf(d);
  const out: Issue[] = [];
  const first = (t: string) => list.find((c) => c.type === t);
  if (!p.logo) out.push({ id: "logo", title: "No logo", why: "The menu bar shows the project name as plain text.", fixLabel: "Add a logo", fix: { go: `/p/${p.id}` } });
  if (!p.address?.trim() || !p.city?.trim()) out.push({ id: "address", title: "No address", why: "The map and the imprint need it.", fixLabel: "Open project", fix: { go: `/p/${p.id}` } });
  const noPhoto = list.filter((c) => (c.type === "Hero" && !["plain", "video", "slider"].includes(c.props.variant ?? "background") && !c.props.image) || (c.type === "TextImage" && !c.props.image) || (c.type === "Gallery" && !((c.props.images as { src: string }[]) ?? []).some((i) => i?.src)));
  if (noPhoto.length) out.push({ id: "photos", title: "Placeholder pictures", why: `Still without a real photo: ${[...new Set(noPhoto.map((c) => NAME[c.type] ?? c.type))].join(", ")}.` });
  const apts = p.units.filter((u) => (u.use ?? "apartment") === "apartment");
  if (!p.units.length) out.push({ id: "units", title: "No apartments yet", why: "The apartments section stays empty.", fixLabel: "Add apartments", fix: { go: `/p/${p.id}/units` } });
  else {
    const noPrice = apts.filter((u) => u.status === "available" && !u.price).length;
    if (noPrice) out.push({ id: "prices", title: "Prices missing", why: `${noPrice} available ${noPrice === 1 ? "apartment has" : "apartments have"} no price.`, fixLabel: "Add prices", fix: { go: `/p/${p.id}/units` } });
  }
  const empty = list.filter((c) => (["Hero", "TextImage"].includes(c.type) && isBlank(c.props.text)) || (c.type === "Text" && isBlank(c.props.body)) || (["Hero", "TextImage", "Text"].includes(c.type) && isBlank(c.props.title)));
  if (empty.length) out.push({ id: "texts", title: "Empty or placeholder texts", why: `Still to write: ${[...new Set(empty.map((c) => NAME[c.type] ?? c.type))].join(", ")}.` });
  if (!first("ContactForm")) out.push({ id: "contact", title: "No contact form", why: "Visitors cannot send an enquiry.", fixLabel: "Add it", fix: { changes: ["Add a contact form"], apply: (x) => insertBlock(x, makeBlock("ContactForm")) } });
  if (!first("Footer")) out.push({ id: "privacy", title: "No privacy link", why: "Without a footer there is no link to the imprint and the privacy policy.", fixLabel: "Add the footer", fix: { changes: ["Add a footer with imprint and privacy links"], apply: (x) => insertBlock(x, makeBlock("Footer", { company: p.name })) } });
  const root = (d.root?.props ?? {}) as { legal?: { email?: string } };
  if (!root.legal?.email?.trim()) out.push({ id: "email", title: "No contact email on the legal pages", why: "The imprint and the privacy policy should name one.", fixLabel: "Open Site settings", fix: { open: "settings" } });
  return out;
}

/** the visible "you are 70% done" list for a new site */
export function progress(p: Project, d: Data) {
  const list = blocksOf(d);
  const hero = list.find((c) => c.type === "Hero");
  const gal = list.find((c) => c.type === "Gallery");
  const apts = p.units.filter((u) => (u.use ?? "apartment") === "apartment");
  const steps = [
    { id: "site", label: "Website created", done: true },
    { id: "logo", label: "Logo", done: !!p.logo, go: `/p/${p.id}` },
    { id: "photos", label: "Your own photos", done: !!hero?.props.image || ((hero?.props.slides as { src: string }[]) ?? []).some((s) => s?.src) || ((gal?.props.images as { src: string }[]) ?? []).some((i) => i?.src) },
    { id: "units", label: "Apartments with prices", done: apts.length > 0 && apts.filter((u) => u.status === "available").every((u) => u.price > 0), go: `/p/${p.id}/units` },
    { id: "publish", label: "Published", done: !!p.published },
  ];
  return { steps, percent: Math.round((steps.filter((s) => s.done).length / steps.length) * 100) };
}
