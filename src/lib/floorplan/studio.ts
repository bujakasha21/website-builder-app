"use client";
/**
 * Floor plan reading as in the colleague's "streamnow Studio" (ported 1:1 from its analysePlan / cleanPlanCanvas):
 * the plan picture is straightened, only long horizontal and vertical strokes are kept (wall contours; text,
 * hatching, door arcs and dimension lines drop out), the two contour lines of a wall are merged into one solid
 * wall, the biggest wall network is the flat, and a flood fill from outside (door openings bridged) gives the
 * inside. From that come a clean 2D picture (parquet floor, dark walls with a soft shadow) and a small grid of
 * wall and floor rectangles for the 3D model.
 */

export const FLOORS = { "Eiche hell": "#E2C9A0", "Eiche geräuchert": "#A88563", Nussbaum: "#8A5E3F", Sichtbeton: "#A9A6A0" } as const;
export type FloorKey = keyof typeof FLOORS;

export interface StudioResult {
  /** clean 2D picture (PNG data URL), cropped to the flat */
  clean: string;
  /** which of the three detection settings made it; "Neu generieren" moves to the next */
  variant: number;
  floor: FloorKey;
  /** grid for the 3D model: rectangles [x, y, w, h] in cells of `cell` analysis pixels */
  grid: { gw: number; gh: number; walls: number[][]; floors: number[][] };
  /** metres per grid cell when the plan's scale is known, else 0 (the 3D then assumes a 13 m wide flat, like Studio) */
  mpp: number;
  /** the part of the original page the clean picture shows (0–1), so both can be compared on top of each other */
  crop: [number, number, number, number];
  /** clean picture size in px */
  size: [number, number];
  at: number;
}

export interface Analysis { W: number; H: number; wall: Uint8Array; inside: Uint8Array; bbox: [number, number, number, number]; r: number }

const canvas = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

