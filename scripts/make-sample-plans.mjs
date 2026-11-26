// Generates two vector floor-plan PDFs into public/samples/ (no dependencies).
// Run: node scripts/make-sample-plans.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const PAGE = [842, 595];

function plan({ title, subtitle, size, walls, rooms, furniture, scale: S = 40 }) {
  const ox = (PAGE[0] - size[0] * S) / 2;
  const oy = (PAGE[1] - size[1] * S) / 2 + 10;
  const X = (x) => (ox + x * S).toFixed(2);
  const Y = (y) => (PAGE[1] - (oy + y * S)).toFixed(2);
  const out = [];
  const rect = (x, y, w, h) =>
    out.push(`${X(x)} ${Y(y + h)} ${(w * S).toFixed(2)} ${(h * S).toFixed(2)} re f`);
  const line = (x1, y1, x2, y2) => out.push(`${X(x1)} ${Y(y1)} m ${X(x2)} ${Y(y2)} l S`);

  out.push("0 g 0 G 0.6 w");
  for (const w of walls) {
    const h = w.th / 2;
    const ops = [...(w.openings ?? [])].sort((a, b) => a.a - b.a);
    let cur = w.from - h;
    const end = w.to + h;
    const piece = (a, b) => {
      if (b - a <= 0.001) return;
      if (w.axis === "h") rect(a, w.at - h, b - a, w.th);
      else rect(w.at - h, a, w.th, b - a);
    };
    for (const o of ops) {
      piece(cur, o.a);
      cur = o.b;
      const len = o.b - o.a;
      if (o.type === "window") {
        for (const d of [-h, 0, h]) {
          if (w.axis === "h") line(o.a, w.at + d, o.b, w.at + d);
          else line(w.at + d, o.a, w.at + d, o.b);
        }
      } else {
        // door: leaf + quarter arc, swinging to side o.side (+1 / -1), hinged at o.a
        const s = o.side ?? 1;
        const k = 0.5523 * len;
        if (w.axis === "h") {
          const hx = o.a, hy = w.at;
          line(hx, hy, hx, hy + s * len);
          out.push(
            `${X(hx)} ${Y(hy + s * len)} m ${X(hx + k)} ${Y(hy + s * len)} ${X(hx + len)} ${Y(hy + s * k)} ${X(hx + len)} ${Y(hy)} c S`
          );
        } else {
          const hx = w.at, hy = o.a;
          line(hx, hy, hx + s * len, hy);
          out.push(
            `${X(hx + s * len)} ${Y(hy)} m ${X(hx + s * len)} ${Y(hy + k)} ${X(hx + s * k)} ${Y(hy + len)} ${X(hx)} ${Y(hy + len)} c S`
          );
        }
      }
    }
    piece(cur, end);
  }

  out.push("0.4 w 0.35 G");
  for (const f of furniture ?? []) {
    out.push(`${X(f[0])} ${Y(f[1] + f[3])} ${(f[2] * S).toFixed(2)} ${(f[3] * S).toFixed(2)} re S`);
  }

  const text = (x, y, size, str, raw = false) => {
    const esc = str.replace(/([()\\])/g, "\\$1").replace(/²/g, "\\262").replace(/ä/g, "\\344").replace(/ö/g, "\\366").replace(/ü/g, "\\374").replace(/é/g, "\\351");
    const px = raw ? x.toFixed(2) : X(x);
    const py = raw ? y.toFixed(2) : Y(y);
    out.push(`BT /F1 ${size} Tf ${px} ${py} Td (${esc}) Tj ET`);
  };
  out.push("0 g");
  for (const r of rooms) {
    text(r.x, r.y, 9, r.name);
    text(r.x, r.y + 0.32, 8, `${r.area.toFixed(1)} m²`);
  }
  // sheet frame, title block, scale bar
  out.push("0.5 w 0 G 24 24 794 547 re S");
  text(40, 548, 14, title, true);
  text(40, 532, 9, subtitle, true);
  out.push(`0.8 w 40 44 m ${40 + 5 * S} 44 l S 40 41 m 40 47 l S ${40 + 5 * S} 41 m ${40 + 5 * S} 47 l S`);
  text(40, 50, 7, "0", true);
  text(40 + 5 * S - 8, 50, 7, "5 m", true);

  const content = out.join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE[0]} ${PAGE[1]}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

const E = 0.35, I = 0.15;

