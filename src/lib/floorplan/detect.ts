import type { PlanGroup, Pt, Room, WallRect } from "../types";

/**
 * Floor plan vectorisation, running fully in the browser.
 *
 * 1. binarise the rendered page (dark ink vs. paper)
 * 2. keep only thick strokes = walls (thin lines such as furniture, door arcs, text drop out)
 * 3. close door and window openings so that rooms become closed regions
 * 4. label the enclosed regions = rooms, trace and simplify their outlines
 * 5. read room names / m² from the PDF text layer and derive the drawing scale
 *
 * This is classic image processing, not a trained model: it works well on clean plans
 * with solid walls and needs manual correction on sketchy or heavily decorated plans.
 */

export interface TextItem {
  str: string;
  x: number; // normalized centre
  y: number;
}

export interface DetectResult {
  rooms: Room[];
  groups: PlanGroup[];
  /** the sheet shows several levels of one apartment side by side (maisonette); groups are then levels, not apartments */
  levels?: boolean;
  /** only with globalThis.__FPDEBUG: per-pixel classes (1 wall, 2 door, 3 window, 4 enclosed space) */
  debug?: Uint8Array;
  walls: WallRect[];
  metersPerUnit: number;
  scaleSource: "labels" | "doors" | "walls";
}

function otsu(lum: Uint8Array) {
  const hist = new Float64Array(256);
  for (let i = 0; i < lum.length; i++) hist[lum[i]]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = lum.length - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; thr = t; }
  }
  return Math.min(170, Math.max(90, thr));
}

/** chessboard distance to the nearest 0-pixel */
function distance(mask: Uint8Array, W: number, H: number) {
  const d = new Uint16Array(W * H);
  const INF = 65000;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!mask[i]) { d[i] = 0; continue; }
      if (x === 0 || y === 0 || x === W - 1) { d[i] = 1; continue; }
      d[i] = Math.min(INF, d[i - 1] + 1, d[i - W] + 1, d[i - W - 1] + 1, d[i - W + 1] + 1);
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (!mask[i]) continue;
      if (x === W - 1 || y === H - 1 || x === 0) { d[i] = 1; continue; }
      d[i] = Math.min(d[i], d[i + 1] + 1, d[i + W] + 1, d[i + W + 1] + 1, d[i + W - 1] + 1);
    }
  return d;
}

function dilate(mask: Uint8Array, W: number, H: number, r: number) {
  const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    let last = -1e9;
    for (let x = 0; x < W; x++) { if (mask[y * W + x]) last = x; if (x - last <= r) tmp[y * W + x] = 1; }
    last = 1e9;
    for (let x = W - 1; x >= 0; x--) { if (mask[y * W + x]) last = x; if (last - x <= r) tmp[y * W + x] = 1; }
  }
  for (let x = 0; x < W; x++) {
    let last = -1e9;
    for (let y = 0; y < H; y++) { if (tmp[y * W + x]) last = y; if (y - last <= r) out[y * W + x] = 1; }
    last = 1e9;
    for (let y = H - 1; y >= 0; y--) { if (tmp[y * W + x]) last = y; if (last - y <= r) out[y * W + x] = 1; }
  }
  return out;
}

/** connected components; conn8 for walls, 4 for free space */
function label(mask: Uint8Array, W: number, H: number, conn8: boolean) {
  const lab = new Int32Array(W * H);
  const comps: { size: number; x0: number; y0: number; x1: number; y1: number; border: boolean; first: number }[] = [{ size: 0, x0: 0, y0: 0, x1: 0, y1: 0, border: false, first: 0 }];
  const stack = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || lab[s]) continue;
    const id = comps.length;
    const c = { size: 0, x0: W, y0: H, x1: 0, y1: 0, border: false, first: s };
    let sp = 0;
    stack[sp++] = s;
    lab[s] = id;
    while (sp) {
      const i = stack[--sp];
      const x = i % W, y = (i / W) | 0;
      c.size++;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) c.border = true;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (!conn8 && dx && dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (mask[j] && !lab[j]) { lab[j] = id; stack[sp++] = j; }
        }
    }
    comps.push(c);
  }
  return { lab, comps };
}

function transpose<T extends Uint8Array>(a: T, W: number, H: number): Uint8Array {
  const o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[x * H + y] = a[y * W + x];
  return o;
}