/** a picture (data URL or URL) on a canvas, longest side at most 1700 px like in Studio */
export async function imageToCanvas(src: string): Promise<HTMLCanvasElement> {
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const sc = Math.min(1, 1700 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = canvas(img.naturalWidth * sc, img.naturalHeight * sc);
  const x = c.getContext("2d")!;
  x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** straightens a scanned plan that is up to ±4° off, by the angle where the dark pixels line up best */
export function deskewCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const N = 700, sc = Math.min(1, N / Math.max(src.width, src.height)), W = Math.round(src.width * sc), H = Math.round(src.height * sc);
  const c = canvas(W, H), x = c.getContext("2d", { willReadFrequently: true })!;
  x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); x.drawImage(src, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data, pts: number[] = [];
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { const i = (y * W + xx) * 4, r = d[i], g = d[i + 1], b = d[i + 2]; if (Math.max(r, g, b) - Math.min(r, g, b) < 55 && (r * 299 + g * 587 + b * 114) / 1000 < 120) pts.push(xx, y); }
  if (pts.length < 400) return src;
  const step = Math.max(2, Math.floor(pts.length / 2 / 30000)) * 2;
  let best = -1, bestA = 0;
  for (let a = -4; a <= 4.001; a += 0.1) {
    const t = (a * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t), hy = new Float32Array(H + W + 2), hx = new Float32Array(H + W + 2);
    for (let k = 0; k < pts.length; k += step) { const px = pts[k], py = pts[k + 1]; hy[Math.round(py * cs - px * sn) + W] += 1; hx[Math.round(px * cs + py * sn) + H] += 1; }
    let s2 = 0; for (let k = 0; k < hy.length; k++) s2 += hy[k] * hy[k] + hx[k] * hx[k];
    if (s2 > best) { best = s2; bestA = a; }
  }
  if (Math.abs(bestA) < 0.05) return src;
  const o = canvas(src.width, src.height), ox = o.getContext("2d")!;
  ox.fillStyle = "#fff"; ox.fillRect(0, 0, o.width, o.height);
  ox.translate(o.width / 2, o.height / 2); ox.rotate((-bestA * Math.PI) / 180); ox.drawImage(src, -src.width / 2, -src.height / 2);
  return o;
}

/** binary dilation (isMin false) or erosion (isMin true) with a square of radius `rad`, separable */
export function morph(a: Uint8Array, W: number, H: number, rad: number, isMin: boolean): Uint8Array {
  const n = W * H, t = new Uint8Array(n), o = new Uint8Array(n);
  for (let y = 0; y < H; y++) {
    const row = y * W; let cnt = 0;
    for (let x = 0; x < Math.min(W, rad); x++) cnt += a[row + x];
    for (let x = 0; x < W; x++) { const add = x + rad; if (add < W) cnt += a[row + add]; const rem = x - rad - 1; if (rem >= 0) cnt -= a[row + rem]; const win = Math.min(W - 1, x + rad) - Math.max(0, x - rad) + 1; t[row + x] = isMin ? (cnt === win ? 1 : 0) : cnt > 0 ? 1 : 0; }
  }
  for (let x = 0; x < W; x++) {
    let cnt = 0;
    for (let y = 0; y < Math.min(H, rad); y++) cnt += t[y * W + x];
    for (let y = 0; y < H; y++) { const add = y + rad; if (add < H) cnt += t[add * W + x]; const rem = y - rad - 1; if (rem >= 0) cnt -= t[rem * W + x]; const win = Math.min(H - 1, y + rad) - Math.max(0, y - rad) + 1; o[y * W + x] = isMin ? (cnt === win ? 1 : 0) : cnt > 0 ? 1 : 0; }
  }
  return o;
}

/** walls and inside of the flat; null when no wall network is found. `variant` 0–2 changes the minimum stroke length */
export function analysePlan(src0: HTMLCanvasElement, variant = 0): Analysis | null {
  const src = deskewCanvas(src0);
  const N = 1000, sc = Math.min(1, N / Math.max(src.width, src.height)), W = Math.round(src.width * sc), H = Math.round(src.height * sc), n = W * H;
  const c = canvas(W, H), x = c.getContext("2d", { willReadFrequently: true })!;
  x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); x.drawImage(src, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data, L = new Float32Array(n);
  for (let i = 0; i < n; i++) { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], sat = Math.max(r, g, b) - Math.min(r, g, b); L[i] = sat > 55 ? 255 : (r * 299 + g * 587 + b * 114) / 1000; }
  // adaptive threshold against the local mean (integral image), so grey scans and coloured plans work too
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 1; y <= H; y++) { let row = 0; for (let xx = 1; xx <= W; xx++) { row += L[(y - 1) * W + xx - 1]; I[y * (W + 1) + xx] = I[(y - 1) * (W + 1) + xx] + row; } }
  const R0 = 18, dark = new Uint8Array(n); let dc = 0;
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - R0), y1 = Math.min(H, y + R0 + 1);
    for (let xx = 0; xx < W; xx++) {
      const x0 = Math.max(0, xx - R0), x1 = Math.min(W, xx + R0 + 1), bg = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0)), i = y * W + xx;
      if (L[i] < bg - 22 || L[i] < 70) { dark[i] = 1; dc++; }
    }
  }
  if (dc < n * 0.002) return null;
  // 1. keep only long horizontal and vertical strokes: wall contours
  const Lmin = Math.max(18, Math.round(Math.max(W, H) * [0.026, 0.02, 0.034][variant % 3])), line = new Uint8Array(n);
  const dh = new Uint8Array(n), dv = new Uint8Array(n);
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { const i = y * W + xx; if (!dark[i]) continue; dh[i] = dv[i] = 1; if (y > 0) dh[i - W] = 1; if (y < H - 1) dh[i + W] = 1; if (xx > 0) dv[i - 1] = 1; if (xx < W - 1) dv[i + 1] = 1; }
  for (let y = 0; y < H; y++) { let s = -1; for (let xx = 0; xx <= W; xx++) { const on = xx < W && dh[y * W + xx]; if (on && s < 0) s = xx; if (!on && s >= 0) { if (xx - s >= Lmin) for (let k = s; k < xx; k++) line[y * W + k] = 1; s = -1; } } }
  for (let xx = 0; xx < W; xx++) { let s = -1; for (let y = 0; y <= H; y++) { const on = y < H && dv[y * W + xx]; if (on && s < 0) s = y; if (!on && s >= 0) { if (y - s >= Lmin) for (let k = s; k < y; k++) line[k * W + xx] = 1; s = -1; } } }
  // 2. merge the two contour lines of a wall into one solid wall, then drop single thin lines
  const gap = Math.max(4, Math.round(Math.max(W, H) / 170));
  let wall = morph(morph(line, W, H, gap, false), W, H, gap, true);
  wall = morph(morph(wall, W, H, 2, true), W, H, 2, false);
  // 3. components: the biggest network is the flat; keep parts inside its frame
  const lab = new Int32Array(n).fill(-1), comps: { pts: number[]; x0: number; x1: number; y0: number; y1: number }[] = [], stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!wall[i] || lab[i] >= 0) continue;
    const id = comps.length, pts: number[] = []; stack.push(i); lab[i] = id; let x0 = W, x1 = 0, y0 = H, y1 = 0;
    while (stack.length) {
      const j = stack.pop()!; pts.push(j); const jx = j % W, jy = (j / W) | 0;
      if (jx < x0) x0 = jx; if (jx > x1) x1 = jx; if (jy < y0) y0 = jy; if (jy > y1) y1 = jy;
      if (jx > 0 && wall[j - 1] && lab[j - 1] < 0) { lab[j - 1] = id; stack.push(j - 1); }
      if (jx < W - 1 && wall[j + 1] && lab[j + 1] < 0) { lab[j + 1] = id; stack.push(j + 1); }
      if (j >= W && wall[j - W] && lab[j - W] < 0) { lab[j - W] = id; stack.push(j - W); }
      if (j < n - W && wall[j + W] && lab[j + W] < 0) { lab[j + W] = id; stack.push(j + W); }
    }
    comps.push({ pts, x0, x1, y0, y1 });
  }
  if (!comps.length) return null;
  const main = comps.reduce((a, b2) => (b2.pts.length > a.pts.length ? b2 : a));
  const mw = main.x1 - main.x0, mh = main.y1 - main.y0, pad = Math.max(mw, mh) * 0.04;
  const totalLen = comps.reduce((a2, cp) => a2 + (cp.pts.length >= main.pts.length * 0.03 ? Math.max(cp.x1 - cp.x0, cp.y1 - cp.y0) : 0), 0);
  if (totalLen < Math.max(W, H) * 0.25) return null;
  const keep = new Uint8Array(n), minArea = Math.max(40, main.pts.length * 0.01);
  let bx0 = main.x0, bx1 = main.x1, by0 = main.y0, by1 = main.y1;
  for (const cp of comps) {
    const cx = (cp.x0 + cp.x1) / 2, cy = (cp.y0 + cp.y1) / 2;
    if (cp === main || cp.pts.length >= Math.max(minArea, main.pts.length * 0.03) || (cp.pts.length >= minArea && cx > main.x0 - pad && cx < main.x1 + pad && cy > main.y0 - pad && cy < main.y1 + pad)) {
      for (const j of cp.pts) keep[j] = 1;
      bx0 = Math.min(bx0, cp.x0); bx1 = Math.max(bx1, cp.x1); by0 = Math.min(by0, cp.y0); by1 = Math.max(by1, cp.y1);
    }
  }
  wall = keep;
  // 4. inside = not reachable from outside without crossing walls (door openings bridged by thick walls), then grown back to the wall face
  const R2 = Math.max(gap * 3, Math.round(Math.max(bx1 - bx0, by1 - by0) * 0.06)), barrier = morph(wall, W, H, R2, false), out = new Uint8Array(n), q: number[] = [];
  for (let xx = 0; xx < W; xx++) q.push(xx, (H - 1) * W + xx);
  for (let yy = 0; yy < H; yy++) q.push(yy * W, yy * W + W - 1);
  while (q.length) { const j = q.pop()!; if (out[j] || barrier[j]) continue; out[j] = 1; const jx = j % W; if (jx > 0) q.push(j - 1); if (jx < W - 1) q.push(j + 1); if (j >= W) q.push(j - W); if (j < n - W) q.push(j + W); }
  const dist = new Int16Array(n).fill(-1); let fr: number[] = [];
  for (let i = 0; i < n; i++) if (out[i]) { dist[i] = 0; fr.push(i); }
  for (let k = 0; k < R2 + 2 && fr.length; k++) {
    const nx: number[] = [];
    for (const j of fr) { const jx = j % W; for (const m of [jx > 0 ? j - 1 : -1, jx < W - 1 ? j + 1 : -1, j >= W ? j - W : -1, j < n - W ? j + W : -1]) { if (m < 0 || dist[m] >= 0 || wall[m]) continue; dist[m] = k + 1; out[m] = 1; nx.push(m); } }
    fr = nx;
  }
  const inside = new Uint8Array(n); let ci = 0;
  for (let i = 0; i < n; i++) if (!out[i] && !wall[i]) { inside[i] = 1; ci++; }
  if (ci < (bx1 - bx0) * (by1 - by0) * 0.25) { inside.fill(0); for (let yy = by0; yy <= by1; yy++) for (let xx = bx0; xx <= bx1; xx++) { const i = yy * W + xx; if (!wall[i]) inside[i] = 1; } }
  return { W, H, wall, inside, bbox: [Math.max(0, bx0 - 6), Math.max(0, by0 - 6), Math.min(W - 1, bx1 + 6), Math.min(H - 1, by1 + 6)], r: gap };
}

