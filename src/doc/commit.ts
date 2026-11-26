"use client";
import { useSyncExternalStore } from "react";
import { getProject, replaceProject } from "@/lib/store";
import { HistoryStack, type Entry, type Source } from "./history";
import { applyOps, type ApplyOptions } from "./ops";

/**
 * The one way the app changes a site: commit(projectId, ops, who). Validates, applies, saves, records undo.
 * The editor's own saves, Pascal and the site settings all end up here.
 */
const stacks = new Map<string, HistoryStack>();
const listeners = new Set<() => void>();
let version = 0;
const bump = () => { version++; listeners.forEach((l) => l()); };

export const historyOf = (id: string) => { let s = stacks.get(id); if (!s) stacks.set(id, (s = new HistoryStack())); return s; };

let options: ApplyOptions = {};
/** the editor config tells the command layer which blocks and fields exist (kept out of ops.ts so tests need no React) */
export function configureDoc(o: ApplyOptions) { options = o; }

/** runs page operations on a copy of the given page data (dry run), with the same checks as a real commit */
export function applyToPage(project: import("@/lib/types").Project, data: import("@puckeditor/core").Data, ops: unknown[]): { ok: true; data: import("@puckeditor/core").Data; summary: string[]; changed: boolean } | { ok: false; error: string } {
  const r = applyOps({ ...project, draft: data, pages: [], drafts: {} }, ops, options);
  return r.ok ? { ok: true, data: r.project.draft, summary: r.summary, changed: r.changed } : { ok: false, error: r.error };
}

export interface CommitMeta { source: Source; label?: string }
export type CommitResult = { ok: true; changed: boolean; summary: string[]; entry: Entry | null } | { ok: false; error: string };

export function commit(projectId: string, ops: unknown[], meta: CommitMeta): CommitResult {
  const p = getProject(projectId);
  if (!p) return { ok: false, error: "project not found" };
  const r = applyOps(p, ops, options);
  if (!r.ok) {
    console.warn(`[doc] ${meta.source} change refused: ${r.error}`);
    return { ok: false, error: r.error };
  }
  if (!r.changed) return { ok: true, changed: false, summary: [], entry: null };
  replaceProject(r.project);
  const stack = historyOf(projectId);
  const entry = stack.record({ source: meta.source, label: meta.label ?? r.summary[0] ?? "Edit", summary: r.summary, patches: r.patches, inverse: r.inverse });
  if (meta.source !== "user") stack.seal();
  bump();
  return { ok: true, changed: true, summary: r.summary, entry };
}

/** the next editor save comes from Pascal, not from the user's own typing */
const tags = new Map<string, CommitMeta>();
export const tagNextEdit = (projectId: string, meta: CommitMeta) => tags.set(projectId, meta);
export function takeTag(projectId: string): CommitMeta | undefined { const t = tags.get(projectId); tags.delete(projectId); return t; }

function step(projectId: string, dir: "undo" | "redo"): Entry | null {
  const p = getProject(projectId);
  if (!p) return null;
  const stack = historyOf(projectId);
  const r = dir === "undo" ? stack.undo(p) : stack.redo(p);
  if (!r) return null;
  replaceProject(r.project);
  stack.seal();
  bump();
  return r.entry;
}
export const undo = (projectId: string) => step(projectId, "undo");
export const redo = (projectId: string) => step(projectId, "redo");

export function useHistory(projectId: string) {
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version, () => 0);
  const s = historyOf(projectId);
  return { past: s.past, future: s.future, canUndo: s.past.length > 0, canRedo: s.future.length > 0 };
}