/** closes openings in horizontal walls (scan along rows). returns kind map: 2 door, 3 window */
function closeGapsRows(wall: Uint8Array, faint: Uint8Array, W: number, H: number, T: number, G: number, doorWidths: number[], range: (x: number, y: number) => [number, number, number] | null) {
  const out = new Uint8Array(W * H);
  const vrun = new Uint16Array(W * H);
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H) {
      if (!wall[y * W + x]) { y++; continue; }
      let e = y;
      while (e < H && wall[e * W + x]) e++;
      for (let k = y; k < e; k++) vrun[k * W + x] = Math.min(65535, e - y);
      y = e;
    }
  }
  const hrun = new Uint16Array(W * H);
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (!wall[y * W + x]) { x++; continue; }
      let e = x;
      while (e < W && wall[y * W + e]) e++;
      for (let k = x; k < e; k++) hrun[y * W + k] = Math.min(65535, e - x);
      x = e;
    }
  }
  // a wall "end": the wall runs along the scan direction and stops here
  // (checked at the tip and a few pixels behind it, so 1px nubs at T-junctions do not count)
  const depth = Math.max(2, Math.round(T / 4));
  const isEnd = (i: number, dir: 1 | -1) => {
    const x = i % W, bx = x + dir * depth;
    if (bx < 0 || bx >= W) return false;
    const b = i + dir * depth;
    return vrun[i] <= endMax && hrun[i] >= vrun[i] * 0.8 && wall[b] === 1 && vrun[b] <= endMax;
  };
  const pre = new Int32Array((W + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) pre[y * (W + 1) + x + 1] = pre[y * (W + 1) + x] + faint[y * W + x];
  const endMax = 1.4 * T + 1;
  const seen = new Set<number>();
  for (let y = 0; y < H; y++) {
    let a = -1;
    for (let x = 0; x < W; x++) {
      if (!wall[y * W + x]) continue;
      const gap = x - a - 1;
      if (a >= 0 && gap >= 2) {
        const e1 = isEnd(y * W + a, -1), e2 = isEnd(y * W + x, 1);
        let kind = 0;
        if (e1 && e2) {
          // window: thin lines run across the opening somewhere within the wall band
          for (let yy = Math.max(0, y - T); yy <= Math.min(H - 1, y + T) && !kind; yy++) {
            if (!wall[yy * W + a] || !wall[yy * W + x]) continue;
            const cover = pre[yy * (W + 1) + x] - pre[yy * (W + 1) + a + 1];
            if (cover >= gap * 0.75) kind = 3;
          }
        }
        // door-sized gaps are doors, whatever lies beyond them
        if (!kind && gap <= G && (e1 || e2)) kind = 2;
        // outer wall: an opening between two wall ends that has the building on one side only is a window or terrace door,
        // however it is drawn (glass lines too fine to survive, three door leaves side by side …).
        // "building" = the extent of the wall cluster this wall belongs to, so deep rooms and neighbouring drawings do not confuse it
        // (door frames and posts count as ends here: anything that is thin across the wall line)
        const rg = kind || vrun[y * W + a] > endMax || vrun[y * W + x] > endMax ? null : range(a, y);
        // both ends must be walls of the same drawing, otherwise the space between two drawings would be closed off
        if (rg && gap <= T * 60 && range(x, y)?.[2] === rg[2]) {
          const cols = [a + 1 + (gap >> 2), (a + x) >> 1, x - 1 - (gap >> 2)];
          const clear = (from: number, to: number, step: number) => cols.every((cx) => { for (let yy = from; step > 0 ? yy <= to : yy >= to; yy += step) if (wall[yy * W + cx]) return false; return true; });
          const up = clear(y - 1, Math.max(0, rg[0]), -1), down = clear(y + 1, Math.min(H - 1, rg[1]), 1);
          if (up !== down) kind = 3;
        }
        if (kind) {
          for (let k = a + 1; k < x; k++) out[y * W + k] = kind;
          if (kind === 2) {
            const key = a * 100003 + x;
            if (!seen.has(key)) { seen.add(key); doorWidths.push(gap); }
          }
        }
      }
      a = x;
    }
  }
  return out;
}

