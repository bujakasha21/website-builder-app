"use client";
import { ActionBar, Render, usePuck, type Config, type Data } from "@puckeditor/core";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

let registered: Config | null = null;
/** the block config is registered here after it is built (the picker renders live thumbnails with it) */
export const registerConfig = (c: Config) => { registered = c; };

export interface Variant { value: string; label: string }
type Item = { type: string; props: Record<string, unknown> };
const OPEN = "sb-versions";
const openGallery = () => window.dispatchEvent(new CustomEvent(OPEN));

/** the version field of a block type, if it has one */
export function versionsOf(type?: string): { field: string; variants: Variant[] } | null {
  const fields = (type && registered?.components?.[type]?.fields) as Record<string, { variants?: Variant[] }> | undefined;
  for (const [field, f] of Object.entries(fields ?? {})) if (f?.variants) return { field, variants: f.variants };
  return null;
}

/** current version of the selected block and a setter that works from the sidebar, the canvas bar and the gallery */
function useVersion() {
  const { appState, selectedItem, dispatch } = usePuck();
  const item = selectedItem as Item | null;
  const v = versionsOf(item?.type);
  const value = v && item ? String(item.props[v.field] ?? v.variants[0].value) : "";
  const idx = v ? Math.max(0, v.variants.findIndex((x) => x.value === value)) : 0;
  const set = (next: string) => {
    const sel = appState.ui.itemSelector;
    if (!sel || !item || !v) return;
    dispatch({ type: "replace", destinationIndex: sel.index, destinationZone: sel.zone ?? "root:default-zone", data: { ...item, props: { ...item.props, [v.field]: next } } as never });
  };
  const go = (d: number) => v && set(v.variants[(idx + d + v.variants.length) % v.variants.length].value);
  return { item, v, value, idx, set, go, root: appState.data.root };
}

/** live miniature of a block at desktop width */
function Thumb({ children, ratio = 0.56 }: { children: React.ReactNode; ratio?: number }) {
  const box = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return (
    <span ref={box} className="gp-frame" style={{ height: w ? w * ratio : 140 }} aria-hidden>
      {w ? <span className="gp-render vp-render" style={{ width: 1200, transform: `scale(${w / 1200})` }}>{children}</span> : null}
    </span>
  );
}

/** sidebar: arrows, counter and a button that opens the large overview */
function VariantPicker() {
  const { v, idx, go } = useVersion();
  if (!v) return null;
  return (
    <div className="vp">
      <div className="vp-top">
        <button type="button" className="vp-arrow" onClick={() => go(-1)} aria-label="Previous version">←</button>
        <div className="vp-count" aria-live="polite">
          <span className="vp-num">{String(idx + 1).padStart(2, "0")}</span>
          <span className="vp-of">/ {String(v.variants.length).padStart(2, "0")}</span>
          <span className="vp-name">{v.variants[idx]?.label}</span>
        </div>
        <button type="button" className="vp-arrow" onClick={() => go(1)} aria-label="Next version">→</button>
      </div>
      <div className="vp-bar" aria-hidden>{v.variants.map((x, i) => <i key={x.value} className={i === idx ? "on" : i < idx ? "past" : ""} />)}</div>
      <button type="button" className="vp-all" onClick={openGallery}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden><rect x="0" y="0" width="6" height="6" rx="1.5" /><rect x="8" y="0" width="6" height="6" rx="1.5" /><rect x="0" y="8" width="6" height="6" rx="1.5" /><rect x="8" y="8" width="6" height="6" rx="1.5" /></svg>
        Compare all {v.variants.length} versions
      </button>
    </div>
  );
}

export const variantField = (field: string, variants: Variant[]) => ({
  type: "custom" as const,
  label: "Version",
  variants,
  render: () => <VariantPicker />,
});

/** bar above the selected block on the canvas: the usual actions plus the version switcher right where you look */
export function BlockBar({ label, children, parentAction }: { label?: string; children: React.ReactNode; parentAction: React.ReactNode }) {
  const { v, idx, go } = useVersion();
  return (
    <ActionBar>
      <ActionBar.Group>{parentAction}{label ? <ActionBar.Label label={label} /> : null}</ActionBar.Group>
      {v ? (
        <ActionBar.Group>
          <ActionBar.Action onClick={() => go(-1)} label="Previous version">←</ActionBar.Action>
          <ActionBar.Label label={`${idx + 1} / ${v.variants.length} · ${v.variants[idx]?.label ?? ""}`} />
          <ActionBar.Action onClick={() => go(1)} label="Next version">→</ActionBar.Action>
          <ActionBar.Action onClick={openGallery} label="Compare all versions">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden><rect x="0" y="0" width="6" height="6" rx="1.5" /><rect x="8" y="0" width="6" height="6" rx="1.5" /><rect x="0" y="8" width="6" height="6" rx="1.5" /><rect x="8" y="8" width="6" height="6" rx="1.5" /></svg>
          </ActionBar.Action>
        </ActionBar.Group>
      ) : null}
      <ActionBar.Group>{children}</ActionBar.Group>
    </ActionBar>
  );
}

/** large overview of every version of the selected block; lives once inside the editor */
export function VersionGallery({ projectId }: { projectId: string }) {
  const { item, v, value, set, root } = useVersion();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener(OPEN, on); window.addEventListener("keydown", esc);
    return () => { window.removeEventListener(OPEN, on); window.removeEventListener("keydown", esc); };
  }, []);
  if (!open || !v || !item || !registered) return null;
  const label = (registered.components[item.type] as { label?: string } | undefined)?.label ?? item.type;
  return createPortal(
    <div className="vg" role="dialog" aria-modal aria-label={`Versions of ${label}`} onClick={() => setOpen(false)}>
      <div className="vg-sheet settle" onClick={(e) => e.stopPropagation()}>
        <div className="vg-head">
          <div><div className="eyebrow">{label}</div><div className="vg-title">Choose a version</div></div>
          <button className="btn btn-sm" onClick={() => setOpen(false)}>Done</button>
        </div>
        <div className="vg-grid" role="listbox">
          {v.variants.map((x, i) => (
            <button key={x.value} type="button" role="option" aria-selected={x.value === value} aria-pressed={x.value === value} className="panel gp-card" onClick={() => set(x.value)} onDoubleClick={() => setOpen(false)}>
              <Thumb><Render config={registered!} data={{ root, zones: {}, content: [{ type: item.type, props: { ...item.props, [v.field]: x.value, id: `vg-${x.value}` } }] } as Data} metadata={{ projectId, partial: true }} /></Thumb>
              <span className="gp-meta"><span className="gp-name"><b>{String(i + 1).padStart(2, "0")}</b> {x.label}</span></span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
