"use client";
import { useSyncExternalStore } from "react";
import type { Project } from "./types";
import { seedProjects } from "./seed";

// Preview persistence: everything lives in the browser (IndexedDB), shared across tabs.
interface Db {
  projects: Project[];
}

const DB_NAME = "sitebuilder-preview";
const KEY = "db-v2";
let state: Db | null = null;
let loading = false;
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(): Promise<Db | undefined> {
  const d = await idb();
  return new Promise((res, rej) => {
    const r = d.transaction("kv").objectStore("kv").get(KEY);
    r.onsuccess = () => res(r.result as Db | undefined);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(v: Db) {
  const d = await idb();
  return new Promise<void>((res, rej) => {
    const t = d.transaction("kv", "readwrite");
    t.objectStore("kv").put(v, KEY);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

function emit() {
  listeners.forEach((l) => l());
}

async function load() {
  if (loading) return;
  loading = true;
  try {
    state = (await idbGet()) ?? { projects: seedProjects() };
  } catch {
    state = { projects: seedProjects() };
  }
  channel = new BroadcastChannel(DB_NAME);
  channel.onmessage = async () => {
    const fresh = await idbGet();
    if (fresh) {
      state = fresh;
      emit();
    }
  };
  emit();
}

function persist() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    if (!state) return;
    await idbPut(state);
    channel?.postMessage("changed");
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
