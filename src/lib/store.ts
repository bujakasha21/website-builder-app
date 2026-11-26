"use client";
import { useSyncExternalStore } from "react";
import type { Project } from "./types";
import { seedProjects } from "./seed";
import { collectDataUrls, dehydrate, hasRefs, rehydrate } from "@/doc/assets";
import { migrateAll } from "@/doc/migrate";

// Preview persistence: everything lives in the browser (IndexedDB), shared across tabs.
interface Db {
  projects: Project[];
}

const DB_NAME = "sitebuilder-preview";
const KEY = "db-v2";
/** the unchanged pre-asset-store copy, written once before the first save in the new format */
const BACKUP_KEY = "db-v2-backup-before-assets";
const DB_VERSION = 2;
let state: Db | null = null;
let loading = false;
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
/** hashes already in the assets store */
const stored = new Set<string>();
let writing: Promise<void> = Promise.resolve();

// one connection per tab: v1 opened a new one on every read and never closed it
let dbp: Promise<IDBDatabase> | null = null;
export function idb(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => { for (const s of ["kv", "assets", "versions"]) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
    r.onsuccess = () => { const d = r.result; d.onversionchange = () => { d.close(); dbp = null; }; res(d); };
    r.onerror = () => { dbp = null; rej(r.error); };
    r.onblocked = () => console.warn("[store] another tab still has the old database open; reload it");
  });
  return dbp;
}
export async function req<T>(store: "kv" | "assets" | "versions", mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await idb();
  return new Promise<T>((res, rej) => {
    const t = d.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => res(r.result);
    t.onerror = () => rej(t.error);
  });
}
const kvGet = <T,>(k: string) => req<T | undefined>("kv", "readonly", (s) => s.get(k) as IDBRequest<T | undefined>);
const kvPut = (k: string, v: unknown) => req("kv", "readwrite", (s) => s.put(v, k));

/** writes the images in `assets` that are not stored yet */
export async function putAssets(assets: Map<string, string>) {
  const fresh = [...assets].filter(([h]) => !stored.has(h));
  if (!fresh.length) return;
  const d = await idb();
  await new Promise<void>((res, rej) => {
    const t = d.transaction("assets", "readwrite");
    for (const [h, url] of fresh) t.objectStore("assets").put(url, h);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
  fresh.forEach(([h]) => stored.add(h));
}
const assetCache = new Map<string, string>();
export async function loadAssets(): Promise<(h: string) => string | undefined> {
  const d = await idb();
  await new Promise<void>((res, rej) => {
    const t = d.transaction("assets");
    const c = t.objectStore("assets").openCursor();
    c.onsuccess = () => { const cur = c.result; if (!cur) return; assetCache.set(String(cur.key), cur.value as string); stored.add(String(cur.key)); cur.continue(); };
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
  return (h) => assetCache.get(h);
}

async function readDb(): Promise<Db | undefined> {
  const raw = await kvGet<Db>(KEY);
  if (!raw) return undefined;
  if (!hasRefs(raw)) {
    // first load after the asset store came in: keep the old blob once, untouched
    if (collectDataUrls(raw).size && !(await kvGet(BACKUP_KEY))) await kvPut(BACKUP_KEY, raw);
    return raw;
  }
  return rehydrate(raw, await loadAssets());
}

function emit() {
  listeners.forEach((l) => l());
}

async function load() {
  if (loading) return;
  loading = true;
  let migrated = false;
  try {
    const db = (await readDb()) ?? { projects: seedProjects() };
    const projects = migrateAll(db.projects);
    migrated = projects.some((p, i) => p !== db.projects[i]);
    state = { projects };
  } catch (e) {
    console.error("[store] could not read the saved projects", e);
    state = { projects: seedProjects() };
  }
  channel = new BroadcastChannel(DB_NAME);
  channel.onmessage = async () => {
    const fresh = await readDb();
    if (fresh) {
      state = { projects: migrateAll(fresh.projects) };
      emit();
    }
  };
  emit();
  if (migrated) persist();
}

function persist() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const snap = state;
    if (!snap) return;
    writing = writing.then(async () => {
      const { value, assets } = await dehydrate(snap);
      await putAssets(assets);
      await kvPut(KEY, value);
      channel?.postMessage("changed");
    }).catch((e) => console.error("[store] save failed", e));
  }, 120);
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!state) load();
  return () => listeners.delete(l);
}

export function useDb(): Db | null {
  return useSyncExternalStore(subscribe, () => state, () => null);
}

export function useProject(id: string | undefined): Project | null | undefined {
  const db = useDb();
  if (!db) return undefined; // loading
  return db.projects.find((p) => p.id === id) ?? null;
}

export function getProject(id: string) {
  return state?.projects.find((p) => p.id === id);
}

export function updateProject(id: string, fn: (p: Project) => Project) {
  if (!state) return;
  state = { projects: state.projects.map((p) => (p.id === id ? fn(p) : p)) };
  emit();
  persist();
}

/** puts a whole project back (undo, redo, restore, operations) */
export function replaceProject(p: Project) {
  if (!state) return;
  state = { projects: state.projects.map((x) => (x.id === p.id ? p : x)) };
  emit();
  persist();
}

export function addProject(p: Project) {
  if (!state) return;
  state = { projects: [p, ...state.projects] };
  emit();
  persist();
}

/** insert or replace; used for the hidden preview / studio projects (ids starting with "__") */
export function upsertProject(p: Project) {
  if (!state) return;
  state = { projects: state.projects.some((x) => x.id === p.id) ? state.projects.map((x) => (x.id === p.id ? p : x)) : [...state.projects, p] };
  emit();
  persist();
}

export function deleteProject(id: string) {
  if (!state) return;
  state = { projects: state.projects.filter((p) => p.id !== id) };
  emit();
  persist();
}

export function resetDemo() {
  state = { projects: seedProjects() };
  emit();
  persist();
}

export const uid = () => Math.random().toString(36).slice(2, 10);
