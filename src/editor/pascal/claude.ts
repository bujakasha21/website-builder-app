"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Data } from "@puckeditor/core";
import { applyToPage } from "@/doc/commit";
import { config } from "@/editor/config";
import type { EditRequest } from "@/lib/edit-schema";
import { pascal as rules } from "./local";
import type { PascalProvider, Proposal } from "./types";

/** what every section type can hold, sent with each request so Claude only uses fields that exist */
let catalog: EditRequest["catalog"] | null = null;
function getCatalog(): EditRequest["catalog"] {
  if (catalog) return catalog;
  const out: EditRequest["catalog"] = {};
  for (const [type, c] of Object.entries(config.components as Record<string, any>)) {
    const fields: Record<string, { type: string; options?: string[] }> = {};
    for (const [name, f] of Object.entries((c.fields ?? {}) as Record<string, any>)) {
      if (f.type === "custom") continue;
      fields[name] = f.type === "array"
        ? { type: `list of {${Object.keys(f.arrayFields ?? {}).join(", ")}}` }
        : { type: f.type, ...(f.options ? { options: f.options.map((o: any) => String(o.value)) } : {}) };
    }
    out[type] = { label: c.label ?? type, fields };
  }
  return (catalog = out);
}

/** the page as Claude sees it: no images, long texts shortened, long lists cut */
function trim(v: unknown, depth = 0): unknown {
  if (typeof v === "string") return v.startsWith("data:") ? "<image>" : v.length > 300 ? v.slice(0, 300) + "…" : v;
  if (Array.isArray(v)) return v.slice(0, 12).map((x) => trim(x, depth + 1));
  if (v && typeof v === "object" && depth < 4) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trim(x, depth + 1)]));
  return v;
}

let available: Promise<boolean> | null = null;
export function claudeEditAvailable() {
  available ??= fetch("/api/ai/edit").then((r) => r.json()).then((j) => !!j.available).catch(() => false);
  return available;
}

/**
 * Pascal with Claude: the sentence goes to /api/ai/edit, the proposed changes come back as command-layer operations,
 * are tried on a copy of the page first, and shown before anything is applied. On the dashboard, or when Claude is
 * unreachable, the rules answer.
 */
export const claudePascal: PascalProvider = {
  id: "claude",
  label: "Claude Opus 5.5 – every change is checked before it is applied",
  async respond(input, ctx): Promise<Proposal> {
    const { project: p, data } = ctx;
    if (!p || !data) return rules.respond(input, ctx);
    const page = (data.content as { type: string; props: Record<string, unknown> }[]).map((b) => ({ id: String(b.props.id), type: b.type, props: trim(b.props) as Record<string, unknown> }));
    const body: EditRequest = { text: input, site: { name: p.name, locale: p.locale, hasLogo: !!p.logo, kind: p.kind }, page, catalog: getCatalog(), selectedId: ctx.selectedId ?? null };
    let j: { reply?: string; ops?: unknown[]; dropped?: string[]; error?: string };
    try {
      const res = await fetch("/api/ai/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
    } catch (e) {
      const fallback = await rules.respond(input, ctx);
      return { ...fallback, reply: `Claude could not help this time (${(e as Error).message}). ${fallback.reply}` };
    }
    const ops = j.ops ?? [];
    if (!ops.length) return { reply: j.reply ?? "I did not find anything to change." };
    const dry = applyToPage(p, data, ops);
    if (!dry.ok) return { reply: `Claude suggested a change I cannot apply safely (${dry.error}), so nothing was changed. Try saying it differently, or change it in the section's fields.` };
    if (!dry.changed) return { reply: "Nothing would change: the page already looks like that." };
    const note = j.dropped?.length ? ` (left out: ${j.dropped.join(", ")})` : "";
    return {
      reply: (j.reply ?? "Here is what I will change.") + note,
      changes: dry.summary,
      // applied to the page as it is when confirmed, with the same checks again
      apply: (current: Data) => { const r = applyToPage(p, current, ops); return r.ok ? r.data : current; },
      confirmLabel: "Do it",
    };
  },
};
