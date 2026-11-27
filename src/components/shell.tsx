"use client";
import { Render, type Data } from "@puckeditor/core";
import Link from "next/link";
import { config } from "@/editor/config";

export function TopBar({ children }: { children?: React.ReactNode }) {
  return (
    // stays at the top of every builder page, so the way home is always one click away
    <header className="app-topbar h-14 border-b border-line bg-surface flex items-center px-6 gap-6 shrink-0">
      <Link href="/" className="flex items-center gap-3" aria-label="Streamnow Website Builder">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/streamnow.svg" alt="streamnow" style={{ height: 22 }} />
        <span className="eyebrow app-topbar-tag" style={{ fontSize: 10 }}>Website Builder</span>
      </Link>
<nav className="app-topnav flex items-center gap-5 text-[14px]" aria-label="Main"><Link href="/" className="text-muted hover:text-ink transition-colors">Home</Link><Link href="/websites" className="text-muted hover:text-ink transition-colors">Websites</Link><Link href="/studio" className="text-muted hover:text-ink transition-colors">Floor plans</Link><Link href="/brochures" className="text-muted hover:text-ink transition-colors">Brochures</Link></nav>
      <div className="flex-1 flex items-center gap-4">{children}</div>
      <span className="text-muted text-xs app-topbar-lang">EN</span>
      <span className="w-7 h-7 flex items-center justify-center text-xs font-semibold" style={{ borderRadius: "50%", background: "var(--accent)", color: "var(--accent-ink)" }} title="Demo account">DB</span>
    </header>
  );
}

/** live, scaled-down rendering of a page – used for template choice and project cards */
export function SitePreview({ data, projectId, accent, width = 320, height = 220 }: { data: Data; projectId?: string; accent?: string; width?: number; height?: number }) {
  const k = width / 1280;
  return (
    <div style={{ width, height, overflow: "hidden", position: "relative", background: "#fbfaf8" }} aria-hidden>
      <div style={{ width: 1280, transform: `scale(${k})`, transformOrigin: "0 0", pointerEvents: "none", ["--accent" as string]: accent }}>
        <Render config={config} data={data} metadata={{ projectId, ...(accent ? { accent } : {}) }} />
      </div>
    </div>
  );
}

export function Loading() {
  return <div className="p-10 text-muted">Loading …</div>;
}
