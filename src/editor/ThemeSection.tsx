"use client";
import { useState } from "react";
import { commit } from "@/doc/commit";
import { checkContrast, resolveTheme } from "@/doc/theme";
import type { ThemeColors } from "@/doc/schema";
import { FONTS } from "@/lib/fonts";
import type { Project } from "@/lib/types";

const COLORS: [keyof ThemeColors | "primary", string, string][] = [
  ["primary", "Primary", "Buttons, links, highlights"],
  ["secondary", "Secondary", "Dark bands and the footer"],
  ["background", "Background", "Page background"],
  ["surface", "Surface", "Alternating sections, cards"],
  ["text", "Text", "Headings and running text"],
  ["muted", "Muted text", "Small labels, captions"],
];

function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: (readonly [T, string])[]; label: string }) {
  return (
    <div className="st-seg" role="group" aria-label={label}>
      {options.map(([v, l]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

/**
 * Theme tokens of the whole site. Every change is one command-layer operation (setThemeTokens), so it can be undone,
 * shows in History, and Pascal / the AI agents change exactly the same values.
 */
export default function ThemeSection({ project, template, legacy }: { project: Project; template: string; legacy: { fontFamily?: string; textScale?: string } }) {
  const t = project.theme ?? {};
  const r = resolveTheme(template, project.accent, t, legacy);
  const issues = checkContrast(r);
  const [error, setError] = useState<string | null>(null);
  const set = (tokens: Record<string, unknown>, label: string) => {
    const res = commit(project.id, [{ op: "setThemeTokens", tokens }], { source: "user", label });
    setError(res.ok ? null : res.error);
  };
  const overridden = (k: string) => (k === "primary" ? false : !!t.colors?.[k as keyof ThemeColors]);

  return (
    <div className="theme-sec">
      <div className="st-sub">Colours</div>
      <div className="theme-colors">
        {COLORS.map(([k, label, hint]) => {
          const value = r.colors[k];
          return (
            <label key={k} className={`theme-color ${overridden(k) ? "is-set" : ""}`} title={hint}>
              <input type="color" value={value} onChange={(e) => set(k === "primary" ? { primary: e.target.value } : { colors: { [k]: e.target.value } }, `Theme: ${label.toLowerCase()} colour`)} aria-label={`${label} colour`} />
              <span className="theme-color-t">{label}<small className="tnum">{value.toUpperCase()}</small></span>
              {overridden(k) ? <button type="button" className="theme-reset" onClick={(e) => { e.preventDefault(); set({ colors: { [k]: null } }, `Theme: ${label.toLowerCase()} back to template`); }} aria-label={`Reset ${label} to the template colour`} title="Back to the template colour">↺</button> : null}
            </label>
          );
        })}
      </div>
      {issues.length ? (
        <ul className="theme-issues" role="status">
          {issues.map((i) => <li key={i.pair}><b>{i.pair}</b> {i.ratio}:1 – needs {i.need}:1 to be easy to read (WCAG AA).</li>)}
        </ul>
      ) : <p className="st-note theme-ok">All text colours pass the WCAG AA contrast check.</p>}

      <div className="st-sub">Fonts</div>
      {(["heading", "body"] as const).map((k) => (
        <div className="st-row" key={k}>
          <div className="st-label">{k === "heading" ? "Headings" : "Running text"}</div>
          <div className="st-ctrl">
            <select className="select" value={t.fonts?.[k] ?? "template"} onChange={(e) => set({ fonts: { [k]: e.target.value === "template" ? null : e.target.value } }, `Theme: ${k} font`)} aria-label={k === "heading" ? "Heading font" : "Body font"}>
              <option value="template">From the template ({FONTS[r.fonts[k]]?.label ?? r.fonts[k]})</option>
              {Object.entries(FONTS).map(([key, f]) => <option key={key} value={key}>{f.label}</option>)}
            </select>
          </div>
        </div>
      ))}
      <div className="st-row">
        <div className="st-label">Text size</div>
        <div className="st-ctrl"><Seg label="Text size" value={r.typeScale} onChange={(v) => set({ typeScale: v }, "Theme: text size")} options={[["s", "Small"], ["m", "Normal"], ["l", "Large"]]} /></div>
      </div>

      <div className="st-sub">Shape and space</div>
      <div className="st-row">
        <div className="st-label">Corners</div>
        <div className="st-ctrl"><Seg label="Corners" value={t.radius ?? "template"} onChange={(v) => set({ radius: v === "template" ? null : v }, "Theme: corners")} options={[["template", "Template"], ["none", "Square"], ["small", "Small"], ["medium", "Round"], ["large", "Very round"]]} /></div>
      </div>
      <div className="st-row">
        <div className="st-label">Shadows</div>
        <div className="st-ctrl"><Seg label="Shadows" value={t.shadow ?? "template"} onChange={(v) => set({ shadow: v === "template" ? null : v }, "Theme: shadows")} options={[["template", "Template"], ["none", "None"], ["soft", "Soft"], ["strong", "Strong"]]} /></div>
      </div>
      <div className="st-row">
        <div className="st-label">Spacing</div>
        <div className="st-ctrl"><Seg label="Spacing" value={t.spacing ?? "template"} onChange={(v) => set({ spacing: v === "template" ? null : v }, "Theme: spacing")} options={[["template", "Template"], ["compact", "Compact"], ["normal", "Normal"], ["airy", "Airy"]]} /></div>
      </div>
      {error ? <p className="pascal-warn" role="alert">Not applied: {error}</p> : null}
    </div>
  );
}