/** seeded random numbers, so a floor looks the same every time */
const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** parquet (or smooth concrete) texture in the floor colour: rows of planks with varying tone and dark joints */
export function floorTexture(hex: string, size = 512): HTMLCanvasElement {
  const c = canvas(size, size), g = c.getContext("2d")!, [r0, g0, b0] = rgb(hex);
  if (hex === FLOORS.Sichtbeton) {
    g.fillStyle = hex; g.fillRect(0, 0, size, size);
    const rnd = rng(7);
    for (let i = 0; i < 2600; i++) { const v = (rnd() - 0.5) * 30; g.fillStyle = `rgba(${r0 + v | 0},${g0 + v | 0},${b0 + v | 0},.35)`; g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 3, 1 + rnd() * 3); }
    return c;
  }
  const rows = 8, rh = size / rows, rnd = rng(1234);
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * size * 0.5;
    while (x < size) {
      const len = size * (0.35 + rnd() * 0.4), tone = 0.9 + rnd() * 0.16, warm = (rnd() - 0.5) * 0.08;
      g.fillStyle = `rgb(${Math.min(255, r0 * tone * (1 + warm)) | 0},${Math.min(255, g0 * tone) | 0},${Math.min(255, b0 * tone * (1 - warm)) | 0})`;
      g.fillRect(x, r * rh, len, rh);
      // grain
      for (let k = 0; k < 7; k++) { g.strokeStyle = `rgba(0,0,0,${0.025 + rnd() * 0.04})`; g.lineWidth = 0.6 + rnd(); const yy = r * rh + rnd() * rh; g.beginPath(); g.moveTo(x, yy); g.bezierCurveTo(x + len * 0.3, yy + (rnd() - 0.5) * 6, x + len * 0.7, yy + (rnd() - 0.5) * 6, x + len, yy); g.stroke(); }
      g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(x, r * rh, 1.4, rh);
      x += len;
    }
    g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(0, r * rh, size, 1.4);
  }
  return c;
}

