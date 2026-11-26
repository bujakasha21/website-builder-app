"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const calm = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Pascal as a little character: his eyes follow the pointer, he blinks, looks around while working and grins when happy */
export function PascalFace({ mood = "idle", size = 44 }: { mood?: "idle" | "busy" | "happy"; size?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (calm()) return;
    const move = (e: PointerEvent) => {
      const el = ref.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 160) * (size / 14);
      el.style.setProperty("--ex", `${(dx / d) * k}px`); el.style.setProperty("--ey", `${(dy / d) * k}px`);
    };
    addEventListener("pointermove", move, { passive: true });
    return () => removeEventListener("pointermove", move);
  }, [size]);
  return <span ref={ref} className={`pface m-${mood}`} style={{ width: size, height: size }} aria-hidden><i className="eye" /><i className="eye" /><i className="mouth" /></span>;
}

/** text that types itself in once, quickly */
export function Typed({ text }: { text: string }) {
  const [n, setN] = useState(calm() ? text.length : 0);
  useEffect(() => {
    if (calm()) return setN(text.length);
    const step = Math.max(1, Math.ceil(text.length / 45));
    const t = setInterval(() => setN((x) => { if (x >= text.length) { clearInterval(t); return x; } return x + step; }), 16);
    return () => clearInterval(t);
  }, [text]);
  return <>{text.slice(0, n)}{n < text.length ? <span className="caret" aria-hidden /> : null}</>;
}

const COLOURS = ["#84bf31", "#ff9e7a", "#f6cf5a", "#8fd3ff", "#c9a5f7", "#252525"];
/** a short burst of confetti from a point on screen (default: upper middle) */
export function confetti(x = innerWidth / 2, y = innerHeight * 0.35, count = 46) {
  if (calm()) return;
  const box = document.createElement("div");
  box.className = "confetti";
  for (let i = 0; i < count; i++) {
    const s = document.createElement("i");
    const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 260;
    s.style.cssText = `left:${x}px;top:${y}px;background:${COLOURS[i % COLOURS.length]};--dx:${Math.cos(a) * v}px;--dy:${Math.sin(a) * v - 140}px;--r:${Math.random() * 720 - 360}deg;animation-delay:${Math.random() * 80}ms;${i % 3 === 0 ? "border-radius:50%;" : i % 3 === 1 ? "width:6px;height:14px;" : ""}`;
    box.appendChild(s);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 1500);
}

/** shown while Pascal reads the PDF: a plan being scanned and drawn, with what he is "doing" right now */
export function ScanSheet({ lines }: { lines: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % lines.length), 1100); return () => clearInterval(t); }, [lines.length]);
  return (
    <div className="scan">
      <div className="scan-sheet">
        <svg viewBox="0 0 240 170" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
          <path className="w w1" d="M14 14h212v142H14z" />
          <path className="w w2" d="M100 14v70M14 84h132M146 84v72" />
          <path className="w w3" d="M146 110h80M60 84v72" />
          <path className="d d1" d="M100 52a16 16 0 0 1 16-16" /><path className="d d2" d="M146 128a14 14 0 0 0-14 14" />
          <rect className="f f1" x="28" y="28" width="38" height="20" rx="4" /><rect className="f f2" x="166" y="30" width="44" height="26" rx="5" /><circle className="f f3" cx="186" cy="134" r="10" />
        </svg>
        <i className="scan-line" />
      </div>
      <div className="scan-text" key={i}>{lines[i]}</div>
    </div>
  );
}

/** progress as a little house going up: one floor per finished step, a roof and a flag at the end */
export function Tower({ step, total }: { step: number; total: number }) {
  const done = step >= total;
  return (
    <div className={`tower ${done ? "done" : ""}`} role="img" aria-label={`Step ${Math.min(step + 1, total)} of ${total}`}>
      <span className="tower-flag" /><span className="tower-roof" />
      {Array.from({ length: total }, (_, k) => total - 1 - k).map((k) => <i key={k} className={k < step ? "past" : k === step ? "on" : ""} />)}
    </div>
  );
}

