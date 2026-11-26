"use client";
import type { Data } from "@puckeditor/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { pascal, STARTERS } from "@/editor/pascal/local";
import { blocksOf, progress, suggestFor } from "@/editor/pascal/rules";
import type { Issue, Proposal } from "@/editor/pascal/types";
import { getProject, updateProject } from "@/lib/store";
import type { Project } from "@/lib/types";

interface Snapshot { data?: Data; accent?: string; locales?: string[] }
interface Msg { id: number; from: "pascal" | "user"; text: string; proposal?: Proposal; state?: "open" | "done" | "declined" | "undone"; undo?: Snapshot }

const changesSomething = (p: Proposal) => !!(p.apply || p.patchProject);
const needsConfirm = (p: Proposal) => !!(p.apply || p.patchProject || p.go || p.open);

/**
 * Pascal's chat bar, docked at the bottom of the editor and the dashboard.
 * It only talks to the PascalProvider interface, so a real model can replace the local rules without changes here.
 * Nothing is changed before the user confirms, and every change can be undone from the chat.
 */
export default function PascalBar({ mode, project, data, selectedId, onData, onOpenSettings }: { mode: "editor" | "home"; project?: Project; data?: Data; selectedId?: string | null; onData?: (d: Data) => void; onOpenSettings?: () => void }) {
  // bottom-right corner: open on the dashboard, a small launcher in the editor so it never covers the fields
  const [open, setOpen] = useState(mode === "home");
  const [talk, setTalk] = useState(false);
  const [list, setList] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const seq = useRef(1);
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  const key = `sb-pascal-${mode}`;
  useEffect(() => { try { const v = localStorage.getItem(key); if (v) setOpen(v === "open"); } catch {} }, [key]);
  const toggle = (v: boolean) => { setOpen(v); try { localStorage.setItem(key, v ? "open" : "closed"); } catch {} };
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, talk]);

  const prog = useMemo(() => (project && data ? progress(project, data) : null), [project, data]);
  const selected = data && selectedId ? blocksOf(data).find((c) => c.props.id === selectedId) : undefined;
  const hint = useMemo(() => { const s = selected && project && data ? suggestFor(selected, project, data) : null; return s && !skipped.includes(s.id) ? s : null; }, [selected, project, data, skipped]);

  const push = (m: Omit<Msg, "id">) => setMsgs((x) => [...x, { ...m, id: seq.current++ }]);
  const snapshot = (): Snapshot => { const p = project ? getProject(project.id) ?? project : undefined; return { data, accent: p?.accent, locales: p?.locales }; };

  /** carries out a confirmed proposal; returns what is needed to undo it */
  const run = (pr: Pick<Proposal, "apply" | "patchProject" | "go" | "open">): Snapshot | undefined => {
    const before = snapshot();
    if (pr.apply && data && onData) onData(pr.apply(data));
    if (pr.patchProject && project) updateProject(project.id, pr.patchProject);
    if (pr.open === "settings") onOpenSettings?.();
    if (pr.go) { if (mode === "editor") window.open(pr.go, "_blank"); else window.location.assign(pr.go); }
    return pr.apply || pr.patchProject ? before : undefined;
  };
  const restore = (s: Snapshot) => {
    if (s.data && onData) onData(s.data);
    if (project) updateProject(project.id, (x) => ({ ...x, accent: s.accent ?? x.accent, locales: s.locales }));
  };
  const undoLast = () => {
    const m = [...msgs].reverse().find((x) => x.state === "done" && x.undo);
    if (!m?.undo) return push({ from: "pascal", text: "There is nothing of mine to undo." });
    restore(m.undo);
    setMsgs((x) => x.map((y) => (y.id === m.id ? { ...y, state: "undone" } : y)));
    push({ from: "pascal", text: "Undone. Everything is as it was." });
  };

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setInput(""); setTalk(true);
    push({ from: "user", text });
    if (/^(undo|undo that|revert|go back)\b/i.test(text)) return undoLast();
    setBusy(true);
    const pr = await pascal.respond(text, { project, data, selectedId });
    setBusy(false);
    push({ from: "pascal", text: pr.reply, proposal: pr, state: needsConfirm(pr) ? "open" : undefined });
  };
  const decide = (m: Msg, ok: boolean) => {
    if (!m.proposal) return;
    const undo = ok ? run(m.proposal) : undefined;
    setMsgs((x) => x.map((y) => (y.id === m.id ? { ...y, state: ok ? "done" : "declined", undo } : y)));
  };
  const fixIssue = (i: Issue) => {
    if (!i.fix) return;
    const undo = run(i.fix);
    push({ from: "pascal", text: i.fix.apply ? `Done: ${i.fixLabel?.toLowerCase() ?? i.title}.` : `Opening that for you: ${i.title.toLowerCase()}.`, proposal: { reply: "", ...i.fix }, state: undo ? "done" : undefined, undo });
  };
  const takeHint = () => {
    if (!hint) return;
    const undo = run(hint);
    setTalk(true);
    push({ from: "pascal", text: `Done. ${hint.changes?.[0] ?? ""}`, proposal: hint, state: "done", undo });
  };

  if (!open)
    return (
      <div className={`pascal-dock ${mode}`}>
        {hint ? (
          <div className="pascal-hint rise">
            <span className="pascal-hint-text"><span className="pascal-tag">Suggestion</span>{hint.reply}</span>
            <button type="button" className="pascal-do" onClick={() => { toggle(true); takeHint(); }}>Do it</button>
            <button type="button" className="pascal-x" onClick={() => setSkipped((x) => [...x, hint.id])} aria-label="Dismiss suggestion">×</button>
          </div>
        ) : null}
        <button type="button" className="pascal-pill" onClick={() => { toggle(true); setTimeout(() => field.current?.focus(), 50); }} aria-label="Open Pascal">
          <span className="pascal-face" aria-hidden>P</span>Ask Pascal
          {prog && prog.percent < 100 ? <span className="pascal-pct">{prog.percent}%</span> : null}
        </button>
      </div>
    );

  const starters = STARTERS[mode];
  return (
    <div className={`pascalbox ${mode}`} role="region" aria-label="Pascal">
      {hint && !talk ? (
        <div className="pascal-hint rise">
          <span className="pascal-hint-text"><span className="pascal-tag">Suggestion</span>{hint.reply}</span>
          <button type="button" className="pascal-do" onClick={takeHint}>Do it</button>
          <button type="button" className="pascal-x" onClick={() => setSkipped((s) => [...s, hint.id])} aria-label="Dismiss suggestion">×</button>
        </div>
      ) : null}

      {list && prog ? (
        <div className="pascal-card rise" role="dialog" aria-label="Progress">
          <div className="pascal-card-head"><b>{prog.percent === 100 ? "All done. Nice work." : `You are ${prog.percent}% done`}</b><button type="button" className="pascal-x" onClick={() => setList(false)} aria-label="Close">×</button></div>
          <ul className="pascal-steps">
            {prog.steps.map((s) => (
              <li key={s.id} className={s.done ? "done" : ""}>
                <i aria-hidden />{s.label}
                {!s.done && s.go ? <a href={s.go} target="_blank" rel="noreferrer">Add</a> : null}
                {!s.done && s.id === "publish" ? <span>Use the Publish button</span> : null}
                {!s.done && s.id === "photos" ? <span>Click a picture on the page</span> : null}
              </li>
            ))}
          </ul>
          <button type="button" className="pascal-link" onClick={() => { setList(false); ask("Check my site"); }}>Check my site</button>
        </div>
      ) : null}

      {talk && msgs.length ? (
        <div className="pascal-talk rise" aria-live="polite">
          <div className="pascal-talk-head"><span>Pascal</span><small>{pascal.label}</small><button type="button" className="pascal-x" onClick={() => setTalk(false)} aria-label="Hide conversation">×</button></div>
          <div className="pascal-msgs">
            {msgs.map((m) => (
              <div key={m.id} className={`pascal-msg from-${m.from} rise`}>
                {m.text ? <p>{m.text}</p> : null}
                {m.proposal?.changes?.length && m.from === "pascal" && m.state !== undefined && m.proposal.reply ? <ul className="pascal-changes">{m.proposal.changes.map((c, k) => <li key={k}>{c}</li>)}</ul> : null}
                {m.proposal?.issues ? (
                  <ul className="pascal-issues">
                    {m.proposal.issues.map((i) => (
                      <li key={i.id}><div><b>{i.title}</b><span>{i.why}</span></div>{i.fix ? <button type="button" className="pascal-do ghost" onClick={() => fixIssue(i)}>{i.fixLabel ?? "Fix"}</button> : null}</li>
                    ))}
                  </ul>
                ) : null}
                {m.state === "open" && m.proposal ? (
                  <div className="pascal-actions">
                    <button type="button" className="pascal-do" onClick={() => decide(m, true)}>{m.proposal.confirmLabel ?? (changesSomething(m.proposal) ? "Do it" : "Open")}</button>
                    <button type="button" className="pascal-do ghost" onClick={() => decide(m, false)}>No thanks</button>
                  </div>
                ) : null}
                {m.state === "done" ? <div className="pascal-actions"><span className="pascal-tick">Done</span>{m.undo ? <button type="button" className="pascal-do ghost" onClick={() => { restore(m.undo!); setMsgs((x) => x.map((y) => (y.id === m.id ? { ...y, state: "undone" } : y))); }}>Undo</button> : null}</div> : null}
                {m.state === "undone" ? <div className="pascal-actions"><span className="pascal-muted">Undone</span></div> : null}
                {m.state === "declined" ? <div className="pascal-actions"><span className="pascal-muted">Left as it was</span></div> : null}
                {m.proposal?.examples?.length ? <div className="pascal-chips">{m.proposal.examples.map((e) => <button key={e} type="button" onClick={() => ask(e)}>{e}</button>)}</div> : null}
              </div>
            ))}
            {busy ? <div className="pascal-msg from-pascal"><p className="pascal-muted">Thinking …</p></div> : null}
            <div ref={end} />
          </div>
        </div>
      ) : null}

      {!talk && !msgs.length ? <div className="pascal-chips start">{starters.map((e) => <button key={e} type="button" onClick={() => ask(e)}>{e}</button>)}</div> : null}

      <form className="pascal-bar" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <span className="pascal-face" aria-hidden>P</span>
        <input ref={field} value={input} onChange={(e) => setInput(e.target.value)} onFocus={() => msgs.length && setTalk(true)} placeholder={mode === "editor" ? "Ask Pascal: “add a gallery”, “make it blue” …" : "Ask Pascal: “new website” …"} aria-label="Message to Pascal" autoComplete="off" />
        {prog ? (
          <button type="button" className={`pascal-ring ${prog.percent === 100 ? "full" : ""}`} onClick={() => setList(!list)} aria-expanded={list} aria-label={`${prog.percent}% done, show the list`} style={{ ["--pct" as string]: prog.percent }}>
            <span>{prog.percent === 100 ? "✓" : `${prog.percent}%`}</span>
          </button>
        ) : null}
        <button type="submit" className="pascal-send" disabled={!input.trim() || busy} aria-label="Send">↑</button>
        <button type="button" className="pascal-x" onClick={() => toggle(false)} aria-label="Minimise Pascal" title="Minimise">–</button>
      </form>
    </div>
  );
}
