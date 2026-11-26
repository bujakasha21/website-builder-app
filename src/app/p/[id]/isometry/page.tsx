"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { IsometryMapper } from "@/components/Isometry";
import { parseIsometry } from "@/lib/isometry";
import { updateProject, useProject } from "@/lib/store";

export default function IsometryPage() {
  const { id } = useParams<{ id: string }>();
  const p = useProject(id);
  const [error, setError] = useState("");
  if (!p) return null;
  const load = async (text: string) => {
    try { updateProject(p.id, (x) => ({ ...x, isometry: parseIsometry(text, x.units) })); setError(""); }
    catch { setError("This file is not a readable SVG."); }
  };
  const onFile = async (f?: File) => { if (f) load(await f.text()); };
  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <label className="btn cursor-pointer">{p.isometry ? "Replace SVG" : "Upload isometry (SVG)"}
          <input type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {!p.isometry ? <button className="btn btn-ghost" onClick={async () => load(await (await fetch("/samples/isometry-sample.svg")).text())}>Use the sample drawing</button> : null}
        {p.isometry ? <button className="btn btn-ghost" onClick={() => { if (confirm("Remove the isometry?")) updateProject(p.id, (x) => ({ ...x, isometry: undefined })); }}>Remove</button> : null}
        <span className="text-[13px] text-muted" role="status">{error || "The drawing appears next to the unit list on the website. Each linked shape highlights with its row and opens the apartment."}</span>
      </div>
      <div className="panel p-4 mb-5 flex items-center gap-4 flex-wrap">
        <div>
          <div className="font-medium">Building view on the website</div>
          <div className="text-muted text-[13px]">2D shows your drawing. 3D is a model built from the floor plan PDF that visitors can rotate; zooming is limited.</div>
        </div>
        <div className="inline-flex border border-line-strong overflow-hidden ml-auto" style={{ borderRadius: 4 }} role="group" aria-label="Building view">
          {([["2d", "2D drawing (SVG)"], ["3d", "3D model, rotatable"]] as const).map(([v, l]) => (
            <button key={v} aria-pressed={(p.isoMode ?? (p.isometry ? "2d" : "3d")) === v} onClick={() => updateProject(p.id, (x) => ({ ...x, isoMode: v }))} className={`h-9 px-4 text-[14px] transition-colors ${(p.isoMode ?? (p.isometry ? "2d" : "3d")) === v ? "bg-ink text-white" : "bg-surface hover:bg-sunken"}`}>{l}</button>
          ))}
        </div>
        {(p.isoMode ?? (p.isometry ? "2d" : "3d")) === "3d" && !p.floorPlans.length ? <div className="w-full text-[13px]" style={{ color: "var(--warn)" }}>The 3D model needs a floor plan. <a className="underline" href={`/p/${p.id}/plans`}>Upload one under Floor plans</a>.</div> : null}
        {(p.isoMode ?? (p.isometry ? "2d" : "3d")) === "2d" && !p.isometry ? <div className="w-full text-[13px] text-muted">Upload your SVG below.</div> : null}
      </div>
      {p.isometry ? (
        <IsometryMapper iso={p.isometry} units={p.units.filter((u) => (u.use ?? "apartment") === "apartment")} accent={p.accent} onChange={(iso) => updateProject(p.id, (x) => ({ ...x, isometry: iso }))} />
      ) : (
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
          className="block border border-dashed border-line-strong hover:border-ink transition-colors p-16 text-center cursor-pointer" style={{ borderRadius: 6 }}>
          <span className="font-medium block">Drop the isometric drawing here (SVG)</span>
          <span className="text-muted text-[13px]">One polygon or path per apartment. If their ids match your unit numbers, they are linked automatically.</span>
          <input type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      )}
    </div>
  );
}
