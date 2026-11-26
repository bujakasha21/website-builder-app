import { applyPatches, type Patch } from "immer";
import type { Project } from "@/lib/types";

export type Source = "user" | "ai" | "system";
export interface Entry { id: string; at: number; source: Source; label: string; summary: string[]; patches: Patch[]; inverse: Patch[]; /** closed: the next edit starts a new step */ sealed?: boolean }

/** user edits closer together than this become one undo step (typing, dragging a slider) */
export const COALESCE_MS = 2500;
const LIMIT = 200;

/**
 * Undo/redo for one project. Pure: it holds patches and hands back the project with them applied,
 * the caller decides where the result goes (the store in the app, a variable in tests).
 */
export class HistoryStack {
  past: Entry[] = [];
  future: Entry[] = [];
  private seq = 0;

  record(e: Omit<Entry, "id" | "at" | "sealed"> & { at?: number }): Entry {
    const at = e.at ?? Date.now();
    const last = this.past[this.past.length - 1];
    this.future = [];
    if (last && !last.sealed && e.source === "user" && last.source === "user" && at - last.at < COALESCE_MS) {
      last.patches = [...last.patches, ...e.patches];
      last.inverse = [...e.inverse, ...last.inverse];
      last.summary = [...new Set([...last.summary, ...e.summary])];
      last.label = last.summary.length ? last.summary.slice(0, 2).join(" · ") + (last.summary.length > 2 ? " …" : "") : last.label;
      last.at = at;
      return last;
    }
    const entry: Entry = { ...e, at, id: `h${++this.seq}` };
    this.past.push(entry);
    if (this.past.length > LIMIT) this.past.shift();
    return entry;
  }

  undo(current: Project): { project: Project; entry: Entry } | null {
    const e = this.past.pop();
    if (!e) return null;
    this.future.push(e);
    return { project: applyPatches(current, e.inverse), entry: e };
  }

  redo(current: Project): { project: Project; entry: Entry } | null {
    const e = this.future.pop();
    if (!e) return null;
    this.past.push(e);
    return { project: applyPatches(current, e.patches), entry: e };
  }

  /** starts a fresh entry even if the next user edit comes quickly (after undo, a restore or an AI turn) */
  seal() { const last = this.past[this.past.length - 1]; if (last) last.sealed = true; }
}
