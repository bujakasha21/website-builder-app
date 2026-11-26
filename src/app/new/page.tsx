"use client";
import { ViewTransition } from "react";
import Link from "next/link";
import { PascalLink } from "@/components/PascalFun";
import { TopBar } from "@/components/shell";

const Tick = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3.5 8.5l3 3 6-7" /></svg>;

/** first decision: let Pascal build the site from a PDF, or go through the steps yourself */
export default function NewSite() {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      <TopBar />
      <main className="flex-1 w-full max-w-[1040px] mx-auto px-6 py-14">
        <div className="text-center">
          <div className="eyebrow">New website</div>
          <h1 className="text-[44px] leading-[1.05] font-semibold tracking-tight mt-2">How would you like to <span className="mark">start</span>?</h1>
          <p className="text-muted text-[16px] mt-3">Both ways end in the same editor. You can change everything afterwards.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
          <PascalLink href="/new/ai" className="start-card featured rise">
            <span className="start-badge">Recommended</span>
            <span className="start-icon pascal" aria-hidden>P</span>
            <span className="start-title">AI builder with Pascal</span>
            <span className="start-text">Drop in one PDF with the floor plan. Pascal reads it, asks for the few details a plan cannot tell, then suggests a version for every block.</span>
            <span className="start-steps" aria-hidden><i>PDF</i><b>→</b><i>Details</i><b>→</b><i>Pick blocks</i></span>
            <ul className="start-list">
              {["Rooms, levels and areas read from the plan", "2D and 3D floor plan with furniture", "Pascal suggests, you choose – block by block"].map((t) => <li key={t}><Tick />{t}</li>)}
            </ul>
            <span className="start-foot"><span className="btn btn-primary">Start with a PDF →</span><span className="start-time">about 2 minutes</span></span>
          </PascalLink>
          <PascalLink look="toolbox" href="/new/custom" className="start-card rise" style={{ animationDelay: "60ms" }}>
            <span className="start-icon" aria-hidden><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg></span>
            <span className="start-title">Custom made</span>
            <span className="start-text">Eight short steps, from name and logo to units, building and template. For when you have the material at hand and want full control.</span>
            <span className="start-steps" aria-hidden><i>Brand</i><b>→</b><i>Units</i><b>→</b><i>Building</i><b>→</b><i>Template</i></span>
            <ul className="start-list">
              {["Units from Excel, an API or by hand", "Your isometry as SVG, or a generated 3D building", "Live preview of every template"].map((t) => <li key={t}><Tick />{t}</li>)}
            </ul>
            <span className="start-foot"><span className="btn">Go step by step →</span><span className="start-time">about 10 minutes</span></span>
          </PascalLink>
        </div>
      </main>
    </ViewTransition>
  );
}
