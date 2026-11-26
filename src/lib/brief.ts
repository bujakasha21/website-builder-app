"use client";
import type { Brief } from "./profile";

/** hands the interview over to /new/ai or /new/custom (same tab) */
const KEY = "sb-brief";
export interface Place { city: string; address: string; zip: string }
export function saveBriefDraft(b: Brief, place: Place) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ brief: b, ...place })); } catch {}
}
export function readBriefDraft(): ({ brief: Brief } & Place) | null {
  try { const v = sessionStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
export function clearBriefDraft() { try { sessionStorage.removeItem(KEY); } catch {} }
