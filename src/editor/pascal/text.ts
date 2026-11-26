import { chf, facts } from "@/lib/templates";
import type { Project } from "@/lib/types";
import { aboutFromFacts, introFromFacts } from "./rules";

export type TextAction = "write" | "improve" | "shorter" | "longer" | "fix" | "tone-factual" | "tone-upscale" | "tone-warm";
export const TEXT_ACTIONS: { id: TextAction; label: string; group?: string }[] = [
  { id: "write", label: "Write for me" }, { id: "improve", label: "Improve" }, { id: "shorter", label: "Shorter" }, { id: "longer", label: "Longer" }, { id: "fix", label: "Fix spelling and grammar" },
  { id: "tone-factual", label: "Factual", group: "Change tone" }, { id: "tone-upscale", label: "Upscale", group: "Change tone" }, { id: "tone-warm", label: "Warm", group: "Change tone" },
];
export interface TextRequest { action: TextAction; text: string; /** which field of which section, e.g. "Hero" + "title" */ block?: string; field?: string; project?: Project; /** 0 for the first proposal, +1 for every "Try again" */ attempt: number }
export interface TextResult { text: string; note?: string }

/**
 * The seam for a real model, same idea as PascalProvider: the field menu only talks to this interface.
 * `localText` below is a stub made of fixed rules. It never invents facts and must always be labelled as such in the UI.
 */
export interface TextProvider { id: string; label: string; rewrite(req: TextRequest): Promise<TextResult> }

const sentences = (t: string) => t.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
const TYPOS: Record<string, string> = { teh: "the", recieve: "receive", appartment: "apartment", appartments: "apartments", adress: "address", accomodation: "accommodation", definately: "definitely", seperate: "separate", occured: "occurred", untill: "until", wich: "which", begining: "beginning", enviroment: "environment", neccessary: "necessary", availible: "available", balkony: "balcony", kitchin: "kitchen", beatiful: "beautiful", loction: "location", minuts: "minutes" };
function fix(t: string) {
  let s = t.replace(/[ \t]+/g, " ").replace(/ ([,.;:!?])/g, "$1").replace(/([,;:!?])(?=[A-Za-zÀ-ÿ])/g, "$1 ").replace(/\b(\w+) \1\b/gi, "$1");
  s = s.replace(/\b[a-z]+\b/gi, (w) => { const f = TYPOS[w.toLowerCase()]; return f ? (w[0] === w[0].toUpperCase() ? f[0].toUpperCase() + f.slice(1) : f) : w; });
  s = s.replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (_, a, b) => a + b.toUpperCase()).replace(/\bi\b/g, "I").trim();
  if (s.length > 40 && /[A-Za-zÀ-ÿ0-9)]$/.test(s)) s += ".";
  return s;
}
const FLUFF = /\b(very|really|truly|absolutely|simply|just|quite|extremely|incredibly) /gi;
const HYPE = /\b(stunning|amazing|wonderful|breathtaking|unique|exclusive|luxurious|fantastic|incredible|perfect|dream|magnificent|spectacular)\b ?/gi;
const UPSCALE: [RegExp, string][] = [[/\bapartments\b/gi, "residences"], [/\bapartment\b/gi, "residence"], [/\bflats\b/gi, "residences"], [/\bnice\b/gi, "refined"], [/\bbig\b/gi, "generous"], [/\blarge\b/gi, "generous"], [/\bgood\b/gi, "excellent"], [/\bmodern\b/gi, "contemporary"], [/\bnear\b/gi, "moments from"], [/\bclose to\b/gi, "moments from"], [/\bcheap\b/gi, "attractively priced"], [/\bbuy\b/gi, "acquire"], [/\brent\b/g, "let"]];
const WARM: [RegExp, string][] = [[/\bapartments\b/gi, "homes"], [/\bapartment\b/gi, "home"], [/\bresidences\b/gi, "homes"], [/\bunits\b/gi, "homes"], [/\bproperty\b/gi, "place"], [/\btenants\b/gi, "neighbours"], [/\bcomprises\b/gi, "brings together"], [/\bare currently available\b/gi, "are waiting for you"]];
const swap = (t: string, list: [RegExp, string][]) => list.reduce((s, [a, b]) => s.replace(a, (m) => (m[0] === m[0].toUpperCase() ? b[0].toUpperCase() + b.slice(1) : b)), t);

