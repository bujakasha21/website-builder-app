import { enablePatches, isDraft, original, produceWithPatches, setAutoFreeze, type Patch } from "immer";
import { z } from "zod";
import type { Data } from "@puckeditor/core";
import type { Project, SitePage } from "@/lib/types";
import { describeDataDiff, humanize } from "./diff";
import { BlockSchema, HEX, PageDataSchema, RADII, SeoSchema, SHADOWS, SITE_KINDS, SPACINGS, TYPE_SCALES } from "./schema";

enablePatches();
// the store hands these objects to code that predates immer; frozen objects would break it
setAutoFreeze(false);

/**
 * Every change to a site goes through these operations: the editor, Pascal and (later) the AI agents.
 * They are validated, applied atomically (all or nothing), and return patches + inverse patches for undo.
 *
 * `page`: id of a SitePage; missing or "home" = the home page. `lang`: edit another language's copy of the home page.
 */
const target = { page: z.string().optional(), lang: z.string().optional() };
const nullable = <T extends z.ZodTypeAny>(t: T) => t.nullable().optional();

export const OpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("addBlock"), ...target, index: z.number().int().min(0).optional(), block: z.object({ type: z.string(), props: z.record(z.string(), z.unknown()).optional() }) }),
  z.object({ op: z.literal("updateBlock"), ...target, id: z.string(), props: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal("moveBlock"), ...target, id: z.string(), to: z.number().int().min(0) }),
  z.object({ op: z.literal("deleteBlock"), ...target, id: z.string() }),
  z.object({ op: z.literal("duplicateBlock"), ...target, id: z.string() }),
  z.object({ op: z.literal("setRootProps"), lang: z.string().optional(), props: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal("replacePageData"), ...target, data: PageDataSchema }),
  z.object({ op: z.literal("createPage"), id: z.string().optional(), title: z.string().min(1), slug: z.string().regex(/^[a-z0-9-]+$/).optional(), content: z.array(BlockSchema).optional() }),
  z.object({ op: z.literal("renamePage"), page: z.string(), title: z.string().min(1) }),
  z.object({ op: z.literal("deletePage"), page: z.string() }),
  z.object({ op: z.literal("setPageSeo"), page: z.string().optional(), seo: z.object({ title: nullable(z.string().max(120)), description: nullable(z.string().max(320)), ogImage: nullable(z.string()), noindex: nullable(z.boolean()) }).strict() }),
  z.object({
    op: z.literal("setThemeTokens"),
    /** null resets a token to the template's value */
    tokens: z.object({
      primary: HEX.optional(),
      colors: z.object({ secondary: nullable(HEX), background: nullable(HEX), surface: nullable(HEX), text: nullable(HEX), muted: nullable(HEX) }).strict().optional(),
      fonts: z.object({ heading: nullable(z.string()), body: nullable(z.string()) }).strict().optional(),
      typeScale: nullable(z.enum(TYPE_SCALES)),
      radius: nullable(z.enum(RADII)),
      shadow: nullable(z.enum(SHADOWS)),
      spacing: nullable(z.enum(SPACINGS)),
    }).strict(),
  }),
  z.object({ op: z.literal("setLocales"), locales: z.array(z.string().min(2)).max(6) }),
  z.object({ op: z.literal("setSiteFields"), fields: z.object({ name: z.string().min(1).optional(), kind: z.enum(SITE_KINDS).optional() }).strict() }),
  /** whole-site restore from a saved version (see versions.ts) */
  z.object({ op: z.literal("restoreVersion"), label: z.string(), snapshot: z.record(z.string(), z.unknown()) }),
]);
export type Op = z.infer<typeof OpSchema>;

/** which fields each block type accepts; "*" = anything (blocks whose fields are built at run time) */
export type BlockRegistry = Record<string, { label?: string; fields: string[] | "*" }>;

export type ApplyResult =
  | { ok: true; project: Project; patches: Patch[]; inverse: Patch[]; summary: string[]; changed: boolean }
  | { ok: false; error: string; index: number };