function trace(lab: Int32Array, W: number, H: number, id: number, start: number): Pt[] {
  const inR = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && lab[y * W + x] === id;
  const sx = start % W, sy = (start / W) | 0;
  let x = sx, y = sy, d = 0;
  const pts: Pt[] = [[x, y]];
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  for (let guard = 0; guard < W * H * 4; guard++) {
    let R: boolean, L: boolean;
    if (d === 0) { R = inR(x, y); L = inR(x, y - 1); }
    else if (d === 1) { R = inR(x - 1, y); L = inR(x, y); }
    else if (d === 2) { R = inR(x - 1, y - 1); L = inR(x - 1, y); }
    else { R = inR(x, y - 1); L = inR(x - 1, y - 1); }
    let nd = d;
    if (!R) nd = (d + 1) % 4;
    else if (L) nd = (d + 3) % 4;
    if (nd !== d) { pts.push([x, y]); d = nd; }
    x += DX[d];
    y += DY[d];
    if (x === sx && y === sy && d === 0) break;
    if (x === sx && y === sy) { // closing corner, next iteration decides the final turn
      if (pts.length > 2) break;
    }
  }
  return pts;
}

function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1;
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((by - ay) * pts[i][0] - (bx - ax) * pts[i][1] + bx * ay - by * ax) / len;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}

function simplifyClosed(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 5) return pts;
  let far = 0, fd = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > fd) { fd = d; far = i; }
  }
  const a = rdp(pts.slice(0, far + 1), eps);
  const b = rdp([...pts.slice(far), pts[0]], eps);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  // snap nearly axis-aligned edges
  for (let i = 0; i < out.length; i++) {
    const p = out[i], q = out[(i + 1) % out.length];
    if (Math.abs(p[0] - q[0]) <= eps) q[0] = p[0];
    if (Math.abs(p[1] - q[1]) <= eps) q[1] = p[1];
  }
  return out;
}

function rects(kind: Uint8Array, W: number, H: number, k: 1 | 2 | 3): WallRect[] {
  const out: WallRect[] = [];
  let open = new Map<number, { x: number; y: number; w: number; h: number }>();
  for (let y = 0; y <= H; y++) {
    const next = new Map<number, { x: number; y: number; w: number; h: number }>();
    if (y < H) {
      let x = 0;
      while (x < W) {
        if (kind[y * W + x] !== k) { x++; continue; }
        let e = x;
        while (e < W && kind[y * W + e] === k) e++;
        const key = x * 8192 + e;
        const prev = open.get(key);
        if (prev) { prev.h++; next.set(key, prev); open.delete(key); }
        else next.set(key, { x, y, w: e - x, h: 1 });
        x = e;
      }
    }
    for (const r of open.values()) out.push([r.x / W, r.y / H, r.w / W, r.h / H, k]);
    open = next;
  }
  return out;
}

