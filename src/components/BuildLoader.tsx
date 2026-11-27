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

const calm = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** the first screen (menu bar + hero) of a template with a sample building, enough for a card */
export function heroOf(id: TemplateId): { data: Data; accent: string; name: string } {
  const t = templateOf(id)!;
  const page = buildPage({ name: "Wohnen am Park", address: "Parkstrasse 12", zip: "8008", city: "Zürich", type: "rent", units: [], floorPlans: [], heroImage: placeholder("exterior", t.accent) }, id);
  const content = (page.content as { type: string }[]).filter((c) => c.type === "Header" || c.type === "Hero");
  return { data: { ...page, content } as Data, accent: t.accent, name: NAMES[id] ?? t.name };
}

/**
 * The curtain while Pascal builds: six templates turn on a big wheel whose top edge shows at the bottom of the
 * screen; every 3 s one of them jumps out as a card, spinning around its own axis, and lands in the middle.
 * A progress line runs on top. It stays at least `minMs` (5 s), and it finishes only once `ready` is true, so a
 * slow build never shows a full bar.
 */
export default function BuildLoader({ ready, onDone, title = "Pascal is building your website", lines, minMs = 5000 }: { ready: boolean; onDone?: () => void; title?: string; lines: string[]; minMs?: number }) {
  const cards = useMemo(() => WHEEL.map(heroOf), []);
  const t0 = useRef(0);
  const [pct, setPct] = useState(0);
  const [pop, setPop] = useState(0);
  const [line, setLine] = useState(0);
  const [out, setOut] = useState(false);
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; }, [onDone]);

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

  const still = calm();
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
          <div className="bl-card big"><SitePreview data={shown.data} projectId="__loader" accent={shown.accent} width={440} height={270} /></div>
          <span className="bl-name">{shown.name}</span>
        </div>
      </div>

      <div className="bl-wheel-clip" aria-hidden>
        <div className="bl-wheel">
          {/* twelve spokes (each template twice) so the arc above the bottom edge is always full */}
          {[...cards, ...cards].map((c, i) => (
            <div key={i} className={`bl-spoke ${i % cards.length === now ? "away" : ""}`} style={{ ["--a" as string]: `${(360 / (cards.length * 2)) * i}deg` }}>
              <div className="bl-card"><SitePreview data={c.data} projectId="__loader" accent={c.accent} width={220} height={136} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** resolves after at least `ms` since `since`; for flows that must not flash past */
export const atLeast = (since: number, ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms - (Date.now() - since))));