/** stacked bricks while the first version is put together */
export function Bricks({ lines }: { lines: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => Math.min(lines.length - 1, x + 1)), 520); return () => clearInterval(t); }, [lines.length]);
  return (
    <div className="bricks">
      <div className="bricks-wall" aria-hidden>{Array.from({ length: 12 }, (_, k) => <i key={k} style={{ animationDelay: `${k * 85}ms` }} />)}</div>
      <div className="scan-text" key={i}>{lines[i]}</div>
    </div>
  );
}

/**
 * The big hand-over to Pascal: green floods the screen from the click, Pascal drops in and bounces while the next
 * page loads behind it, then the green pulls back and the page is there. The curtain lives outside React so it
 * survives the route change.
 */
export function pascalJump(x: number, y: number, href: string, go: (href: string) => void) {
  if (calm()) return go(href);
  const el = document.createElement("div");
  el.className = "jump";
  el.style.setProperty("--jx", `${x}px`); el.style.setProperty("--jy", `${y}px`);
  el.innerHTML = '<div class="jump-stage"><span class="jump-shadow"></span><span class="jump-ball"><i></i><i></i><b></b></span><span class="jump-text">Pascal is getting ready<em>.</em><em>.</em><em>.</em></span></div>';
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  const t0 = performance.now();
  setTimeout(() => go(href), 520);
  // leave once the new page is really there, but never before Pascal has had his bounce
  const check = setInterval(() => {
    const there = location.pathname.replace(/\/$/, "") === href.replace(/\/$/, "");
    const waited = performance.now() - t0;
    if ((there && waited > 1700) || waited > 6000) {
      clearInterval(check);
      window.scrollTo(0, 0); // the new page starts at its very top
      el.classList.add("out");
      setTimeout(() => el.remove(), 720);
    }
  }, 60);
}

/**
 * The hand-over to the wizard ("Custom made"): green shutters drop one after another, the logo lands on a card
 * and tips to one side while the next page loads, then the shutters fall away. Same idea as Pascal's curtain, its own look.
 */
export function toolboxJump(href: string, go: (href: string) => void) {
  if (calm()) return go(href);
  const el = document.createElement("div");
  el.className = "shut";
  // a little website puts itself together in a browser window, then the logo jumps out of it
  el.innerHTML = '<div class="shut-cols">' + "<i></i>".repeat(7) + '</div><div class="shut-stage"><div class="mock"><div class="mock-bar"><u></u><u></u><u></u><s></s></div><div class="mock-body"><div class="mock-nav"><b></b><i></i><i></i><i></i><em></em></div><div class="mock-hero"><div><b></b><i></i><i></i><em></em></div><span></span></div><div class="mock-cards"><i></i><i></i><i></i></div></div><span class="shut-logo"><img src="/brand/streamnow.svg" alt="" /></span></div><span class="shut-text">Let\u2019s build your website<em>.</em><em>.</em><em>.</em></span></div>';
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  const t0 = performance.now();
  setTimeout(() => go(href), 620);
  const check = setInterval(() => {
    const there = location.pathname.replace(/\/$/, "") === href.replace(/\/$/, "");
    const waited = performance.now() - t0;
    if ((there && waited > 2500) || waited > 6500) {
      clearInterval(check);
      window.scrollTo(0, 0);
      el.classList.add("out");
      setTimeout(() => el.remove(), 900);
    }
  }, 60);
}

/** a link that travels with a curtain: Pascal's green flood, or the toolbox shutters */
export function PascalLink({ href, className, style, children, look = "pascal" }: { href: string; className?: string; style?: React.CSSProperties; children: React.ReactNode; look?: "pascal" | "toolbox" }) {
  const router = useRouter();
  return (
    <Link href={href} className={className} style={style} onMouseEnter={() => router.prefetch(href)}
      onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); const go = (h: string) => router.push(h); if (look === "toolbox") toolboxJump(href, go); else pascalJump(e.clientX, e.clientY, href, go); }}>
      {children}
    </Link>
  );
}