/** clean 2D picture: parquet where the flat is, dark walls with a soft drop shadow, cropped with a white margin */
export const cropOf = (a: Analysis): [number, number, number, number] => {
  const [bx0, by0, bx1, by1] = a.bbox, m = 24, cw = Math.min(a.W, bx1 - bx0 + 2 * m), ch = Math.min(a.H, by1 - by0 + 2 * m), sx = Math.max(0, bx0 - m), sy = Math.max(0, by0 - m);
  return [sx / a.W, sy / a.H, (sx + cw) / a.W, (sy + ch) / a.H];
};

export function cleanPlanCanvas(a: Analysis, floorHex: string): HTMLCanvasElement {
  const { W, H, wall, inside } = a, [bx0, by0, bx1, by1] = a.bbox, m = 24;
  const fl = canvas(W, H), fx = fl.getContext("2d")!, im = fx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) if (inside[i]) im.data[i * 4 + 3] = 255;
  fx.putImageData(im, 0, 0); fx.globalCompositeOperation = "source-in";
  // about 1.2 m of parquet per tile at a typical plan scale, so the planks read like planks
  const tile = Math.max(60, Math.round(Math.max(a.bbox[2] - a.bbox[0], a.bbox[3] - a.bbox[1]) / 9));
  const small = canvas(tile, tile); small.getContext("2d")!.drawImage(floorTexture(floorHex), 0, 0, tile, tile);
  fx.fillStyle = fx.createPattern(small, "repeat")!; fx.fillRect(0, 0, W, H);
  const wl = canvas(W, H), wx = wl.getContext("2d")!, wi = wx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) if (wall[i]) { wi.data[i * 4] = 42; wi.data[i * 4 + 1] = 42; wi.data[i * 4 + 2] = 44; wi.data[i * 4 + 3] = 255; }
  wx.putImageData(wi, 0, 0);
  const cw = Math.min(W, bx1 - bx0 + 2 * m), ch = Math.min(H, by1 - by0 + 2 * m), sx = Math.max(0, bx0 - m), sy = Math.max(0, by0 - m);
  const o = canvas(cw, ch), ox = o.getContext("2d")!;
  ox.fillStyle = "#ffffff"; ox.fillRect(0, 0, cw, ch);
  ox.drawImage(fl, sx, sy, cw, ch, 0, 0, cw, ch);
  ox.shadowColor = "rgba(0,0,0,.28)"; ox.shadowBlur = 6; ox.shadowOffsetY = 2;
  ox.drawImage(wl, sx, sy, cw, ch, 0, 0, cw, ch);
  return o;
}

