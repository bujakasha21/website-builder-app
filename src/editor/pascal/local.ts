import type { Data } from "@puckeditor/core";
import { TEMPLATES } from "@/lib/templates";
import { ADV_VARIANTS, GALLERY_VARIANTS, HERO_VARIANTS, MAP_VARIANTS, TI_VARIANTS } from "../blocks";
import { FINDER_VARIANTS } from "../UnitFinder";
import { aboutFromFacts, blocksOf, checkSite, factItems, insertBlock, introFromFacts, makeBlock, setProps } from "./rules";
import type { Block, PascalContext, PascalProvider, Proposal } from "./types";

/**
 * Pascal's local provider: fixed rules, no language model.
 *
 * Understood commands (also listed by "help"):
 *   add <section> [under | above <section>] [at the top | at the bottom]
 *   remove <section>
 *   move <section> up | down | to the top | to the bottom | under <section> | above <section>
 *   change <section>            → next version;   <section> version <n>;   make the <section> <version name>
 *   use template <1–5>
 *   make it <colour name | #hex>
 *   make the [<section>] button | title | text say <words>
 *   write the introduction | write the project text | update the facts | shorten the text
 *   check my site
 *   open apartments | floor plans | building | leads | preview | site settings | project
 * Anything else: Pascal says he cannot do it yet and offers the nearest thing he can.
 */

const ALIASES: [string, string[]][] = [
  ["Waitlist", ["waiting list", "waitlist", "wait list"]],
  ["ContactForm", ["contact form", "enquiry form", "form"]],
  ["Contacts", ["contact people", "contact persons", "contacts", "team"]],
  ["TextImage", ["text and image", "text + image", "text with image", "text image", "about section", "property section"]],
  ["UnitFinder", ["apartment finder", "apartments", "apartment list", "units", "flats", "offer"]],
  ["FloorPlanBlock", ["floor plan"]],
  ["Embed", ["360 tour", "360° tour", "virtual tour", "video", "tour"]],
  ["Faq", ["questions and answers", "questions & answers", "questions", "faq"]],
  ["Hero", ["top section", "hero", "header image", "main image"]],
  ["Header", ["menu bar", "navigation", "menu"]],
  ["Advantages", ["advantages", "highlights", "benefits", "reasons"]],
  ["Facts", ["key figures", "facts", "numbers"]],
  ["Gallery", ["gallery", "photos", "pictures", "images", "impressions"]],
  ["Downloads", ["downloads", "brochure", "documents"]],
  ["Location", ["location", "map"]],
  ["Viewing", ["viewing booking", "viewings", "viewing"]],
  ["Footer", ["footer"]],
  ["Text", ["text section", "text block"]],
];
export const BLOCK_NAME: Record<string, string> = { Header: "menu bar", Hero: "top section", Advantages: "advantages", TextImage: "text + image", Text: "text", Facts: "facts", Gallery: "gallery", Embed: "video / 360° tour", Faq: "questions & answers section", Downloads: "downloads", UnitFinder: "apartments", UnitList: "apartment table", FloorPlanBlock: "floor plan", Location: "location", ContactForm: "contact form", Waitlist: "waiting list", Viewing: "viewing booking", Contacts: "contacts", Footer: "footer" };
const ONCE = ["Header", "Hero", "Footer", "UnitFinder", "ContactForm", "Waitlist"];
const VERSIONS: Record<string, { field: string; list: { value: string; label: string }[] }> = {
  Hero: { field: "variant", list: HERO_VARIANTS }, Advantages: { field: "variant", list: ADV_VARIANTS }, TextImage: { field: "variant", list: TI_VARIANTS },
  Gallery: { field: "layout", list: GALLERY_VARIANTS }, Location: { field: "layout", list: MAP_VARIANTS }, UnitFinder: { field: "variant", list: FINDER_VARIANTS },
};
const COLOURS: Record<string, string> = { blue: "#1F4E8C", navy: "#1B2A4A", green: "#1F5C4A", teal: "#1F6F78", red: "#A8322A", orange: "#C8692B", yellow: "#C9A227", gold: "#B08D3C", purple: "#5B3F8C", pink: "#B8456F", brown: "#8B6B4A", black: "#1c1b19", grey: "#5d6369", gray: "#5d6369" };
const LANGS: Record<string, [string, string]> = { german: ["de-CH", "German"], deutsch: ["de-CH", "German"], french: ["fr-CH", "French"], italian: ["it-CH", "Italian"], english: ["en", "English"] };

