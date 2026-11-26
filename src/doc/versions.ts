"use client";
import { useCallback, useEffect, useState } from "react";
import { getProject, loadAssets, putAssets, req } from "@/lib/store";
import type { Project } from "@/lib/types";
import { dehydrate, rehydrate } from "./assets";
import { commit, type CommitResult } from "./commit";
import { VERSIONED_FIELDS } from "./ops";

/**
 * Restore points: a copy of the website part of a project (pages, theme, texts; not units, plans or leads).
 * Images are references into the asset store, so a version costs a few KB.
 */
export interface Version { id: string; projectId: string; at: number; label: string; auto: boolean; snapshot: Record<string, unknown> }

const AUTO_KEEP = 30;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

export const snapshotOf = (p: Project) => Object.fromEntries(VERSIONED_FIELDS.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]));

export async function listVersions(projectId: string): Promise<Version[]> {
  const all = await req<Version[]>("versions", "readonly", (s) => s.getAll() as IDBRequest<Version[]>);
  return all.filter((v) => v.projectId === projectId).sort((a, b) => b.at - a.at);
}

export async function saveVersion(projectId: string, label: string, auto = false): Promise<Version | null> {
  const p = getProject(projectId);
  if (!p) return null;
  const { value, assets } = await dehydrate(snapshotOf(p));
  await putAssets(assets);
  const v: Version = { id: `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, projectId, at: Date.now(), label, auto, snapshot: value };
  await req("versions", "readwrite", (s) => s.put(v, v.id));
  if (auto) {
    const old = (await listVersions(projectId)).filter((x) => x.auto).slice(AUTO_KEEP);
    for (const o of old) await req("versions", "readwrite", (s) => s.delete(o.id));
  }
  changed();
  return v;
}

/** one automatic restore point per editing session, unless the last one is very recent */
const sessionDone = new Set<string>();
export async function autoVersion(projectId: string, label: string, minGapMs = 10 * 60_000) {
  // the store may still be loading; the caller runs this again once the project is there
  if (sessionDone.has(projectId + label) || !getProject(projectId)) return;
  sessionDone.add(projectId + label);
  const last = (await listVersions(projectId))[0];
  if (last && Date.now() - last.at < minGapMs) return;
  await saveVersion(projectId, label, true);
}

/** puts a version back as one undoable step; the state before is kept as a version too */
export async function restoreVersion(projectId: string, versionId: string): Promise<CommitResult> {
  const v = (await listVersions(projectId)).find((x) => x.id === versionId);
  if (!v) return { ok: false, error: "version not found" };
  const snapshot = rehydrate(v.snapshot, await loadAssets());
  await saveVersion(projectId, `Before restoring “${v.label}”`, true);
  return commit(projectId, [{ op: "restoreVersion", label: v.label, snapshot }], { source: "system", label: `Restored “${v.label}”` });
}

export async function deleteVersion(id: string) {
  await req("versions", "readwrite", (s) => s.delete(id));
  changed();
}

export function useVersions(projectId: string) {
  const [list, setList] = useState<Version[] | null>(null);
  const load = useCallback(() => { listVersions(projectId).then(setList).catch(() => setList([])); }, [projectId]);
  useEffect(() => { load(); listeners.add(load); return () => { listeners.delete(load); }; }, [load]);
  return list;
}
