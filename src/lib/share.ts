import type { Data } from "@puckeditor/core";
import type { Project } from "./types";

type Block = { type: string; props: Record<string, unknown> };

/** the hero image cropped to the 1200×630 link-preview format */
async function cover(src: string): Promise<string> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((ok, no) => { img.onload = () => ok(); img.onerror = () => no(new Error("image")); img.src = src; });
  const W = 1200, H = 630;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  const iw = img.naturalWidth || W, ih = img.naturalHeight || H;
  const k = Math.max(W / iw, H / ih);
  g.drawImage(img, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k);
  return c.toDataURL("image/jpeg", 0.86);
}

/** sends the main image, title and description of a page to the server so shared links show a thumbnail */
export async function syncShare(p: Project, data: Data | null | undefined) {
  if (!data || typeof window === "undefined") return;
  const hero = (data.content as Block[]).find((c) => c.type === "Hero")?.props ?? {};
  const src = typeof hero.image === "string" ? hero.image : "";
  const title = p.name + (p.city ? ` · ${p.city}` : "");
  const description = String(hero.text ?? "").slice(0, 300);
  const sig = `${title}|${description}|${src.length}|${src.slice(-48)}`;
  const key = `sb-share-${p.id}`;
  try { if (localStorage.getItem(key) === sig) return; } catch {}
  let image = "";
  try { if (src) image = await cover(src); } catch {}
  try {
    const r = await fetch(`/api/og/${p.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image, title, description }) });
    if (r.ok) try { localStorage.setItem(key, sig); } catch {}
  } catch {}
}
