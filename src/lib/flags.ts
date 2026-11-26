"use client";
/**
 * Feature flags for work in progress. Defaults are what everyone gets; a tester can override one in the browser:
 * localStorage.setItem("sb-flags", JSON.stringify({ history: false }))
 */
export const FLAGS = {
  /** undo/redo across the whole site, History panel with saved versions (phase 1) */
  history: true,
  /** theme tokens in Site settings → Look (phase 1) */
  theme: true,
} as const;
export type Flag = keyof typeof FLAGS;

let overrides: Partial<Record<Flag, boolean>> | null = null;
export function flag(name: Flag): boolean {
  if (overrides === null) {
    try { overrides = JSON.parse(localStorage.getItem("sb-flags") ?? "{}"); } catch { overrides = {}; }
  }
  return overrides?.[name] ?? FLAGS[name];
}
