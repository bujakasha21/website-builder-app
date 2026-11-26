"use client";
import type { FloorPlan } from "../types";
import { detectPlan, type TextItem } from "./detect";
import { guessNames } from "./furnish";

const fit = (w: number, h: number, max: number) => Math.min(1, max / Math.max(w, h));

function scaled(src: HTMLCanvasElement, max: number) {
  const k = fit(src.width, src.height, max);
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * k);
  c.height = Math.round(src.height * k);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

async function rasterPdf(data: ArrayBuffer): Promise<{ canvas: HTMLCanvasElement; texts: TextItem[] }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  // rendered straight at analysis size: resampling afterwards would wash out the hairlines of windows and doors
  const scale = 2400 / Math.max(base.width, base.height);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
  const tc = await page.getTextContent();
  const texts: TextItem[] = [];
  for (const it of tc.items) {
    if (!("str" in it) || !it.str.trim()) continue;
    const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
    texts.push({
      str: it.str,
      x: (x + (it.width * scale) / 2) / canvas.width,
      y: (y - (it.height * scale) / 2) / canvas.height,
    });
  }
  return { canvas, texts };
}

async function rasterImage(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0);
  return c;
}

/** PDF (first page) or image → vectorised floor plan with rooms, walls and scale */
export async function planFromFile(file: Blob, name: string): Promise<FloorPlan> {
  const isPdf = file.type === "application/pdf" || name.toLowerCase().endsWith(".pdf");
  let canvas: HTMLCanvasElement;
  let texts: TextItem[] = [];
  if (isPdf) ({ canvas, texts } = await rasterPdf(await file.arrayBuffer()));
  else canvas = await rasterImage(file);

  // whole sales sheets carry the plans small on the page, so analyse at a generous resolution
  const analysis = scaled(canvas, 2400);
  const img = analysis.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, analysis.width, analysis.height);
  const res = detectPlan(img, texts);
  if (res.debug) {
    // developer aid: show what the detector saw instead of the page
    const out = analysis.getContext("2d")!.createImageData(analysis.width, analysis.height);
    const col: Record<number, [number, number, number]> = { 0: [255, 255, 255], 1: [0, 0, 0], 2: [220, 40, 40], 3: [40, 90, 220], 4: [200, 235, 210] };
    res.debug.forEach((k, i) => { const c = col[k]; out.data[i * 4] = c[0]; out.data[i * 4 + 1] = c[1]; out.data[i * 4 + 2] = c[2]; out.data[i * 4 + 3] = 255; });
    canvas.width = analysis.width; canvas.height = analysis.height;
    canvas.getContext("2d")!.putImageData(out, 0, 0);
  }
  const display = scaled(canvas, 1600);
  return guessNames({
    id: "fp-" + Math.random().toString(36).slice(2, 9),
    name: name.replace(/\.(pdf|png|jpe?g|webp)$/i, "").replace(/[-_]+/g, " "),
    image: display.toDataURL("image/jpeg", 0.82),
    width: display.width,
    height: display.height,
    rooms: res.rooms,
    groups: res.groups,
    levels: res.levels,
    walls: res.walls,
    metersPerUnit: res.metersPerUnit,
    scaleSource: res.scaleSource,
    createdAt: Date.now(),
  });
}

export async function planFromUrl(url: string, name: string) {
  const blob = await (await fetch(url)).blob();
  return planFromFile(new Blob([blob], { type: "application/pdf" }), name);
}