/** fields a version snapshot holds and a restore puts back; units, leads and plans are never rolled back */
export const VERSIONED_FIELDS = ["name", "kind", "template", "accent", "theme", "seo", "draft", "pages", "drafts", "locales", "logo", "logoOnDark"] as const;

class OpError extends Error {}
const fail = (m: string): never => { throw new OpError(m); };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
/** the value before this change, without copying (big pages carry images as data URLs) */
const orig = <T,>(v: T): T => (isDraft(v) ? (original(v as never) as T) : v);
const newId = (type: string) => `${type}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type Block = { type: string; props: Record<string, unknown> };

function pageData(d: Project, page: string | undefined, lang: string | undefined): { data: Data; where: string } {
  const sub = page && page !== "home";
  if (sub) {
    if (lang && lang !== d.locale) fail(`further pages only exist in the main language (${d.locale})`);
    const pg = (d.pages ?? []).find((x) => x.id === page || x.slug === page) ?? fail(`page “${page}” not found`);
    return { data: pg.draft, where: `“${pg.title}”` };
  }
  if (lang && lang !== d.locale) {
    if (!(d.locales ?? []).includes(lang)) fail(`the site has no language “${lang}”`);
    d.drafts ??= {};
    d.drafts[lang] ??= clone(d.draft);
    return { data: d.drafts[lang], where: `home (${lang})` };
  }
  return { data: d.draft, where: "home" };
}

function lists(data: Data): Block[][] {
  return [data.content as Block[], ...Object.values((data.zones ?? {}) as Record<string, Block[]>)];
}
function locate(data: Data, id: string): { list: Block[]; index: number; block: Block } {
  for (const list of lists(data)) {
    const index = list.findIndex((b) => b.props.id === id);
    if (index >= 0) return { list, index, block: list[index] };
  }
  return fail(`section “${id}” not found`);
}
function checkFields(reg: BlockRegistry | undefined, type: string, props: Record<string, unknown>) {
  if (!reg) return;
  const r = reg[type] ?? fail(`unknown section type “${type}”`);
  if (r.fields === "*") return;
  const bad = Object.keys(props).filter((k) => k !== "id" && !(r.fields as string[]).includes(k));
  if (bad.length) fail(`${humanize(type)} has no field ${bad.map((b) => `“${b}”`).join(", ")}`);
}
const nameOf = (reg: BlockRegistry | undefined, type: string) => reg?.[type]?.label ?? humanize(type);
const fmt = (v: unknown) => (v === undefined || v === null ? "template default" : String(v));

function applyOne(d: Project, op: Op, reg: BlockRegistry | undefined, defaults: (type: string) => Record<string, unknown>): string[] {
  switch (op.op) {
    case "addBlock": {
      const { data, where } = pageData(d, op.page, op.lang);
      const props = { ...defaults(op.block.type), ...(op.block.props ?? {}) };
      checkFields(reg, op.block.type, props);
      const block = { type: op.block.type, props: { ...props, id: (props.id as string) || newId(op.block.type) } };
      const list = data.content as Block[];
      const at = Math.min(op.index ?? list.length, list.length);
      list.splice(at, 0, block);
      return [`Added ${nameOf(reg, block.type)} on ${where} (position ${at + 1})`];
    }
    case "updateBlock": {
      const { data } = pageData(d, op.page, op.lang);
      const { block } = locate(data, op.id);
      if ("id" in op.props && op.props.id !== op.id) fail("a section's id cannot be changed");
      checkFields(reg, block.type, op.props);
      const changed = Object.keys(op.props).filter((k) => JSON.stringify(block.props[k]) !== JSON.stringify(op.props[k]));
      Object.assign(block.props, op.props);
      return changed.length ? [`${nameOf(reg, block.type)}: ${changed.join(", ")}`] : [];
    }
    case "moveBlock": {
      const { data } = pageData(d, op.page, op.lang);
      const { list, index, block } = locate(data, op.id);
      const to = Math.min(op.to, list.length - 1);
      if (to === index) return [];
      list.splice(index, 1);
      list.splice(to, 0, block);
      return [`Moved ${nameOf(reg, block.type)} from position ${index + 1} to ${to + 1}`];
    }
    case "deleteBlock": {
      const { data } = pageData(d, op.page, op.lang);
      const { list, index, block } = locate(data, op.id);
      list.splice(index, 1);
      return [`Removed ${nameOf(reg, block.type)}`];
    }
    case "duplicateBlock": {
      const { data } = pageData(d, op.page, op.lang);
      const { list, index, block } = locate(data, op.id);
      const copy = clone(block);
      copy.props.id = newId(block.type);
      list.splice(index + 1, 0, copy);
      return [`Duplicated ${nameOf(reg, block.type)}`];
    }
    case "setRootProps": {
      const { data, where } = pageData(d, undefined, op.lang);
      data.root.props = { ...(data.root.props ?? {}), ...op.props };
      if (!op.lang || op.lang === d.locale) if (typeof op.props.template === "string") d.template = op.props.template as Project["template"];
      return [`Site settings (${where}): ${Object.keys(op.props).join(", ")}`];
    }
    case "replacePageData": {
      const sub = op.page && op.page !== "home";
      // op.data is the parsed copy; its strings are shared, not duplicated, so history stays small
      const data = op.data as unknown as Data;
      let before: Data | undefined;
      if (sub) {
        const pg = (d.pages ?? []).find((x) => x.id === op.page) ?? fail(`page “${op.page}” not found`);
        before = orig(pg.draft);
        pg.draft = data;
      } else if (op.lang && op.lang !== d.locale) {
        before = d.drafts?.[op.lang] ? orig(d.drafts[op.lang]) : undefined;
        d.drafts = { ...(d.drafts ?? {}), [op.lang]: data };
      } else {
        before = orig(d.draft);
        d.draft = data;
        const t = (data.root?.props as Record<string, unknown> | undefined)?.template;
        if (typeof t === "string") d.template = t as Project["template"];
      }
      return describeDataDiff(before, data, (t) => nameOf(reg, t));
    }
    case "createPage": {
      const taken = new Set([...(d.pages ?? []).map((x) => x.slug), "legal", "unit", "home", "index"]);
      const base = op.slug ?? (op.title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "page");
      if (op.slug && taken.has(op.slug)) fail(`the address /${op.slug} is already used`);
      let slug = base, n = 2;
      while (taken.has(slug)) slug = `${base}-${n++}`;
      const content = (op.content ?? []) as unknown as Block[];
      content.forEach((b) => checkFields(reg, b.type, b.props));
      const page: SitePage = { id: op.id ?? newId("page"), slug, title: op.title, draft: { root: { props: {} }, content, zones: {} } as unknown as Data, published: null };
      d.pages = [...(d.pages ?? []), page];
      return [`New page “${op.title}” at /${slug}`];
    }
    case "renamePage": {
      const pg = (d.pages ?? []).find((x) => x.id === op.page) ?? fail(`page “${op.page}” not found`);
      const old = pg.title;
      pg.title = op.title;
      return old === op.title ? [] : [`Renamed page “${old}” to “${op.title}”`];
    }
    case "deletePage": {
      const pg = (d.pages ?? []).find((x) => x.id === op.page) ?? fail(`page “${op.page}” not found`);
      d.pages = (d.pages ?? []).filter((x) => x.id !== op.page);
      return [`Deleted page “${pg.title}”`];
    }
    case "setPageSeo": {
      const sub = op.page && op.page !== "home";
      const owner = sub ? (d.pages ?? []).find((x) => x.id === op.page) ?? fail(`page “${op.page}” not found`) : d;
      const seo = { ...(owner.seo ?? {}) } as Record<string, unknown>;
      const out: string[] = [];
      for (const [k, v] of Object.entries(op.seo)) {
        if (v === undefined) continue;
        if (JSON.stringify(seo[k]) === JSON.stringify(v ?? undefined)) continue;
        if (v === null) delete seo[k]; else seo[k] = v;
        out.push(`SEO ${k}`);
      }
      owner.seo = SeoSchema.parse(seo);
      return out.length ? [`${sub ? `“${(owner as SitePage).title}”` : "Home"}: ${out.join(", ")}`] : [];
    }
    case "setThemeTokens": {
      const t = op.tokens;
      const out: string[] = [];
      const theme = (d.theme = { ...(d.theme ?? {}) });
      if (t.primary && t.primary.toLowerCase() !== d.accent.toLowerCase()) { out.push(`Primary colour ${d.accent} → ${t.primary}`); d.accent = t.primary; }
      const group = <K extends "colors" | "fonts">(key: K, label: string) => {
        const patch = t[key] as Record<string, string | null | undefined> | undefined;
        if (!patch) return;
        const cur = { ...((theme[key] as Record<string, string> | undefined) ?? {}) };
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined || cur[k] === (v ?? undefined)) continue;
          out.push(`${label} ${k}: ${fmt(cur[k])} → ${fmt(v)}`);
          if (v === null) delete cur[k]; else cur[k] = v;
        }
        if (Object.keys(cur).length) (theme as Record<string, unknown>)[key] = cur; else delete theme[key];
      };
      group("colors", "Colour");
      group("fonts", "Font");
      for (const k of ["typeScale", "radius", "shadow", "spacing"] as const) {
        const v = t[k];
        if (v === undefined || theme[k] === (v ?? undefined)) continue;
        out.push(`${k === "typeScale" ? "Text size" : humanize(k)}: ${fmt(theme[k])} → ${fmt(v)}`);
        if (v === null) delete theme[k]; else (theme as Record<string, unknown>)[k] = v;
      }
      return out;
    }
    case "setLocales": {
      const next = [...new Set(op.locales.filter((l) => l !== d.locale))];
      const cur = d.locales ?? [];
      if (JSON.stringify(cur) === JSON.stringify(next)) return [];
      const added = next.filter((l) => !cur.includes(l)), removed = cur.filter((l) => !next.includes(l));
      d.locales = next;
      return [...added.map((l) => `Added language ${l}`), ...removed.map((l) => `Removed language ${l} (its page copy is kept)`)];
    }
    case "setSiteFields": {
      const out: string[] = [];
      if (op.fields.name && op.fields.name !== d.name) { out.push(`Site name “${d.name}” → “${op.fields.name}”`); d.name = op.fields.name; }
      if (op.fields.kind && op.fields.kind !== d.kind) { out.push(`Site type → ${op.fields.kind}`); d.kind = op.fields.kind; }
      return out;
    }
    case "restoreVersion": {
      const s = op.snapshot as Record<string, unknown>;
      for (const k of VERSIONED_FIELDS) {
        if (k in s) (d as unknown as Record<string, unknown>)[k] = clone(s[k]);
        else delete (d as unknown as Record<string, unknown>)[k];
      }
      PageDataSchema.parse(d.draft);
      return [`Restored version “${op.label}”`];
    }
  }
}

export interface ApplyOptions {
  registry?: BlockRegistry;
  /** default props of a block type, used by addBlock */
  defaults?: (type: string) => Record<string, unknown>;
}

/** validates and applies `ops` in order; any failure leaves the project untouched */
export function applyOps(project: Project, ops: unknown[], opt: ApplyOptions = {}): ApplyResult {
  const parsed: Op[] = [];
  for (let i = 0; i < ops.length; i++) {
    const r = OpSchema.safeParse(ops[i]);
    if (!r.success) return { ok: false, index: i, error: r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") };
    parsed.push(r.data);
  }
  const summary: string[] = [];
  let index = 0;
  try {
    const [next, patches, inverse] = produceWithPatches(project, (d) => {
      for (index = 0; index < parsed.length; index++) summary.push(...applyOne(d as Project, parsed[index], opt.registry, opt.defaults ?? (() => ({}))));
    });
    return { ok: true, project: next, patches, inverse, summary, changed: patches.length > 0 };
  } catch (e) {
    if (e instanceof OpError || e instanceof z.ZodError) return { ok: false, index, error: e.message };
    throw e;
  }
}
