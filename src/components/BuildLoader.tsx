"use client";
import type { Data } from "@puckeditor/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PascalFace } from "./PascalFun";
import { SitePreview } from "./shell";
import { placeholder } from "@/lib/placeholders";
import { buildPage, templateOf } from "@/lib/templates";
import type { TemplateId } from "@/lib/types";

/** the templates on the wheel: the three a new site starts from plus three earlier ones, for variety */
const WHEEL: TemplateId[] = ["atelier", "kontrast", "lumen", "t2", "t3", "t5"];
const NAMES: Partial<Record<TemplateId, string>> = { t2: "Sand", t3: "Cream", t5: "Sage" };
const POP_MS = 3000;
/** one full turn of the wheel */
const TURN_MS = 42000;

const calm = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface LoaderCard { data: Data; accent: string; name: string; projectId?: string }

/** the first screen (menu bar + hero) of a template with a sample building, enough for a card */
export function heroOf(id: TemplateId): LoaderCard {
  const t = templateOf(id)!;
  const page = buildPage({ name: "Wohnen am Park", address: "Parkstrasse 12", zip: "8008", city: "Zürich", type: "rent", units: [], floorPlans: [], heroImage: placeholder("exterior", t.accent) }, id);
  return { data: firstScreen(page), accent: t.accent, name: NAMES[id] ?? t.name };
}
/** menu bar and hero of any page: a site of the person's own can ride on the wheel too */
export const firstScreen = (page: Data): Data => ({ ...page, content: (page.content as { type: string }[]).filter((c) => c.type === "Header" || c.type === "Hero") } as Data);

/**
 * The curtain while Pascal works: six cards turn on a big wheel whose top edge shows at the bottom of the screen
 * (they overlap; the one nearest the top is in front); every 3 s one of them jumps out, spinning around its own
 * axis, and lands in the middle. A progress line runs on top. It stays at least `minMs`, and it finishes only once
 * `ready` is true, so a slow job never shows a full bar.
 * `own` puts the person's own site on the wheel and pops it out first; `first` pops that template first.
 */
export default function BuildLoader({ ready, onDone, title = "Pascal is building your website", lines, minMs = 5000, own, first }: { ready: boolean; onDone?: () => void; title?: string; lines: string[]; minMs?: number; own?: LoaderCard; first?: TemplateId }) {
  const cards = useMemo(() => {
    const order = first && WHEEL.includes(first) ? [first, ...WHEEL.filter((x) => x !== first)] : first ? [first, ...WHEEL.slice(0, 5)] : WHEEL;
    const list = order.map(heroOf);
    return own ? [own, ...list.slice(0, 5)] : list;
  }, [own, first]);
  const t0 = useRef(0);
  const [pct, setPct] = useState(0);
  const [pop, setPop] = useState(0);
  const [line, setLine] = useState(0);
  const [out, setOut] = useState(false);
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; }, [onDone]);
  const [still] = useState(calm);

  // the bar creeps towards 92 % while the work runs, then fills once the work is done and the minimum time is up
  useEffect(() => {
    t0.current = performance.now();
    let raf = 0;
    const tick = () => {
      const t = performance.now() - t0.current;
      setPct((p) => Math.max(p, Math.min(92, 92 * (1 - Math.exp(-t / (minMs * 0.45))))));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [minMs]);
  useEffect(() => {
    if (!ready) return;
    const left = Math.max(0, minMs - (performance.now() - t0.current));
    const a = setTimeout(() => setPct(100), left);
    const b = setTimeout(() => setOut(true), left + 450);
    const c = setTimeout(() => doneRef.current?.(), left + 900);
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c); };
  }, [ready, minMs]);
  useEffect(() => {
    const p = setInterval(() => setPop((x) => x + 1), POP_MS);
    const l = setInterval(() => setLine((x) => x + 1), 1700);
    return () => { clearInterval(p); clearInterval(l); };
  }, []);

  // the wheel turns in JS so each card can be stacked by how close it is to the top (front) while they overlap
  const spokes = useRef<(HTMLDivElement | null)[]>([]);
  const n = cards.length * 2;
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const place = (t: number) => {
      const R = innerWidth <= 760 ? 300 : innerWidth <= 1100 ? 470 : 560;
      const base = still ? 0 : -((t - start) / TURN_MS) * 360;
      spokes.current.forEach((el, i) => {
        if (!el) return;
        const a = base + (360 / n) * i;
        const rad = (a * Math.PI) / 180;
        const c = Math.cos(rad);
        el.style.transform = `translate(${Math.sin(rad) * R}px, ${-c * R}px) rotate(${a}deg) scale(${0.84 + 0.16 * Math.max(0, c)})`;
        el.style.zIndex = String(Math.round(100 + c * 100));
      });
      if (!still) raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [n, still]);

  const now = pop % cards.length;
  const shown = cards[now];
  // straight into <body>: no sticky bar or transformed parent of the page can cover the curtain
  return createPortal(
    <div className={`bl ${out ? "out" : ""} ${still ? "still" : ""}`} role="status" aria-live="polite" aria-label={`${title}, ${Math.round(pct)} percent`}>
      <div className="bl-head">
        <span className="bl-face"><PascalFace mood="busy" size={52} /></span>
        <h2>{title}</h2>
        <p key={line} className="bl-line">{lines[line % lines.length]}</p>
        <div className="bl-progress" aria-hidden><span className="bl-bar"><i style={{ width: `${pct}%` }} /></span><span className="bl-pct tnum">{Math.round(pct)}%</span></div>
      </div>

      <div className="bl-stage" aria-hidden>
        <div key={pop} className="bl-pop">
          <div className="bl-card big"><SitePreview data={shown.data} projectId={shown.projectId ?? "__loader"} accent={shown.accent} width={520} height={320} /></div>
          <span className="bl-name">{shown.name}</span>
        </div>
      </div>

      <div className="bl-wheel-clip" aria-hidden>
        <div className="bl-wheel">
          {/* each card twice, so the arc above the bottom edge is always full */}
          {[...cards, ...cards].map((c, i) => (
            <div key={i} ref={(el) => { spokes.current[i] = el; }} className={`bl-spoke ${i % cards.length === now ? "away" : ""}`}>
              <div className="bl-card"><SitePreview data={c.data} projectId={c.projectId ?? "__loader"} accent={c.accent} width={360} height={222} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
