import type { Unit } from "./types";

export interface Isometry {
  /** sanitised SVG markup; every selectable shape carries data-shape="<id>" */
  svg: string;
  /** shape id → unit id */
  map: Record<string, string>;
  shapes: string[];
  /** a picture (PNG/JPG) instead of a drawing: shown as the building, apartments are not clickable on it */
  raster?: { src: string; w: number; h: number };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
/** the markup to draw: the SVG itself, or an SVG frame around the uploaded picture */
export function isoMarkup(iso: Isometry): string {
  if (!iso.raster) return iso.svg;
  const { src, w, h } = iso.raster;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet"><image href="${esc(src)}" width="${w}" height="${h}"/></svg>`;
}

/** an uploaded PNG/JPG isometry; its size is read so it scales like an SVG would */
export async function isoFromImage(file: File): Promise<Isometry> {
  const src = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
  const { w, h } = await new Promise<{ w: number; h: number }>((res, rej) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = rej; i.src = src; });
  return { svg: "", map: {}, shapes: [], raster: { src, w, h } };
}

const SHAPES = "polygon, path, rect, polyline, circle, ellipse";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** reads an uploaded isometric drawing: strips anything executable, tags the shapes, and pre-matches them to units by id */
export function parseIsometry(text: string, units: Unit[]): Isometry {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) throw new Error("not an svg");

  doc.querySelectorAll("script, foreignObject, iframe, object, embed, audio, video, animate, set").forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const a of [...el.attributes]) {
      const v = a.value.trim().toLowerCase();
      if (a.name.toLowerCase().startsWith("on")) el.removeAttribute(a.name);
      else if ((a.name === "href" || a.name === "xlink:href") && !v.startsWith("#") && !v.startsWith("data:image/")) el.removeAttribute(a.name);
      else if (v.includes("javascript:")) el.removeAttribute(a.name);
    }
  });
  doc.querySelectorAll("style").forEach((s) => { s.textContent = (s.textContent ?? "").replace(/@import[^;]+;/g, "").replace(/url\((?!['"]?#)[^)]*\)/g, "none"); });

  // nested <svg> wrappers (SVG.js exports) keep their own viewBox; make the outer one scale
  if (!svg.getAttribute("viewBox")) {
    const w = parseFloat(svg.getAttribute("width") ?? ""), h = parseFloat(svg.getAttribute("height") ?? "");
    if (w && h) svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // apartments are the shapes that have an id (class "flat" on our existing sites); drawings without ids get numbered
  let els = [...doc.querySelectorAll(SHAPES)].filter((e) => !e.closest("defs, clipPath, mask, pattern, symbol"));
  const flats = els.filter((e) => e.classList.contains("flat"));
  const withId = els.filter((e) => e.id);
  els = flats.length ? flats : withId.length ? withId : els;
  const shapes: string[] = [];
  const seen = new Set<string>();
  els.forEach((e, i) => {
    let id = e.id || `shape-${i + 1}`;
    while (seen.has(id)) id += "-x";
    seen.add(id);
    e.setAttribute("data-shape", id);
    shapes.push(id);
  });

  const map: Record<string, string> = {};
  const byRef = new Map(units.map((u) => [norm(u.ref), u.id]));
  for (const id of shapes) {
    const hit = byRef.get(norm(id));
    if (hit) map[id] = hit;
  }
  return { svg: new XMLSerializer().serializeToString(svg), map, shapes };
}