/** every section named in the sentence, in the order it appears */
function mentions(t: string) {
  const found: { type: string; at: number }[] = [];
  let rest = t;
  for (const [type, names] of ALIASES)
    for (const n of names) {
      const at = rest.indexOf(n);
      if (at >= 0) { found.push({ type, at }); rest = rest.slice(0, at) + " ".repeat(n.length) + rest.slice(at + n.length); }
    }
  return found.sort((a, b) => a.at - b.at);
}
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const EXAMPLES = ["Add a gallery", "Add a waiting list under the apartments", "Change the top section", "Make the button say Apply now", "Use template 3", "Make it blue", "Check my site"];
const cannot = (what: string, near: string[]): Proposal => ({ reply: `${what} Here is what I can do instead:`, examples: near });

export const HELP = "I can add, remove and move sections, switch a section's look, change the template or the colour, change a title, text or button, write texts from your apartment data, check your site, and open the pages where you manage apartments or settings.";

export const localProvider: PascalProvider = {
  id: "local",
  label: "Works from fixed rules – not a language model",
  async respond(input: string, ctx: PascalContext): Promise<Proposal> {
    const raw = input.trim();
    const t = raw.toLowerCase().replace(/[.!?]+$/, "");
    const p = ctx.project, d = ctx.data;
    if (!t) return { reply: "Tell me what you would like to change.", examples: EXAMPLES.slice(0, 5) };
    if (/^(hi|hello|hey|hallo|help|what can you do)\b/.test(t)) return { reply: `Hi, I'm Pascal. ${p ? HELP : "Open a website and I can change it for you. From here I can start a new one or take you where you need to go."}`, examples: p ? EXAMPLES.slice(0, 6) : ["New website", "Open floor plans", "Open leads"] };

    // ── dashboard: no website open ──
    if (!p || !d) {
      if (/new (web)?site|start|create/.test(t)) return { reply: "Let's start a new website.", go: "/new", confirmLabel: "Start" };
      if (/floor ?plan/.test(t)) return { reply: "Floor plans live here.", go: "/studio", confirmLabel: "Open" };
      if (/lead|enquir/.test(t)) return { reply: "Your enquiries are here.", go: "/leads", confirmLabel: "Open" };
      if (/brochure/.test(t)) return { reply: "Brochures are here.", go: "/brochures", confirmLabel: "Open" };
      if (/website|site|project/.test(t)) return { reply: "All your websites are here.", go: "/websites", confirmLabel: "Open" };
      return cannot("I can only change a website once it is open in the editor.", ["New website", "Open my websites", "Open floor plans"]);
    }

    const list = blocksOf(d);
    const found = mentions(t);
    const firstOf = (type: string) => list.find((c) => c.type === type);
    const selected = list.find((c) => c.props.id === ctx.selectedId);

    // ── check my site ──
    if (/\bcheck\b|what.*missing|ready to publish|review my site/.test(t)) {
      const issues = checkSite(p, d);
      return issues.length ? { reply: `I found ${issues.length} ${issues.length === 1 ? "thing" : "things"} to look at before you publish.`, issues } : { reply: "Looks good to me: logo, photos, prices, address, texts and privacy link are all there. Ready to publish." };
    }

    // ── open a page ──
    if (/^(open|go to|show me|show|take me to)\b/.test(t) || /settings/.test(t)) {
      if (/site settings|settings|cookie|imprint|privacy|pop-?up|disturber|language/.test(t)) return { reply: "That lives in Site settings.", open: "settings", confirmLabel: "Open Site settings" };
      if (/apartment|unit|price|flat/.test(t)) return { reply: "Apartments, prices and PDFs are managed on one page.", go: `/p/${p.id}/units`, confirmLabel: "Open apartments" };
      if (/floor ?plan/.test(t)) return { reply: "Floor plans are here.", go: `/p/${p.id}/plans`, confirmLabel: "Open floor plans" };
      if (/building|isometr/.test(t)) return { reply: "The building view is here.", go: `/p/${p.id}/isometry`, confirmLabel: "Open building" };
      if (/lead|enquir/.test(t)) return { reply: "Your enquiries are here.", go: "/leads", confirmLabel: "Open leads" };
      if (/preview|website|site/.test(t)) return { reply: "Here is the draft as visitors will see it.", go: `/site/${p.id}?draft=1`, confirmLabel: "Open preview" };
      if (/project|dashboard|logo/.test(t)) return { reply: "The project page has logo, address and colours.", go: `/p/${p.id}`, confirmLabel: "Open project" };
    }

    // ── template ──
    const tpl = t.match(/template\s*#?(\d)|\b(atelier|kontrast|lumen)\b/);
    if (tpl) {
      const def = tpl[2] ? TEMPLATES.find((x) => x.id === tpl[2]) : TEMPLATES[Number(tpl[1]) - 1];
      if (!def) return cannot(`There are three templates: ${TEMPLATES.map((x) => x.name).join(", ")}.`, TEMPLATES.map((x) => `Use ${x.name}`));
      return { reply: `Switching the whole site to ${def.name}. Your content stays as it is.`, changes: [`Template: ${def.name} (${def.note})`], apply: (x) => ({ ...x, root: { ...x.root, props: { ...(x.root.props ?? {}), template: def.id } } }) as Data };
    }

    // ── colour ──
    const hex = raw.match(/#[0-9a-f]{6}\b/i)?.[0];
    const colour = Object.keys(COLOURS).find((c) => new RegExp(`\\b${c}\\b`).test(t));
    if (hex || (colour && /make|colou?r|accent|use|change|turn/.test(t))) {
      const value = hex ?? COLOURS[colour!];
      return { reply: `${cap(colour ?? value)} it is. Buttons, links and highlights will use it.`, changes: [`Accent colour: ${value}`], patchProject: (x) => ({ ...x, accent: value }) };
    }
    if (/colou?r/.test(t)) return cannot("I did not catch which colour.", ["Make it blue", "Make it green", "Make it #1F4E8C"]);

    // ── title, text or button wording ──
    const say = raw.match(/(?:make|set|change|rename)\s+(?:the\s+)?(.*?)\s*\b(button|title|headline|heading|text)\b\s+(?:say|says|to|read|into)\s+["“”']?(.+?)["“”']?[.!]?$/i);
    if (say) {
      const [, where, what, words] = say;
      const m = mentions(where.toLowerCase())[0];
      const target = (m ? firstOf(m.type) : null) ?? selected ?? firstOf("Hero");
      if (!target) return cannot("I could not find that section on the page.", ["Add a top section"]);
      const w = what.toLowerCase();
      const field = w === "button" ? (target.type === "ContactForm" ? "submitLabel" : "cta") : w === "text" ? (target.type === "Text" ? "body" : "text") : "title";
      if (!(field in target.props) && !["cta", "title", "text"].includes(field)) return cannot(`The ${BLOCK_NAME[target.type]} has no ${w}.`, ["Make the top section title say Welcome"]);
      return { reply: `Changing the ${w} of the ${BLOCK_NAME[target.type] ?? target.type}.`, changes: [`${cap(w)}: “${String(target.props[field] ?? "") || "empty"}” → “${words}”`], apply: (x) => setProps(x, String(target.props.id), { [field]: words }) };
    }

    // ── texts from the project's own data ──
    if (/write|fill|update/.test(t) && /intro|introduction/.test(t)) {
      const b = firstOf("Hero"), after = introFromFacts(p);
      if (!b) return cannot("There is no top section to put it in.", ["Add a top section"]);
      if (!after) return { reply: "I need your apartments first (count, rooms, prices). Then I can write it.", go: `/p/${p.id}/units`, confirmLabel: "Add apartments" };
      return { reply: "Here is an introduction made only from your apartment data.", changes: [`“${after}”`], apply: (x) => setProps(x, String(b.props.id), { text: after }) };
    }
    if (/write|fill/.test(t) && /(project|property|about) text|description/.test(t)) {
      const b = firstOf("Text") ?? firstOf("TextImage"), after = aboutFromFacts(p);
      if (!b) return cannot("There is no text section yet.", ["Add a text and image section"]);
      if (!after) return { reply: "I need your apartments first. Then I can write it.", go: `/p/${p.id}/units`, confirmLabel: "Add apartments" };
      return { reply: "A project text from your data. I left out fit-out and move-in date because I have no facts on them.", changes: [`“${after}”`], apply: (x) => setProps(x, String(b.props.id), { [b.type === "Text" ? "body" : "text"]: after }) };
    }
    if (/facts|key figures/.test(t) && /update|fill|write|refresh/.test(t)) {
      const b = firstOf("Facts"), items = factItems(p);
      if (!items) return { reply: "I need your apartments first.", go: `/p/${p.id}/units`, confirmLabel: "Add apartments" };
      return { reply: "Facts from your current apartments.", changes: [items.map((i) => `${i.value} ${i.label}`).join(" · ")], apply: (x) => (b ? setProps(x, String(b.props.id), { items }) : insertBlock(x, makeBlock("Facts", { items }))) };
    }
    if (/shorten|shorter/.test(t)) {
      const b = selected ?? firstOf("Hero");
      const field = b?.type === "Text" ? "body" : "text";
      const before = String(b?.props[field] ?? "");
      const parts = before.match(/[^.!?]+[.!?]+/g) ?? [before];
      if (!b || parts.length < 2) return { reply: "That text is already a single sentence. Select a longer text on the page and ask again." };
      const after = parts.slice(0, Math.ceil(parts.length / 2)).join("").trim();
      return { reply: `Shortened the ${BLOCK_NAME[b.type] ?? b.type} text without changing any facts.`, changes: [`“${after}”`], apply: (x) => setProps(x, String(b.props.id), { [field]: after }) };
    }

    // ── translate: not possible without a model ──
    if (/translat/.test(t)) {
      const key = Object.keys(LANGS).find((k) => t.includes(k));
      const [code, name] = key ? LANGS[key] : ["de-CH", "German"];
      if (code === p.locale || (p.locales ?? []).includes(code)) return { reply: `I cannot translate texts yet. ${name} already exists as a language: switch to it in the top bar and translate there.` };
      return { reply: `I cannot translate texts yet. The nearest thing: I add ${name} as a language with a copy of this page, and you translate it in the editor.`, changes: [`Add ${name} as a site language`], patchProject: (x) => ({ ...x, locales: [...(x.locales ?? []), code] }), confirmLabel: `Add ${name}` };
    }

    // ── remove ──
    if (/^(remove|delete|take out|get rid of|hide)\b/.test(t)) {
      const m = found[0];
      const target = m ? firstOf(m.type) : selected;
      if (!target) return cannot(m ? `There is no ${BLOCK_NAME[m.type]} on the page.` : "Tell me which section to remove.", ["Remove the map", "Remove the gallery"]);
      return { reply: `Removing the ${BLOCK_NAME[target.type] ?? target.type}. You can undo this.`, changes: [`Remove: ${BLOCK_NAME[target.type] ?? target.type}`], confirmLabel: "Remove it", apply: (x) => ({ ...x, content: blocksOf(x).filter((c) => c.props.id !== target.props.id) }) as Data };
    }

    // ── move ──
    if (/^(move|put|shift)\b/.test(t)) {
      const m = found[0];
      const target = m ? firstOf(m.type) : selected;
      if (!target) return cannot("Tell me which section to move.", ["Move the gallery up", "Move the map under the apartments"]);
      const anchor = found[1] ? firstOf(found[1].type) : undefined;
      const name = BLOCK_NAME[target.type] ?? target.type;
      const move = (x: Data, pos: (rest: Block[], from: number) => number) => {
        const all = blocksOf(x), from = all.findIndex((c) => c.props.id === target.props.id);
        const rest = all.filter((c) => c.props.id !== target.props.id);
        rest.splice(Math.max(0, Math.min(rest.length, pos(rest, from))), 0, all[from]);
        return { ...x, content: rest } as Data;
      };
      if (anchor) {
        const above = /\b(above|before|over)\b/.test(t);
        return { reply: `Moving the ${name} ${above ? "above" : "under"} the ${BLOCK_NAME[anchor.type]}.`, changes: [`${cap(name)} → ${above ? "above" : "under"} ${BLOCK_NAME[anchor.type]}`], apply: (x) => move(x, (rest) => rest.findIndex((c) => c.props.id === anchor.props.id) + (above ? 0 : 1)) };
      }
      if (/top|first|beginning/.test(t)) return { reply: `Moving the ${name} to the top, right under the menu bar.`, changes: [`${cap(name)} → top`], apply: (x) => move(x, (rest) => (rest[0]?.type === "Header" ? 1 : 0)) };
      if (/bottom|end|last/.test(t)) return { reply: `Moving the ${name} to the bottom, above the footer.`, changes: [`${cap(name)} → bottom`], apply: (x) => move(x, (rest) => (rest[rest.length - 1]?.type === "Footer" ? rest.length - 1 : rest.length)) };
      if (/\bup\b|higher/.test(t)) return { reply: `Moving the ${name} one place up.`, changes: [`${cap(name)} → one up`], apply: (x) => move(x, (_, from) => from - 1) };
      if (/\bdown\b|lower/.test(t)) return { reply: `Moving the ${name} one place down.`, changes: [`${cap(name)} → one down`], apply: (x) => move(x, (_, from) => from + 1) };
      return cannot("Tell me where it should go.", [`Move the ${name} up`, `Move the ${name} to the bottom`]);
    }

    // ── add ──
    if (/^(add|insert|i need|i want|give me|create|put in)\b/.test(t)) {
      const m = found[0];
      if (!m) return cannot("I do not have that kind of section yet.", ["Add a gallery", "Add a video", "Add questions and answers", "Add a waiting list"]);
      const name = BLOCK_NAME[m.type];
      if (ONCE.includes(m.type) && firstOf(m.type)) return VERSIONS[m.type] ? { reply: `There is already ${/^[aeiou]/.test(name) ? "an" : "a"} ${name} on the page. I can change its look instead.`, examples: [`Change the ${name}`] } : { reply: `There is already ${/^[aeiou]/.test(name) ? "an" : "a"} ${name} on the page, and one is enough.`, examples: [`Move the ${name} up`] };
      const anchor = found[1] ? firstOf(found[1].type) : undefined;
      const above = /\b(above|before|over)\b/.test(t);
      const where = anchor ? `${above ? "above" : "under"} the ${BLOCK_NAME[anchor.type]}` : /\btop\b/.test(t) ? "at the top" : /\bbottom\b|\bend\b/.test(t) ? "at the bottom" : "where it fits best";
      return {
        reply: `Adding ${/^[aeiou]/.test(name) ? "an" : "a"} ${name} ${where}.`, changes: [`New section: ${name}`],
        apply: (x) => {
          const all = blocksOf(x);
          const at = anchor ? all.findIndex((c) => c.props.id === anchor.props.id) + (above ? 0 : 1) : /\btop\b/.test(t) ? (all[0]?.type === "Header" ? 1 : 0) : /\bbottom\b|\bend\b/.test(t) ? (all[all.length - 1]?.type === "Footer" ? all.length - 1 : all.length) : undefined;
          return insertBlock(x, makeBlock(m.type, m.type === "Footer" ? { company: p.name } : {}), at);
        },
      };
    }

    // ── another look for a section ──
    const m = found[0];
    const target = m ? firstOf(m.type) : selected;
    if (target && VERSIONS[target.type] && (/change|switch|another|different|next|version|look|make|show|turn/.test(t))) {
      const { field, list: vs } = VERSIONS[target.type];
      const cur = Math.max(0, vs.findIndex((v) => v.value === (target.props[field] ?? vs[0].value)));
      const n = t.match(/version\s*#?(\d+)/);
      const words = t.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
      const named = vs.find((v) => v.value !== vs[cur].value && (words.includes(v.value) || v.label.toLowerCase().split(/[^a-z]+/).some((w) => w.length > 3 && words.includes(w) && !ALIASES.some(([, a]) => a.includes(w)))));
      const next = n ? vs[Math.min(vs.length, Math.max(1, Number(n[1]))) - 1] : named ?? vs[(cur + 1) % vs.length];
      const name = BLOCK_NAME[target.type];
      return { reply: `Here is another look for the ${name}: “${next.label}”. Ask again for the next one.`, changes: [`${cap(name)}: “${vs[cur].label}” → “${next.label}”`], apply: (x) => setProps(x, String(target.props.id), { [field]: next.value }) };
    }
    if (m && !firstOf(m.type)) return { reply: `There is no ${BLOCK_NAME[m.type]} on the page yet.`, examples: [`Add ${/^[aeiou]/.test(BLOCK_NAME[m.type]) ? "an" : "a"} ${BLOCK_NAME[m.type]}`] };

    return cannot("I cannot do that yet.", m ? [`Change the ${BLOCK_NAME[m.type]}`, `Move the ${BLOCK_NAME[m.type]} up`, `Remove the ${BLOCK_NAME[m.type]}`] : EXAMPLES.slice(0, 4));
  },
};

/** the provider in use; swap this for a hosted model later */
export const pascal: PascalProvider = localProvider;
export const STARTERS = { editor: ["Add a gallery", "Change the top section", "Make the button say Apply now", "Use template 3", "Make it blue", "Check my site"], home: ["New website", "Open my websites", "Open floor plans", "Open leads"] };
