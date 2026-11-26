"use client";
import { fromAi, type Copy } from "./copy";
import { AiCopySchema, type CopyRequest } from "./copy-schema";
import type { Brief } from "./profile";

/** is Claude connected on the server (a key in .env.local)? */
export async function claudeAvailable(): Promise<boolean> {
  try { return !!(await (await fetch("/api/ai/copy")).json()).available; } catch { return false; }
}

/** Claude writes the texts; the answer is checked again here. Returns why not, instead of throwing. */
export async function claudeCopy(b: Brief, city: string): Promise<{ copy: Copy; model: string } | { error: string }> {
  const body: CopyRequest = { kind: b.kind, name: b.name, description: b.description, city: city || undefined, offer: b.offer, vibe: b.vibe, features: b.features };
  try {
    const res = await fetch("/api/ai/copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json();
    if (!res.ok) return { error: j.error ?? `HTTP ${res.status}` };
    const ok = AiCopySchema.safeParse(j.copy);
    if (!ok.success) return { error: "Claude's answer did not have the expected shape." };
    return { copy: fromAi(ok.data), model: String(j.model ?? "claude") };
  } catch {
    return { error: "Could not reach the server." };
  }
}
