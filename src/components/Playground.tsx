"use client";
import { useEffect, useRef, useState } from "react";

const fine = () => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The lively layer of the home area: a quiet dotted backdrop whose dots light up around the pointer, a short green trail behind the pointer and a small
 * ripple on click. The native pointer stays as it is, so nothing gets in the way of aiming or clicking.
 * Pointer devices only, off with "reduce motion".
 */
export default function Playground() {
  const root = useRef<HTMLDivElement>(null);
  const trail = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!fine()) return;
    const cv = trail.current, ctx = cv?.getContext("2d");
    const LIFE = 320;
    let x = innerWidth / 2, y = innerHeight / 2, raf = 0, hot = false, dirty = false;
    let pts: { x: number; y: number; t: number }[] = [];
    const colour = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#8dc63f";
    const size = () => { if (!cv) return; const d = Math.min(2, devicePixelRatio || 1); cv.width = innerWidth * d; cv.height = innerHeight * d; ctx?.setTransform(d, 0, 0, d, 0, 0); };
    size();
    const move = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY;
      hot = !!(e.target as Element | null)?.closest?.("a, button, [role=button], [role=switch], [role=option], label, select, summary");
      pts.push({ x, y, t: performance.now() });
      if (pts.length > 60) pts.shift();
    };
    const tick = () => {
      const el = root.current;
      if (el) { el.style.setProperty("--mx", `${x}px`); el.style.setProperty("--my", `${y}px`); el.style.setProperty("--px", String(x / innerWidth - 0.5)); el.style.setProperty("--py", String(y / innerHeight - 0.5)); }
      if (ctx && cv) {
        const now = performance.now();
        pts = pts.filter((q) => now - q.t < LIFE);
        if (pts.length || dirty) ctx.clearRect(0, 0, innerWidth, innerHeight);
        dirty = pts.length > 0;
        ctx.lineCap = "round"; ctx.strokeStyle = colour; ctx.fillStyle = colour;
        // a ribbon that is widest and strongest at the pointer and thins out to nothing behind it
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i], k = 1 - (now - b.t) / LIFE;
          ctx.globalAlpha = 0.5 * k * k; ctx.lineWidth = (hot ? 9 : 6) * k;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(tick);
    };
    const down = (e: PointerEvent) => {
      const s = document.createElement("span");
      s.className = "play-ripple"; s.style.left = `${e.clientX}px`; s.style.top = `${e.clientY}px`;
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 420);
    };
    addEventListener("pointermove", move, { passive: true });
    addEventListener("pointerdown", down, { passive: true });
    addEventListener("resize", size);
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); removeEventListener("pointermove", move); removeEventListener("pointerdown", down); removeEventListener("resize", size); };
  }, []);
  return (
    <>
      <div ref={root} className="play" aria-hidden>
        <i className="play-dots" /><i className="play-glow" />
      </div>
      <canvas ref={trail} className="play-trail" aria-hidden />
    </>
  );
}

/** cards lean towards the pointer: spread `{...tilt}` on the element and give it the class "tilt" */
export const tilt = {
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = e.currentTarget, r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--ry", `${px * 7}deg`); el.style.setProperty("--rx", `${-py * 7}deg`);
    el.style.setProperty("--gx", `${(px + 0.5) * 100}%`); el.style.setProperty("--gy", `${(py + 0.5) * 100}%`);
  },
  onPointerLeave: (e: React.PointerEvent<HTMLElement>) => { e.currentTarget.style.setProperty("--ry", "0deg"); e.currentTarget.style.setProperty("--rx", "0deg"); },
};

/** numbers roll up to their value once */
export function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(fine() ? 0 : value);
  useEffect(() => {
    if (!fine()) return setN(value);
    const t0 = performance.now(), from = 0, dur = 500;
    let raf = 0;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / dur); setN(Math.round(from + (value - from) * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n}</>;
}