export function detectPlan(img: ImageData, texts: TextItem[]): DetectResult {
  const W = img.width, H = img.height, N = W * H;
  const lum = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const a = img.data[i * 4 + 3] / 255;
    lum[i] = Math.round((0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2]) * a + 255 * (1 - a));
  }
  const thr = otsu(lum);
  let ink = new Uint8Array(N);
  const faint = new Uint8Array(N);
  let inkCount = 0;
  for (let i = 0; i < N; i++) {
    if (lum[i] < thr) { ink[i] = 1; inkCount++; }
    if (lum[i] < 236) faint[i] = 1;
  }

  let dt = distance(ink, W, H);
  let thick = 0;
  for (let i = 0; i < N; i++) if (dt[i] >= 2) thick++;
  if (thick < inkCount * 0.12) {
    // walls drawn as outlines: fill thin enclosed slivers so they become solid
    const white = new Uint8Array(N);
    for (let i = 0; i < N; i++) white[i] = ink[i] ? 0 : 1;
    const wd = distance(white, W, H);
    const { lab, comps } = label(white, W, H, false);
    const maxD = new Uint16Array(comps.length);
    for (let i = 0; i < N; i++) if (lab[i] && wd[i] > maxD[lab[i]]) maxD[lab[i]] = wd[i];
    const lim = Math.max(3, Math.round(Math.min(W, H) * 0.008));
    const filled = ink.slice();
    for (let i = 0; i < N; i++) if (lab[i] && !comps[lab[i]].border && maxD[lab[i]] <= lim) filled[i] = 1;
    ink = filled;
    dt = distance(ink, W, H);
  }

  // big solid areas (coloured footer bands, table rows, logos) are not walls: take them out before measuring.
  // walls make up most of the stroke outline, so their half-thickness is where the thickness histogram drops off
  {
    const h0 = new Uint32Array(256);
    for (let i = 0; i < N; i++) if (dt[i] >= 2) h0[Math.min(255, dt[i])]++;
    let hp0 = 2;
    // last sharp drop that still carries a good share of all strokes = thickest real wall
    for (let v = 3; v < 256; v++) if (h0[v] < h0[v - 1] * 0.62 && h0[v - 1] >= h0[2] * 0.25) hp0 = v - 1;
    const limit = Math.max(12, Math.round(hp0 * 3));
    const fat = new Uint8Array(N);
    let any = false;
    for (let i = 0; i < N; i++) if (dt[i] >= limit) { fat[i] = 1; any = true; }
    if (any) {
      const blob = dilate(fat, W, H, limit + 2);
      for (let i = 0; i < N; i++) if (blob[i]) { ink[i] = 0; faint[i] = 0; }
      dt = distance(ink, W, H);
    }
  }

  // wall thickness estimate
  const hist = new Uint32Array(256);
  let cnt = 0;
  for (let i = 0; i < N; i++) if (dt[i] >= 2) { hist[Math.min(255, dt[i])]++; cnt++; }
  let hp = 2, acc = 0;
  for (let v = 2; v < 256; v++) { acc += hist[v]; if (acc >= cnt * 0.9) { hp = v; break; } }
  const T = Math.max(3, hp * 2);
  const c = Math.max(2, Math.floor(hp * 0.4));

  const core = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (dt[i] >= c) core[i] = 1;
  const grown = dilate(core, W, H, c);
  let wall = new Uint8Array(N);
  for (let i = 0; i < N; i++) wall[i] = grown[i] & ink[i];

  // drop specks, logos and stray thick bits away from the building
  {
    const { lab, comps } = label(wall, W, H, true);
    let big = 0;
    for (let i = 1; i < comps.length; i++) if (!big || comps[i].size > comps[big].size) big = i;
    if (!big) return { rooms: [], groups: [], walls: [], metersPerUnit: 10, scaleSource: "walls" };
    const keep = comps.map((k, i) => i > 0 && (Math.max(k.x1 - k.x0, k.y1 - k.y0) >= T * 1.5 || k.size >= T * T * 1.5));
    const w2 = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (lab[i] && keep[lab[i]]) w2[i] = 1;
    wall = w2;
  }
  let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (wall[y * W + x]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;

  // openings
  const G = Math.min(T * 6, Math.min(bw, bh) * 0.18);
  const doors: number[] = [];
  // wall clusters: the walls of one drawing, joined across door-sized gaps
  const clus = label(dilate(wall, W, H, T * 3), W, H, true);
  const gh = closeGapsRows(wall, faint, W, H, T, G, doors, (x, y) => { const k = clus.comps[clus.lab[y * W + x]]; return k && clus.lab[y * W + x] ? [k.y0, k.y1, clus.lab[y * W + x]] : null; });
  const gvT = closeGapsRows(transpose(wall, W, H), transpose(faint, W, H), H, W, T, G, doors, (xT, yT) => { const id = clus.lab[xT * W + yT]; const k = clus.comps[id]; return id && k ? [k.x0, k.x1, id] : null; });
  const kind = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      kind[i] = wall[i] ? 1 : gh[i] || gvT[x * H + y];
    }

  // enclosed free regions are room candidates
  const free = new Uint8Array(N);
  for (let i = 0; i < N; i++) free[i] = kind[i] ? 0 : 1;
  const { lab, comps } = label(free, W, H, false);

  const debug = (globalThis as { __FPDEBUG?: boolean }).__FPDEBUG ? kind.map((k, i) => k || (lab[i] && !comps[lab[i]].border ? 4 : 0)) : undefined;

  // text layer → labels (name + m²) with their position
  type Seed = { comp: number; x: number; y: number; name: string; area?: number };
  const AREA = /(\d{1,3}(?:[.,]\d{1,2})?)\s*m\s*[²2]?(?![A-Za-z])/;
  const items = texts.map((t) => {
    const x = Math.round(t.x * W), y = Math.round(t.y * H);
    const inside = x >= 0 && y >= 0 && x < W && y < H;
    const comp = inside ? lab[y * W + x] : 0;
    const m = t.str.match(AREA);
    const area = m ? parseFloat(m[1].replace(",", ".")) : undefined;
    const rest = t.str.replace(AREA, "").trim();
    return { x, y, comp, area: area && area > 0.5 ? area : undefined, name: /[A-Za-zÀ-ÿ]{2,}/.test(rest) && rest.length < 40 ? rest : "" };
  });
  const seedsOf = new Map<number, Seed[]>();
  const usable = (c: number) => c > 0 && !comps[c].border;
  const used = new Set<number>();
  items.forEach((it, i) => {
    if (!it.area || !usable(it.comp)) return;
    let name = it.name, nx = it.x, ny = it.y;
    if (!name) {
      // the name normally sits right above its area
      let best = -1, bd = Math.max(W, H) * 0.05;
      items.forEach((o, j) => { if (j === i || used.has(j) || !o.name || o.area || o.comp !== it.comp) return; const d = Math.hypot(o.x - it.x, (o.y - it.y) * 1.2); if (d < bd) { bd = d; best = j; } });
      if (best >= 0) { used.add(best); name = items[best].name; nx = (nx + items[best].x) / 2; ny = (ny + items[best].y) / 2; }
    }
    used.add(i);
    (seedsOf.get(it.comp) ?? seedsOf.set(it.comp, []).get(it.comp)!).push({ comp: it.comp, x: nx, y: ny, name, area: it.area });
  });
  items.forEach((it, i) => {
    if (used.has(i) || !it.name || !usable(it.comp)) return;
    const list = seedsOf.get(it.comp) ?? seedsOf.set(it.comp, []).get(it.comp)!;
    if (!list.length) list.push({ comp: it.comp, x: it.x, y: it.y, name: it.name });
  });

  // drawing scale
  let pxPerM: number;
  let scaleSource: DetectResult["scaleSource"];
  let sumPx = 0, sumM = 0;
  for (const [c, list] of seedsOf) if (list.length && list.every((q) => q.area)) { sumPx += comps[c].size; sumM += list.reduce((t, q) => t + q.area!, 0); }
  if (sumM > 0) { pxPerM = Math.sqrt(sumPx / sumM); scaleSource = "labels"; }
  else if (doors.filter((w0) => w0 >= T * 2.5).length >= 2) {
    // real doors only: slivers between wall fragments are far narrower than a door
    const real = doors.filter((w0) => w0 >= T * 2.5).sort((a, b) => a - b);
    pxPerM = real[real.length >> 1] / 0.85;
    scaleSource = "doors";
  }
  else { pxPerM = T / 0.3; scaleSource = "walls"; }

  // regions: one per enclosed space; a space with several labels (open-plan living + kitchen) is divided between them
  type Region = { size: number; first: number; x0: number; y0: number; x1: number; y1: number; name: string; area?: number };
  const regionOf = new Int32Array(N);
  const regions: Region[] = [];
  const minPx = Math.max(T * T * 3, 0.8 * pxPerM * pxPerM);
  for (let c = 1; c < comps.length; c++) {
    const k = comps[c];
    if (k.border || k.size < minPx) continue;
    const seeds = seedsOf.get(c) ?? [];
    const base = regions.length;
    const n = Math.max(1, seeds.length);
    for (let q = 0; q < n; q++) regions.push({ size: 0, first: -1, x0: W, y0: H, x1: 0, y1: 0, name: seeds[q]?.name ?? "", area: seeds[q]?.area });
    for (let y = k.y0; y <= k.y1; y++)
      for (let x = k.x0; x <= k.x1; x++) {
        const i = y * W + x;
        if (lab[i] !== c) continue;
        let q = 0;
        if (n > 1) { let bd = Infinity; for (let z = 0; z < n; z++) { const d = (seeds[z].x - x) ** 2 + (seeds[z].y - y) ** 2; if (d < bd) { bd = d; q = z; } } }
        const reg = regions[base + q];
        regionOf[i] = base + q + 1;
        if (reg.first < 0) reg.first = i;
        reg.size++;
        if (x < reg.x0) reg.x0 = x; if (x > reg.x1) reg.x1 = x; if (y < reg.y0) reg.y0 = y; if (y > reg.y1) reg.y1 = y;
      }
  }
  // biggest first; `order[n]` = region index of room n
  const order = regions.map((_, i) => i).filter((i) => regions[i].size > 0).sort((a, b) => regions[b].size - regions[a].size);
  const roomOfRegion = new Map<number, number>(order.map((ri, n) => [ri + 1, n]));
  const R = order.length;
  if (!R) return { rooms: [], groups: [], walls: [], metersPerUnit: W / pxPerM, scaleSource, debug };

  const eps = Math.max(1.5, hp * 0.35);

  // which rooms are connected by a door → adjacency graph
  const adj: Set<number>[] = order.map(() => new Set<number>());
  {
    const doorMask = new Uint8Array(N);
    // any closed opening connects the rooms on its two sides (a window in an outer wall only touches one room, so it adds nothing)
    for (let i = 0; i < N; i++) doorMask[i] = kind[i] === 2 || kind[i] === 3 ? 1 : 0;
    const d = label(doorMask, W, H, true);
    const touch: Set<number>[] = d.comps.map(() => new Set<number>());
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x, g = d.lab[i];
        if (!g) continue;
        for (const j of [i - 1, i + 1, i - W, i + W]) { const rm = roomOfRegion.get(regionOf[j]); if (rm !== undefined) touch[g].add(rm); }
      }
    for (const t of touch) { const a = [...t]; for (const u of a) for (const v of a) if (u !== v) adj[u].add(v); }
  }

  // separate drawings on one sheet (the levels of a maisonette, or several types): rooms that sit close together belong together
  const parent = order.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const near = T * 3;
  for (let a = 0; a < R; a++)
    for (let b = a + 1; b < R; b++) {
      const A = regions[order[a]], B = regions[order[b]];
      const gx = Math.max(A.x0 - B.x1, B.x0 - A.x1), gy = Math.max(A.y0 - B.y1, B.y0 - A.y1);
      if (gx <= near && gy <= near) parent[root(a)] = root(b);
    }
  const clusterIds = [...new Set(order.map((_, i) => root(i)))];
  const boxOf = (members: number[]) => members.reduce((bb, m) => { const g = regions[order[m]]; return { x0: Math.min(bb.x0, g.x0), y0: Math.min(bb.y0, g.y0), x1: Math.max(bb.x1, g.x1), y1: Math.max(bb.y1, g.y1) }; }, { x0: W, y0: H, x1: 0, y1: 0 });

  let groups: PlanGroup[];
  let groupOfRoom: number[];
  let levels = false;
  if (clusterIds.length > 1) {
    levels = true;
    const cl = clusterIds.map((cid) => { const members = order.map((_, i) => i).filter((i) => root(i) === cid); return { members, box: boxOf(members) }; })
      .sort((a, b) => (Math.abs(a.box.y0 - b.box.y0) > H * 0.15 ? a.box.y0 - b.box.y0 : a.box.x0 - b.box.x0));
    groupOfRoom = new Array(R).fill(0);
    groups = cl.map((c2, gi) => {
      c2.members.forEach((m) => (groupOfRoom[m] = gi));
      // caption below the drawing, e.g. "Erdgeschoss"
      let name = "", bd = Infinity;
      for (const it of items) {
        if (!it.name || it.area || roomOfRegion.has(regionOf[it.y * W + it.x] ?? 0)) continue;
        if (it.x < c2.box.x0 - near || it.x > c2.box.x1 + near || it.y < c2.box.y1 || it.y > c2.box.y1 + (c2.box.y1 - c2.box.y0) * 0.6) continue;
        const d = it.y - c2.box.y1;
        if (d < bd) { bd = d; name = it.name; }
      }
      return { name: name || `Level ${gi + 1}` };
    });
  } else {
    const components = (skip: number) => {
      const comp = new Int32Array(R).fill(-1);
      let n = 0;
      for (let s0 = 0; s0 < R; s0++) {
        if (s0 === skip || comp[s0] >= 0) continue;
        const st = [s0];
        comp[s0] = n;
        while (st.length) { const u = st.pop()!; for (const v of adj[u]) if (v !== skip && comp[v] < 0) { comp[v] = n; st.push(v); } }
        n++;
      }
      return { comp, n };
    };
    // the stairwell is the room whose removal splits the floor into the most multi-room apartments
    let hub = -1, best = 1;
    for (let q = 0; q < R; q++) {
      const { comp, n } = components(q);
      const sizes = new Array(n).fill(0);
      comp.forEach((c2) => { if (c2 >= 0) sizes[c2]++; });
      const multi = sizes.filter((z) => z >= 2).length;
      if (multi > best) { best = multi; hub = q; }
    }
    if (hub < 0) {
      groupOfRoom = new Array(R).fill(0);
      groups = [{ name: "Apt 1" }];
    } else {
      const { comp: compOf, n: nComp } = components(hub);
      const cen = Array.from({ length: nComp }, () => ({ x: 0, y: 0, n: 0 }));
      order.forEach((ri, q) => { const c2 = compOf[q]; if (c2 < 0) return; const g = regions[ri]; cen[c2].x += ((g.x0 + g.x1) / 2) * g.size; cen[c2].y += ((g.y0 + g.y1) / 2) * g.size; cen[c2].n += g.size; });
      const ord = cen.map((c2, i) => ({ i, x: c2.x / (c2.n || 1), y: c2.y / (c2.n || 1) })).sort((a, b) => (Math.abs(a.y - b.y) > bh * 0.25 ? a.y - b.y : a.x - b.x));
      const rank = new Map(ord.map((o, k) => [o.i, k]));
      groupOfRoom = order.map((_, q) => (q === hub ? nComp : rank.get(compOf[q])!));
      groups = ord.map((_, k) => ({ name: `Apt ${k + 1}` }));
      groups.push({ name: "Stairwell", common: true });
    }
  }

  // footprint per group: its rooms grown over the interior walls
  {
    const owner = new Int32Array(N);
    const grow = Math.ceil(T / 2) + 1;
    for (let g = 0; g < groups.length; g++) {
      const m = new Uint8Array(N);
      for (let i = 0; i < N; i++) { const rm = roomOfRegion.get(regionOf[i]); if (rm !== undefined && groupOfRoom[rm] === g) m[i] = 1; }
      const dm = dilate(m, W, H, grow);
      let first = -1;
      for (let i = 0; i < N; i++) if (dm[i] && !owner[i]) { owner[i] = g + 1; if (first < 0) first = i; }
      if (first >= 0) groups[g].outline = simplifyClosed(trace(owner, W, H, g + 1, first), eps).map(([x, y]) => [x / W, y / H] as Pt);
    }
  }

  let unnamed = 0;
  const rooms: Room[] = order
    .map((ri, n) => {
      const g = regions[ri];
      const poly = simplifyClosed(trace(regionOf, W, H, ri + 1, g.first), eps);
      return {
        id: `r${n}-${Math.random().toString(36).slice(2, 7)}`,
        name: g.name || `Room ${++unnamed}`,
        polygon: poly.map(([x, y]) => [x / W, y / H] as Pt),
        areaM2: g.area ?? Math.round((g.size / (pxPerM * pxPerM)) * 10) / 10,
        areaFromPdf: !!g.area,
        confirmed: false,
        group: groupOfRoom[n],
      };
    })
    .filter((rm) => rm.polygon.length >= 3);

  // keep only the walls that belong to the drawings (titles, logos and frames elsewhere on the sheet go)
  {
    const keep = new Uint8Array(N);
    const pad = Math.round(T * 2.5);
    for (const cid of clusterIds) {
      const b = boxOf(order.map((_, i) => i).filter((i) => root(i) === cid));
      for (let y = Math.max(0, b.y0 - pad); y <= Math.min(H - 1, b.y1 + pad); y++) keep.fill(1, y * W + Math.max(0, b.x0 - pad), y * W + Math.min(W - 1, b.x1 + pad) + 1);
    }
    for (let i = 0; i < N; i++) if (!keep[i]) kind[i] = 0;
  }
  const walls = [...rects(kind, W, H, 1), ...rects(kind, W, H, 2), ...rects(kind, W, H, 3)].slice(0, 12000);
  return { rooms, groups, walls, metersPerUnit: W / pxPerM, scaleSource, levels, debug };
}
