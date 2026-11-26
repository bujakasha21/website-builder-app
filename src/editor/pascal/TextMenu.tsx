"use client";
import { useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/types";
import { pascalText, TEXT_ACTIONS, type TextAction, type TextResult } from "./text";

/**
 * The small Pascal menu under a text field: pick what to do, see the proposal next to the original,
 * then Accept, Try again or Cancel. Nothing changes before Accept.
 */
export default function TextMenu({ value, onChange, block, field, project }: { value: string; onChange: (v: string) => void; block?: string; field?: string; project?: Project }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<{ action: TextAction; attempt: number; res: TextResult } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const run = async (action: TextAction, attempt = 0) => {
    setOpen(false); setBusy(true);
    const res = await pascalText.rewrite({ action, text: value ?? "", block, field, project, attempt });
    setBusy(false);
    setJob({ action, attempt, res });
  };
  const same = job ? job.res.text.trim() === (value ?? "").trim() : false;
  const label = job ? TEXT_ACTIONS.find((a) => a.id === job.action) : null;
  return (
    <div className="txm" ref={box}>
      <button type="button" className="txm-btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)} disabled={busy}>
        <span className="txm-face" aria-hidden>P</span>{busy ? "Thinking …" : "Pascal"}
      </button>
      {open ? (
        <div className="txm-menu rise" role="menu">
          {TEXT_ACTIONS.filter((a) => !a.group).map((a) => <button key={a.id} type="button" role="menuitem" onClick={() => run(a.id)}>{a.label}</button>)}
          <div className="txm-group">Change tone</div>
          <div className="txm-tones">{TEXT_ACTIONS.filter((a) => a.group).map((a) => <button key={a.id} type="button" role="menuitem" onClick={() => run(a.id)}>{a.label}</button>)}</div>
        </div>
      ) : null}
      {job ? (
        <div className="txm-card rise" role="group" aria-label="Pascal's proposal">
          <div className="txm-head"><b>{label?.group ? `${label.group}: ${label.label}` : label?.label}</b><span>{pascalText.label}</span></div>
          {same ? <p className="txm-note">{job.res.note ?? "Nothing to change."}</p> : (
            <>
              <div className="txm-pair">
                <div><span>Now</span><p>{value || "(empty)"}</p></div>
                <div className="new"><span>Pascal</span><p>{job.res.text}</p></div>
              </div>
              {job.res.note ? <p className="txm-note">{job.res.note}</p> : null}
            </>
          )}
          <div className="txm-actions">
            {!same ? <button type="button" className="pascal-do" onClick={() => { onChange(job.res.text); setJob(null); }}>Accept</button> : null}
            <button type="button" className="pascal-do ghost" onClick={() => run(job.action, job.attempt + 1)}>Try again</button>
            <button type="button" className="pascal-do ghost" onClick={() => setJob(null)}>Cancel</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
