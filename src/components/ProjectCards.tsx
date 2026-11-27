"use client";
import Link from "next/link";
import { EmptyState } from "@/components/HomeShell";
import { SitePreview } from "@/components/shell";
import { deleteProject } from "@/lib/store";
import type { Project } from "@/lib/types";

/** website cards with a live preview; each one can be opened or deleted */
export default function ProjectCards({ projects, action = "open" }: { projects: Project[]; action?: "open" | "brochure" }) {
  if (!projects.length)
    return <EmptyState title="Your first website is minutes away" text="Give Pascal one floor plan PDF, or answer a few simple questions. You see a working site straight away." action={<Link href="/new" className="btn btn-primary">Create your first website</Link>} />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {projects.map((p) => {
        const apts = p.units.filter((u) => (u.use ?? "apartment") === "apartment");
        const free = apts.filter((u) => u.status === "available").length;
        return (
          <div key={p.id} className="panel overflow-hidden relative rise hover:border-ink transition-colors group">
            <Link href={action === "brochure" ? `/brochure/${p.id}?make=1` : `/p/${p.id}`} className="absolute inset-0 z-10" aria-label={action === "brochure" ? `Open brochure for ${p.name}` : `Open ${p.name}`} />
            {action === "open" ? (
              <button
                className="absolute top-2 right-2 z-20 w-8 h-8 bg-surface border border-line-strong flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:border-err hover:text-err"
                style={{ borderRadius: "50%" }}
                title="Delete website" aria-label={`Delete ${p.name}`}
                onClick={() => { if (confirm(`Delete “${p.name}”? The website, its units, floor plans and leads are removed. This cannot be undone.`)) deleteProject(p.id); }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5M6.8 7v3.5M9.2 7v3.5" /></svg>
              </button>
            ) : null}
            <div className="border-b border-line"><SitePreview data={p.draft} projectId={p.id} accent={p.accent} width={340} height={200} /></div>
            <div className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-[16px] truncate">{p.name}</div>
                <span className="text-xs text-muted flex items-center shrink-0"><span className="dot" style={{ background: p.published ? "var(--ok)" : "var(--line-strong)" }} />{p.published ? "Live" : "Draft"}</span>
              </div>
              <div className="text-muted text-[13px] truncate">{[p.address, [p.zip, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "–"}</div>
              <div className="grid grid-cols-3 mt-4 pt-3 border-t border-line text-[13px] tnum">
                <div><div className="font-semibold text-[16px]">{free}/{apts.length}</div><div className="text-muted">available</div></div>
                <div><div className="font-semibold text-[16px]">{p.leads.length}</div><div className="text-muted">leads</div></div>
                <div><div className="font-semibold text-[16px]">{p.floorPlans.length + (p.isometry ? 1 : 0)}</div><div className="text-muted">drawings</div></div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
