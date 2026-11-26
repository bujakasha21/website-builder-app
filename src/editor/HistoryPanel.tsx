"use client";
import { useEffect, useState } from "react";
import { redo, undo, useHistory } from "@/doc/commit";
import { deleteVersion, restoreVersion, saveVersion, useVersions } from "@/doc/versions";

const SOURCE: Record<string, string> = { user: "You", ai: "Pascal", system: "System" };
const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleString("de-CH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

/**
 * Undo / redo for the whole site (sections, pages, theme, Pascal's changes).
 * `before` saves what the canvas still holds, `after` reloads the canvas from the store.
 */
export function UndoRedo({ projectId, before, after }: { projectId: string; before: () => void; after: () => void }) {
  const h = useHistory(projectId);
  const go = (dir: "undo" | "redo") => { before(); if ((dir === "undo" ? undo : redo)(projectId)) after(); };
  useEffect(() => {
    // ⌘Z inside a text field stays the browser's own text undo
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, [contenteditable=true]"))) return;
      e.preventDefault();
      e.stopPropagation();
      go(e.shiftKey ? "redo" : "undo");
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });
  const last = h.past[h.past.length - 1], next = h.future[h.future.length - 1];
  return (
    <div className="st-seg undo-redo" role="group" aria-label="Undo and redo" style={{ height: 34 }}>
      <button type="button" disabled={!h.canUndo} onClick={() => go("undo")} title={last ? `Undo: ${last.label} (⌘Z)` : "Nothing to undo"} aria-label={last ? `Undo ${last.label}` : "Undo"}>↶</button>
      <button type="button" disabled={!h.canRedo} onClick={() => go("redo")} title={next ? `Redo: ${next.label} (⇧⌘Z)` : "Nothing to redo"} aria-label={next ? `Redo ${next.label}` : "Redo"}>↷</button>
    </div>
  );
}

/** the canvas (and this panel inside its header) reloads after a restore; the message survives that */
let carried: string | null = null;

/** what changed in this session, and the saved versions to go back to */
export default function HistoryPanel({ projectId, before, after, onClose }: { projectId: string; before: () => void; after: () => void; onClose: () => void }) {
  const h = useHistory(projectId);
  const versions = useVersions(projectId);
  const [tab, setTab] = useState<"changes" | "versions">(() => (carried ? "versions" : "changes"));
  const [name, setName] = useState("");
  const [msg, setMsgState] = useState<string | null>(() => { const m = carried; carried = null; return m; });
  const setMsg = setMsgState;
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const restore = async (vid: string) => {
    before();
    const r = await restoreVersion(projectId, vid);
    setConfirmId(null);
    if (!r.ok) return setMsg(`Could not restore: ${r.error}`);
    setMsg((carried = r.changed ? `${r.summary[0]}. Undo brings the previous state back.` : "That version is the same as now; nothing changed."));
    after();
  };
  const undoTo = (n: number) => { before(); for (let i = 0; i < n; i++) undo(projectId); after(); };

  return (
    <aside className="st-drawer hist-drawer rise" aria-label="History">
      <div className="st-head">
        <div><div className="eyebrow">History</div><div className="st-title">Changes and versions</div></div>
        <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="st-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "changes"} onClick={() => setTab("changes")}>This session</button>
        <button role="tab" aria-selected={tab === "versions"} onClick={() => setTab("versions")}>Saved versions</button>
      </div>
      <div className="st-body">
        {msg ? <p className="note" role="status">{msg}</p> : null}
        {tab === "changes" ? (
          h.past.length || h.future.length ? (
            <ol className="hist-list">
              {[...h.future].map((e) => (
                <li key={e.id} className="undone"><span className={`hist-src s-${e.source}`}>{SOURCE[e.source]}</span><span className="hist-label">{e.label}</span><span className="hist-at">undone</span></li>
              ))}
              {[...h.past].reverse().map((e, i) => (
                <li key={e.id}>
                  <span className={`hist-src s-${e.source}`}>{SOURCE[e.source]}</span>
                  <span className="hist-label" title={e.summary.join("\n")}>{e.label}{e.summary.length > 1 ? <small> +{e.summary.length - 1} more</small> : null}</span>
                  <span className="hist-at">{ago(e.at)}</span>
                  <button type="button" className="btn btn-sm" onClick={() => undoTo(i + 1)} aria-label={`Undo back to before: ${e.label}`}>{i === 0 ? "Undo" : `Undo ${i + 1}`}</button>
                </li>
              ))}
            </ol>
          ) : <p className="st-note">No changes yet in this session. Everything you, Pascal or a restore changes shows up here and can be undone.</p>
        ) : (
          <>
            <form className="hist-save" onSubmit={async (e) => { e.preventDefault(); before(); await saveVersion(projectId, name.trim() || "Saved by hand"); setName(""); setMsg("Version saved."); }}>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this version, e.g. Before the redesign" aria-label="Version name" />
              <button className="btn btn-sm btn-primary" type="submit">Save version</button>
            </form>
            <p className="st-note">Versions keep pages, texts, theme and languages. Apartments, floor plans and enquiries are never rolled back. A version is saved automatically when you open the editor and when you publish.</p>
            {versions === null ? <p className="st-note">Loading …</p> : versions.length === 0 ? <p className="st-note">No saved versions yet.</p> : (
              <ol className="hist-list">
                {versions.map((v) => (
                  <li key={v.id}>
                    <span className={`hist-src ${v.auto ? "s-system" : "s-user"}`}>{v.auto ? "Auto" : "Saved"}</span>
                    <span className="hist-label">{v.label}</span>
                    <span className="hist-at">{ago(v.at)}</span>
                    {confirmId === v.id ? (
                      <span className="hist-confirm"><button type="button" className="btn btn-sm btn-primary" onClick={() => restore(v.id)}>Restore</button><button type="button" className="btn btn-sm" onClick={() => setConfirmId(null)}>Cancel</button></span>
                    ) : (
                      <span className="hist-confirm"><button type="button" className="btn btn-sm" onClick={() => setConfirmId(v.id)}>Restore…</button>{!v.auto ? <button type="button" className="btn btn-sm btn-ghost" onClick={() => deleteVersion(v.id)} aria-label={`Delete version ${v.label}`}>×</button> : null}</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