/** walls and floor as a coarse grid of merged rectangles (about 170 cells across), small enough to store with the plan */
export function gridOf(a: Analysis) {
  const { W, H, wall, inside } = a, [bx0, by0, bx1, by1] = a.bbox;
  const cs = Math.max(2, Math.round(Math.max(bx1 - bx0, by1 - by0) / 170)), gw = Math.ceil((bx1 - bx0 + 1) / cs), gh = Math.ceil((by1 - by0 + 1) / cs);
  const cell = (arr: Uint8Array, gx: number, gy: number, t0: number) => { let c = 0, t = 0; for (let yy = 0; yy < cs; yy++) for (let xx = 0; xx < cs; xx++) { const X = bx0 + gx * cs + xx, Y = by0 + gy * cs + yy; if (X >= W || Y >= H) continue; t++; c += arr[Y * W + X]; } return t > 0 && c / t > t0; };
  const WG = new Uint8Array(gw * gh), FG = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) { const i = gy * gw + gx; WG[i] = cell(wall, gx, gy, 0.4) ? 1 : 0; FG[i] = !WG[i] && cell(inside, gx, gy, 0.35) ? 1 : 0; }
  const rects = (G: Uint8Array) => {
    const used = new Uint8Array(gw * gh), out: number[][] = [];
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x; if (!G[i] || used[i]) continue;
      let ww = 1; while (x + ww < gw && G[i + ww] && !used[i + ww]) ww++;
      let hh = 1;
      outer: while (y + hh < gh) { for (let k = 0; k < ww; k++) { const j = (y + hh) * gw + x + k; if (!G[j] || used[j]) break outer; } hh++; }
      for (let yy = 0; yy < hh; yy++) for (let k = 0; k < ww; k++) used[(y + yy) * gw + x + k] = 1;
      out.push([x, y, ww, hh]);
    }
    return out;
  };
  return { gw, gh, walls: rects(WG), floors: rects(FG), cell: cs };
}

/**
 * The whole Studio step for one plan picture: analyse (with a variant), draw the clean 2D, make the 3D grid.
 * `metersPerUnit` is our plan's real scale (metres for the picture's full width) when it is known.
 */
export async function studioPlan(image: string, opts: { variant?: number; floor?: FloorKey; metersPerUnit?: number; onStep?: (pct: number) => void } = {}): Promise<StudioResult> {
  const step = opts.onStep ?? (() => {});
  const nap = (ms: number) => new Promise((r) => setTimeout(r, ms));
  step(12);
  const c = await imageToCanvas(image);
  step(42); await nap(120);
  const variant = (opts.variant ?? 0) % 3, floor = opts.floor ?? "Eiche hell";
  const an = analysePlan(c, variant);
  if (!an) throw new Error("walls");
  step(78); await nap(120);
  const cc = cleanPlanCanvas(an, FLOORS[floor]), clean = cc.toDataURL("image/png");
  const g = gridOf(an);
  const mpp = opts.metersPerUnit && opts.metersPerUnit > 4 && opts.metersPerUnit < 120 ? opts.metersPerUnit / an.W : 0;
  step(100);
  return { clean, variant, floor, grid: { gw: g.gw, gh: g.gh, walls: g.walls, floors: g.floors }, mpp: mpp * g.cell, crop: cropOf(an), size: [cc.width, cc.height], at: Date.now() };
}

/** the error texts Studio shows, in English */
export const STUDIO_ERRORS: Record<string, string> = {
  format: "This file type cannot be read. Please use a PDF, PNG or JPG.",
  walls: "No walls were found. Is it a floor plan with dark, thick walls? Try “Generate again”.",
  read: "The file could not be read.",
};
