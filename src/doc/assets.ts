/**
 * Images are stored once, by content hash, instead of inline in every save and every version.
 * The site document keeps working with data URLs in memory (no block had to change); only what is written
 * to IndexedDB swaps each large data URL for `sbasset:<hash>`, and loading swaps it back.
 */
export const ASSET_PREFIX = "sbasset:";
/** smaller data URLs (icons, tiny SVGs) stay inline */
const MIN_SIZE = 4096;

const hashes = new Map<string, string>();

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
export async function hashOf(dataUrl: string) {
  let h = hashes.get(dataUrl);
  if (!h) { h = await sha256(dataUrl); hashes.set(dataUrl, h); }
  return h;
}

const isAsset = (v: unknown): v is string => typeof v === "string" && v.length >= MIN_SIZE && v.startsWith("data:");

/** every large data URL in `value`, deduplicated */
export function collectDataUrls(value: unknown, out = new Set<string>()): Set<string> {
  if (isAsset(value)) out.add(value);
  else if (Array.isArray(value)) value.forEach((v) => collectDataUrls(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectDataUrls(v, out));
  return out;
}

function mapStrings(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (value && typeof value === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) o[k] = mapStrings(v, fn);
    return o;
  }
  return value;
}

/** copy of `value` with large data URLs replaced by references; `assets` gets hash → data URL for each */
export async function dehydrate<T>(value: T): Promise<{ value: T; assets: Map<string, string> }> {
  const assets = new Map<string, string>();
  const refs = new Map<string, string>();
  for (const url of collectDataUrls(value)) {
    const h = await hashOf(url);
    assets.set(h, url);
    refs.set(url, ASSET_PREFIX + h);
  }
  return { value: (refs.size ? mapStrings(value, (s) => refs.get(s) ?? s) : value) as T, assets };
}

/** puts the data URLs back; unknown references stay as they are (and show as a broken image, not a crash) */
export function rehydrate<T>(value: T, lookup: (hash: string) => string | undefined): T {
  return mapStrings(value, (s) => (s.startsWith(ASSET_PREFIX) ? lookup(s.slice(ASSET_PREFIX.length)) ?? s : s)) as T;
}

export function hasRefs(value: unknown): boolean {
  if (typeof value === "string") return value.startsWith(ASSET_PREFIX);
  if (Array.isArray(value)) return value.some(hasRefs);
  if (value && typeof value === "object") return Object.values(value).some(hasRefs);
  return false;
}
