"use client";
/**
 * Brand colours from a logo, worked out in code (never guessed by a model): the logo is sampled at 96×96,
 * paper, greys and black are ignored, the remaining pixels are binned by hue and lightness, and the most used
 * distinct colours become the palette. Dark enough to carry white text, so they work as button colours.
 */
const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

function toHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return hex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** removes a white background (flood-filled from the edges only) and crops the empty margin */
function trimLogo(src: HTMLCanvasElement, removeWhite: boolean) {
  const W = src.width, H = src.height;
  const ctx = src.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  const blank = (i: number) => d[i * 4 + 3] < 16 || (removeWhite && d[i * 4] > 242 && d[i * 4 + 1] > 242 && d[i * 4 + 2] > 242);
  const seen = new Uint8Array(W * H), stack: number[] = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i] || !blank(i)) continue;
    seen[i] = 1;
    d[i * 4 + 3] = 0;
    const x = i % W;
    if (x > 0) stack.push(i - 1);
    if (x < W - 1) stack.push(i + 1);
    if (i >= W) stack.push(i - W);
    if (i < W * (H - 1)) stack.push(i + W);
  }
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return src;
  ctx.putImageData(img, 0, 0);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** logo → downscaled PNG + 4 accent colours: the logo's own colours first, then tones that sit well next to them */
/** an SVG has no pixel size of its own in many exports, so it is drawn through an <img> at a size taken from its viewBox */
async function svgBitmap(file: File): Promise<{ bmp: HTMLCanvasElement; src: string }> {
  let text = await file.text();
  const tag = text.match(/<svg[^>]*>/i)?.[0] ?? "";
  const vb = tag.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  const num = (a: string) => parseFloat(tag.match(new RegExp(`\\s${a}\\s*=\\s*["']([\\d.]+)(px)?["']`, "i"))?.[1] ?? "");
  const w0 = num("width") || (vb ? parseFloat(vb[1]) : 0) || 600, h0 = num("height") || (vb ? parseFloat(vb[2]) : 0) || 200;
  if (!/\sxmlns\s*=/.test(tag)) text = text.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  const src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(text);
  const img = new Image();
  await new Promise<void>((ok, no) => { img.onload = () => ok(); img.onerror = () => no(new Error("svg")); img.src = src; });
  const k = 900 / Math.max(w0, h0);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return { bmp: c, src };
}

/** `palette` starts with the `fromLogo` colours actually found in the logo; the rest are matching suggestions */
export async function readLogo(file: File): Promise<{ src: string; palette: string[]; onDark: boolean; fromLogo: number }> {
  const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  const svg = isSvg ? await svgBitmap(file) : null;
  const bmp: { width: number; height: number } & CanvasImageSource = svg ? svg.bmp : await createImageBitmap(file);
  const k = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
  const big = document.createElement("canvas");
  big.width = Math.round(bmp.width * k); big.height = Math.round(bmp.height * k);
  big.getContext("2d")!.drawImage(bmp, 0, 0, big.width, big.height);
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, 96, 96);
  const d = g.getImageData(0, 0, 96, 96).data;
  // white lettering on a transparent background needs a dark surface to be visible
  let clear = 0, opaque = 0, light = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) { clear++; continue; }
    opaque++;
    if (d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 225) light++;
  }
  const transparentBg = clear > (d.length / 4) * 0.1;
  const onDark = transparentBg && opaque > 0 && light / opaque > 0.1;
  const bins = new Map<number, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const [h, s, l] = toHsl(d[i], d[i + 1], d[i + 2]);
    if (l > 0.9 || s < 0.22 || l < 0.08) continue; // paper, greys and black are not brand colours
    const key = Math.round(h / 18) * 10 + Math.min(2, Math.floor(l * 3));
    const e = bins.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    e.r += d[i]; e.g += d[i + 1]; e.b += d[i + 2]; e.n++;
    bins.set(key, e);
  }
  const found: [number, number, number][] = [];
  for (const e of [...bins.values()].sort((x, y) => y.n - x.n)) {
    if (e.n < 12) break;
    const hsl = toHsl(e.r / e.n, e.g / e.n, e.b / e.n);
    if (found.some((f) => hueGap(f[0], hsl[0]) < 28 && Math.abs(f[2] - hsl[2]) < 0.22)) continue;
    found.push(hsl);
    if (found.length === 3) break;
  }
  // an accent carries white text, so keep it dark enough
  const usable = ([h, s, l]: [number, number, number]) => fromHsl(h, Math.min(s, 0.78), Math.min(l, 0.4));
  const out = found.map(usable);
  const base = found[0];
  const extras = base
    ? [fromHsl(base[0], Math.min(base[1], 0.6), 0.2), fromHsl((base[0] + 28) % 360, Math.min(base[1], 0.5) * 0.8, 0.32), fromHsl((base[0] + 180) % 360, 0.28, 0.3), "#2b2926"]
    : ["#2b2926", "#1f5c4a", "#1d3f72", "#7a2e2e"];
  for (const x of extras) if (out.length < 4 && !out.includes(x)) out.push(x);
  // an SVG stays a vector so it is sharp at any size
  return { src: svg ? svg.src : trimLogo(big, !transparentBg).toDataURL("image/png"), palette: out, onDark, fromLogo: found.length };
}
