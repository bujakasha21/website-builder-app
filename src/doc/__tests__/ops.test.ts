import { applyPatches } from "immer";
import { describe, expect, it } from "vitest";
import { applyOps } from "../ops";
import { defaults, project, registry } from "./fixtures";

const opt = { registry, defaults };
const types = (p: ReturnType<typeof project>) => p.draft.content.map((b) => b.type);

describe("applyOps", () => {
  it("adds a block with the type's defaults at the given position", () => {
    const r = applyOps(project(), [{ op: "addBlock", index: 1, block: { type: "Gallery", props: { variant: "grid" } } }], opt);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(types(r.project)).toEqual(["Header", "Gallery", "Hero", "Text"]);
    expect(r.project.draft.content[1].props.id).toMatch(/^Gallery-/);
    expect(r.summary[0]).toContain("Added Gallery");
  });

  it("updates only the given fields and names them", () => {
    const r = applyOps(project(), [{ op: "updateBlock", id: "hero", props: { title: "Neu" } }], opt);
    if (!r.ok) throw new Error(r.error);
    expect(r.project.draft.content[1].props).toMatchObject({ id: "hero", title: "Neu", text: "Living in Bern" });
    expect(r.summary).toEqual(["Hero: title"]);
  });

  it("reports no change when the value is already set", () => {
    const r = applyOps(project(), [{ op: "updateBlock", id: "hero", props: { title: "Parkhof" } }], opt);
    if (!r.ok) throw new Error(r.error);
    expect(r.changed).toBe(false);
    expect(r.summary).toEqual([]);
  });

  it("moves, duplicates and deletes", () => {
    const r = applyOps(project(), [{ op: "moveBlock", id: "t1", to: 1 }, { op: "duplicateBlock", id: "hero" }, { op: "deleteBlock", id: "h" }], opt);
    if (!r.ok) throw new Error(r.error);
    expect(types(r.project)).toEqual(["Text", "Hero", "Hero"]);
    expect(new Set(r.project.draft.content.map((b) => b.props.id)).size).toBe(3);
  });

  it("refuses unknown fields and unknown block types", () => {
    const a = applyOps(project(), [{ op: "updateBlock", id: "hero", props: { colour: "red" } }], opt);
    expect(a).toMatchObject({ ok: false });
    if (!a.ok) expect(a.error).toContain("“colour”");
    const b = applyOps(project(), [{ op: "addBlock", block: { type: "Rocket" } }], opt);
    expect(b).toMatchObject({ ok: false });
  });

  it("refuses malformed operations before touching anything", () => {
    const r = applyOps(project(), [{ op: "setThemeTokens", tokens: { primary: "blue" } }], opt);
    expect(r).toMatchObject({ ok: false, index: 0 });
  });

  it("is atomic: a failing second op leaves the project untouched", () => {
    const p = project();
    const before = JSON.stringify(p);
    const r = applyOps(p, [{ op: "updateBlock", id: "hero", props: { title: "X" } }, { op: "deleteBlock", id: "missing" }], opt);
    expect(r).toMatchObject({ ok: false, index: 1 });
    expect(JSON.stringify(p)).toBe(before);
  });

  it("inverse patches restore the original exactly", () => {
    const p = project();
    const r = applyOps(p, [{ op: "addBlock", block: { type: "Text", props: { title: "New" } } }, { op: "updateBlock", id: "hero", props: { title: "Y" } }, { op: "setThemeTokens", tokens: { primary: "#112233", radius: "large" } }], opt);
    if (!r.ok) throw new Error(r.error);
    expect(applyPatches(r.project, r.inverse)).toEqual(p);
    expect(applyPatches(p, r.patches)).toEqual(r.project);
  });

  it("theme tokens: primary goes to accent, null resets to the template", () => {
    const r1 = applyOps(project(), [{ op: "setThemeTokens", tokens: { primary: "#112233", colors: { background: "#000000" }, spacing: "airy" } }], opt);
    if (!r1.ok) throw new Error(r1.error);
    expect(r1.project.accent).toBe("#112233");
    expect(r1.project.theme).toEqual({ colors: { background: "#000000" }, spacing: "airy" });
    expect(r1.summary).toContain("Primary colour #1F5C4A → #112233");
    const r2 = applyOps(r1.project, [{ op: "setThemeTokens", tokens: { colors: { background: null }, spacing: null } }], opt);
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.project.theme).toEqual({});
  });

  it("pages: create with a free address, rename, SEO, delete", () => {
    const p = project({ pages: [{ id: "a", slug: "contact", title: "Contact", draft: { root: { props: {} }, content: [], zones: {} }, published: null }] });
    const r = applyOps(p, [{ op: "createPage", id: "b", title: "Contact" }, { op: "renamePage", page: "b", title: "Kontakt 2" }, { op: "setPageSeo", page: "b", seo: { title: "Kontakt" } }], opt);
    if (!r.ok) throw new Error(r.error);
    const b = r.project.pages!.find((x) => x.id === "b")!;
    expect(b.slug).toBe("contact-2");
    expect(b.title).toBe("Kontakt 2");
    expect(b.seo).toEqual({ title: "Kontakt" });
    const d = applyOps(r.project, [{ op: "deletePage", page: "a" }], opt);
    if (!d.ok) throw new Error(d.error);
    expect(d.project.pages!.map((x) => x.id)).toEqual(["b"]);
  });

  it("other languages get their own copy of the home page", () => {
    const p = project({ locales: ["fr-CH"] });
    const r = applyOps(p, [{ op: "updateBlock", lang: "fr-CH", id: "hero", props: { title: "Bienvenue" } }], opt);
    if (!r.ok) throw new Error(r.error);
    expect(r.project.drafts!["fr-CH"].content[1].props.title).toBe("Bienvenue");
    expect(r.project.draft.content[1].props.title).toBe("Parkhof");
    expect(applyOps(p, [{ op: "updateBlock", lang: "it-CH", id: "hero", props: { title: "x" } }], opt)).toMatchObject({ ok: false });
  });

  it("replacePageData describes what changed and syncs the template", () => {
    const p = project();
    const data = JSON.parse(JSON.stringify(p.draft));
    data.content[1].props.title = "Neu";
    data.content.splice(2, 1);
    data.root.props.template = "lumen";
    const r = applyOps(p, [{ op: "replacePageData", data }], opt);
    if (!r.ok) throw new Error(r.error);
    expect(r.summary).toEqual(["Removed Text", "Hero: title", "Site settings: template"]);
    expect(r.project.template).toBe("lumen");
  });

  it("languages and restore", () => {
    const p = project();
    const r = applyOps(p, [{ op: "setLocales", locales: ["fr-CH", "de-CH", "fr-CH"] }], opt);
    if (!r.ok) throw new Error(r.error);
    expect(r.project.locales).toEqual(["fr-CH"]);
    const snap = { name: "Old", template: "atelier", accent: "#000000", draft: p.draft };
    const back = applyOps(r.project, [{ op: "restoreVersion", label: "v1", snapshot: snap }], opt);
    if (!back.ok) throw new Error(back.error);
    expect(back.project.name).toBe("Old");
    expect(back.project.locales).toBeUndefined();
    expect(back.project.units).toBe(p.units);
  });
});
