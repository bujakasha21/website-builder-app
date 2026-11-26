"use client";
import type { Brief } from "./profile";

/** hands the interview over to /new/ai or /new/custom (same tab) */
const KEY = "sb-brief";
export function saveBriefDraft(b: Brief, city: string) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ brief: b, city })); } catch {}
}
export function readBriefDraft(): { brief: Brief; city: string } | null {
  try { const v = sessionStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
export function clearBriefDraft() { try { sessionStorage.removeItem(KEY); } catch {} }