const planA = plan({
  title: "Wohnen am Park, Zürich",
  subtitle: "Building A · 4.5-room type · Floor plan 1:100",
  size: [13, 9],
  walls: [
    { axis: "h", at: 0, from: 0, to: 13, th: E, openings: [{ a: 1.5, b: 5.2, type: "window" }, { a: 7.8, b: 9.4, type: "window" }, { a: 10.7, b: 12.3, type: "window" }] },
    { axis: "h", at: 9, from: 0, to: 13, th: E, openings: [{ a: 0.9, b: 2.5, type: "window" }, { a: 5.2, b: 6.2, type: "door", side: -1 }, { a: 11, b: 12.4, type: "window" }] },
    { axis: "v", at: 0, from: 0, to: 9, th: E, openings: [{ a: 1.2, b: 3.8, type: "window" }] },
    { axis: "v", at: 13, from: 0, to: 9, th: E, openings: [{ a: 1.2, b: 3, type: "window" }, { a: 6.4, b: 8, type: "window" }] },
    { axis: "v", at: 7, from: 0, to: 5.6, th: I, openings: [{ a: 4.45, b: 5.35, type: "door", side: -1 }] },
    { axis: "h", at: 5.6, from: 0, to: 13, th: I, openings: [{ a: 1.2, b: 2.1, type: "door", side: 1 }, { a: 4.6, b: 5.5, type: "door", side: 1 }, { a: 7.15, b: 8.05, type: "door", side: 1 }, { a: 8.9, b: 9.7, type: "door", side: 1 }, { a: 11.2, b: 12.1, type: "door", side: 1 }] },
    { axis: "v", at: 3.6, from: 5.6, to: 9, th: I },
    { axis: "v", at: 8.2, from: 5.6, to: 9, th: I },
    { axis: "v", at: 10.4, from: 5.6, to: 9, th: I },
    { axis: "h", at: 4.2, from: 7, to: 13, th: I, openings: [{ a: 8.6, b: 9.5, type: "door", side: -1 }, { a: 10.5, b: 11.4, type: "door", side: -1 }] },
    { axis: "v", at: 10, from: 0, to: 4.2, th: I },
  ],
  rooms: [
    { x: 2.6, y: 2.6, name: "Living / Dining", area: 37.6 },
    { x: 1.2, y: 7.4, name: "Kitchen", area: 11.3 },
    { x: 5.2, y: 7.0, name: "Entrance", area: 14.4 },
    { x: 9.6, y: 4.85, name: "Hallway", area: 7.4 },
    { x: 7.9, y: 2.0, name: "Bedroom 1", area: 11.6 },
    { x: 10.9, y: 2.0, name: "Bedroom 2", area: 11.6 },
    { x: 8.8, y: 7.6, name: "Bathroom", area: 6.6 },
    { x: 11.1, y: 7.4, name: "Bedroom 3", area: 7.9 },
  ],
  furniture: [
    [0.4, 5.9, 0.6, 2.8], [1.0, 8.2, 2.3, 0.6], // kitchen counters
    [3.2, 0.6, 2.2, 1.0], // sofa
    [7.3, 0.4, 1.6, 2.0], [10.3, 0.4, 1.6, 2.0], // beds
    [9.3, 8.0, 0.9, 0.75], // bath
  ],
});

const planB = plan({
  title: "Wohnen am Park, Zürich",
  subtitle: "Building B · 2.5-room type · Floor plan 1:100",
  size: [9, 7.5],
  walls: [
    { axis: "h", at: 0, from: 0, to: 9, th: E, openings: [{ a: 1.2, b: 4.2, type: "window" }, { a: 6.2, b: 8, type: "window" }] },
    { axis: "h", at: 7.5, from: 0, to: 9, th: E, openings: [{ a: 0.8, b: 1.8, type: "door", side: -1 }, { a: 6.4, b: 8, type: "window" }] },
    { axis: "v", at: 0, from: 0, to: 7.5, th: E, openings: [{ a: 1, b: 3.4, type: "window" }] },
    { axis: "v", at: 9, from: 0, to: 7.5, th: E, openings: [{ a: 2.6, b: 4.6, type: "window" }] },
    { axis: "h", at: 4.6, from: 0, to: 5.5, th: I, openings: [{ a: 0.8, b: 1.7, type: "door", side: -1 }] },
    { axis: "v", at: 2.6, from: 4.6, to: 7.5, th: I, openings: [{ a: 5.3, b: 6.1, type: "door", side: 1 }] },
    { axis: "v", at: 5.5, from: 0, to: 7.5, th: I, openings: [{ a: 3.2, b: 4.1, type: "door", side: 1 }] },
  ],
  rooms: [
    { x: 1.9, y: 2.2, name: "Living / Kitchen", area: 23.8 },
    { x: 0.7, y: 6.3, name: "Entrance", area: 6.6 },
    { x: 3.6, y: 6.2, name: "Bathroom", area: 7.6 },
    { x: 6.6, y: 5.6, name: "Bedroom", area: 24.6 },
  ],
  furniture: [[0.4, 0.4, 0.6, 3.0], [6.9, 0.5, 1.6, 2.0], [4.3, 6.5, 0.9, 0.75]],
});


