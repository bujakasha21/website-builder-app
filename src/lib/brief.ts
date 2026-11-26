"use client";
import type { Brief } from "./profile";

/** hands the interview over to /new/ai or /new/custom (same tab) */
const KEY = "sb-brief";
export interface Place { city: string; address: string; zip: string }
// kept in memory for the client-side hop to /new/ai; sessionStorage is the backup for a reload, and a large
// isometry picture may not fit there (quota), so the memory copy comes first
let mem: ({ brief: Brief } & Place) | null = null;
export function saveBriefDraft(b: Brief, place: Place) {
  mem = { brief: b, ...place };
  try { sessionStorage.setItem(KEY, JSON.stringify(mem)); } catch { try { sessionStorage.setItem(KEY, JSON.stringify({ ...mem, brief: { ...b, floorPlans: undefined, isometry: b.isometry?.raster ? undefined : b.isometry } })); } catch {} }
}
export function readBriefDraft(): ({ brief: Brief } & Place) | null {
  if (mem) return mem;
  try { const v = sessionStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
export function clearBriefDraft() { mem = null; try { sessionStorage.removeItem(KEY); } catch {} }