export const localText: TextProvider = {
  id: "local-stub",
  label: "Rule-based preview – not a language model",
  async rewrite({ action, text, block, field, project: p, attempt }) {
    const t = text.trim();
    const f = p ? facts(p) : null;
    if (action === "write") {
      if (!p) return { text: t, note: "I need a project to write about." };
      const short = field === "title" || field === "eyebrow" || field === "cta" || field === "submitLabel" || field === "logosTitle";
      if (field === "cta" || field === "submitLabel") return { text: [block === "ContactForm" ? "Send enquiry" : "View apartments", "Apply now", "Book a viewing", "Get in touch"][attempt % 4] };
      if (field === "eyebrow") return { text: [[p.address, p.city].filter(Boolean).join(", "), p.city, p.type === "rent" ? "For rent" : "For sale"].filter(Boolean)[attempt % 3] ?? p.name };
      if (short) {
        const where = p.city ? ` in ${p.city}` : "";
        const byBlock: Record<string, string[]> = {
          Hero: [p.name, `Living${where}`, `${p.name}: your new home${where}`],
          Advantages: ["Good reasons to move in", `Why ${p.name}`, "What makes it special"],
          TextImage: ["The property", `About ${p.name}`, "Where you will live"],
          UnitFinder: ["Apartments", "Find your apartment", f ? `${f.available} apartments available` : "Availability"],
          Gallery: ["Impressions", "Take a look", "Gallery"], Location: ["Location", p.city ? `Living in ${p.city}` : "Where it is", "Getting here"],
          ContactForm: ["Contact", "Get in touch", "We are happy to help"], Waitlist: ["Waiting list", "Be the first to know"], Faq: ["Good to know", "Questions and answers"],
        };
        const list = byBlock[block ?? ""] ?? [p.name];
        return { text: list[attempt % list.length] };
      }
      const intro = introFromFacts(p), about = aboutFromFacts(p);
      if (!f || !intro || !about) return { text: t, note: "I only write from facts, and there are no apartments yet. Add them and I can write this." };
      const options = block === "Hero" ? [intro, `${p.name}: ${intro[0].toLowerCase()}${intro.slice(1)}`] : block === "Location" ? [`${p.name} is at ${p.address}, ${p.zip} ${p.city}.`, `You will find ${p.name} at ${p.address} in ${p.city}.`] : [about, `${about} ${p.type === "rent" ? "Apply online for the apartment you like." : "Get in touch for the sales documentation."}`];
      return { text: options[attempt % options.length], note: "Written only from your project data (name, address, apartments, prices)." };
    }
    if (!t) return { text: t, note: "There is no text here yet. Try “Write for me”." };
    if (action === "fix") { const out = fix(t); return out === t ? { text: t, note: "I found nothing to fix." } : { text: out }; }
    if (action === "improve") {
      const out = fix(t.replace(FLUFF, "").replace(/!+/g, ".").replace(/\bin order to\b/gi, "to").replace(/\bis located\b/gi, "is").replace(/\ba lot of\b/gi, "many").replace(/\bdue to the fact that\b/gi, "because"));
      return out === t ? { text: t, note: "This already reads cleanly. I would leave it." } : { text: out };
    }
    if (action === "shorter") {
      const s = sentences(t);
      if (s.length > 1) return { text: s.slice(0, Math.max(1, Math.ceil(s.length / 2) - (attempt % 2 && s.length > 3 ? 1 : 0))).join(" ") };
      const cut = t.replace(FLUFF, "").replace(/,[^,]{0,80}$/, ".").replace(/\s+\([^)]*\)/g, "");
      return cut.length < t.length ? { text: fix(cut) } : { text: t, note: "This is already one short sentence." };
    }
    if (action === "longer") {
      const pool = [...(p ? sentences(aboutFromFacts(p) ?? "") : []), ...(f && p && f.priceFrom ? [`${p.type === "rent" ? "Rents" : "Prices"} start at ${chf(f.priceFrom)}.`] : [])].filter((x) => !t.includes(x.slice(0, 24)));
      if (!pool.length) return { text: t, note: "I have no more facts to add. Tell me more about the property and I can extend it." };
      return { text: `${fix(t)} ${pool[attempt % pool.length]}`, note: "Added one sentence from your project data." };
    }
    const out = action === "tone-factual" ? fix(t.replace(HYPE, "").replace(FLUFF, "").replace(/!+/g, ".").replace(/\ba (?=[aeiou])/gi, "an "))
      : action === "tone-upscale" ? swap(t, UPSCALE)
      : swap(t, WARM) + (attempt % 2 === 0 && sentences(t).length > 1 && !/feel at home/i.test(t) ? " You will feel at home from the first day." : "");
    return out === t ? { text: t, note: "The text already has this tone." } : { text: out };
  },
};
/** the text provider in use; swap for a hosted model later */
export const pascalText: TextProvider = localText;