const D = 0.2; // party walls
const planC = plan({
  title: "Wohnen am Park, Zürich",
  subtitle: "Building A · Typical floor · 4 apartments · Floor plan 1:150",
  size: [24, 12],
  scale: 30,
  walls: [
    { axis: "h", at: 0, from: 0, to: 24, th: E, openings: [{ a: 1.5, b: 4.5, type: "window" }, { a: 7.5, b: 10, type: "window" }, { a: 14, b: 16.5, type: "window" }, { a: 19.5, b: 22.5, type: "window" }] },
    { axis: "h", at: 12, from: 0, to: 24, th: E, openings: [{ a: 1.5, b: 4.5, type: "window" }, { a: 7, b: 9, type: "window" }, { a: 11.5, b: 12.5, type: "door", side: -1 }, { a: 15, b: 17, type: "window" }, { a: 19.5, b: 22.5, type: "window" }] },
    { axis: "v", at: 0, from: 0, to: 12, th: E, openings: [{ a: 1.5, b: 4.5, type: "window" }, { a: 7.5, b: 10.5, type: "window" }] },
    { axis: "v", at: 24, from: 0, to: 12, th: E, openings: [{ a: 1.5, b: 4.5, type: "window" }, { a: 7.5, b: 10.5, type: "window" }] },
    { axis: "v", at: 6, from: 0, to: 12, th: I, openings: [{ a: 4, b: 4.9, type: "door", side: -1 }, { a: 7, b: 7.9, type: "door", side: -1 }] },
    { axis: "v", at: 18, from: 0, to: 12, th: I, openings: [{ a: 4, b: 4.9, type: "door", side: 1 }, { a: 7, b: 7.9, type: "door", side: 1 }] },
    { axis: "v", at: 10, from: 3, to: 12, th: D, openings: [{ a: 4, b: 4.9, type: "door", side: -1 }, { a: 7, b: 7.9, type: "door", side: -1 }] },
    { axis: "v", at: 14, from: 3, to: 12, th: D, openings: [{ a: 4, b: 4.9, type: "door", side: 1 }, { a: 7, b: 7.9, type: "door", side: 1 }] },
    { axis: "v", at: 12, from: 0, to: 3, th: D },
    { axis: "h", at: 3, from: 6, to: 18, th: I, openings: [{ a: 7.5, b: 8.4, type: "door", side: -1 }, { a: 15.6, b: 16.5, type: "door", side: -1 }] },
    { axis: "h", at: 6, from: 0, to: 10, th: D },
    { axis: "h", at: 6, from: 14, to: 24, th: D },
    { axis: "h", at: 9, from: 6, to: 10, th: I, openings: [{ a: 7.5, b: 8.4, type: "door", side: 1 }] },
    { axis: "h", at: 9, from: 14, to: 18, th: I, openings: [{ a: 15.6, b: 16.5, type: "door", side: 1 }] },
  ],
  rooms: [
    { x: 1.8, y: 3.0, name: "Living / Kitchen", area: 33.2 },
    { x: 7.2, y: 4.6, name: "Hall", area: 10.6 },
    { x: 7.8, y: 1.4, name: "Bedroom", area: 15.9 },
    { x: 19.8, y: 3.0, name: "Living / Kitchen", area: 33.2 },
    { x: 15.2, y: 4.6, name: "Hall", area: 10.6 },
    { x: 13.8, y: 1.4, name: "Bedroom", area: 15.9 },
    { x: 1.8, y: 9.0, name: "Living / Kitchen", area: 33.2 },
    { x: 7.2, y: 7.6, name: "Hall", area: 10.6 },
    { x: 7.2, y: 10.6, name: "Bedroom", area: 10.4 },
    { x: 19.8, y: 9.0, name: "Living / Kitchen", area: 33.2 },
    { x: 15.2, y: 7.6, name: "Hall", area: 10.6 },
    { x: 15.2, y: 10.6, name: "Bedroom", area: 10.4 },
    { x: 11.2, y: 8.2, name: "Stairwell", area: 33.4 },
  ],
});

mkdirSync("public/samples", { recursive: true });
writeFileSync("public/samples/floor-plan-4-5-rooms.pdf", planA);
writeFileSync("public/samples/floor-plan-2-5-rooms.pdf", planB);
writeFileSync("public/samples/floor-plan-typical-floor.pdf", planC);
console.log("wrote 3 sample PDFs");
