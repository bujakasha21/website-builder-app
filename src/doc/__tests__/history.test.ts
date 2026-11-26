import { describe, expect, it } from "vitest";
import { HistoryStack } from "../history";
import { applyOps } from "../ops";
import { defaults, project, registry } from "./fixtures";

const step = (p: ReturnType<typeof project>, title: string) => {
  const r = applyOps(p, [{ op: "updateBlock", id: "hero", props: { title } }], { registry, defaults });
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("HistoryStack", () => {
  it("undoes and redoes AI turns one by one", () => {
    const h = new HistoryStack();
    const p0 = project();
    const a = step(p0, "A"); h.record({ source: "ai", label: "A", summary: a.summary, patches: a.patches, inverse: a.inverse, at: 1000 });
    const b = step(a.project, "B"); h.record({ source: "ai", label: "B", summary: b.summary, patches: b.patches, inverse: b.inverse, at: 1100 });
    expect(h.past).toHaveLength(2);
    const u1 = h.undo(b.project)!;
    expect(u1.project.draft.content[1].props.title).toBe("A");
    const u2 = h.undo(u1.project)!;
    expect(u2.project).toEqual(p0);
    expect(h.undo(u2.project)).toBeNull();
    const r1 = h.redo(u2.project)!;
    expect(r1.project.draft.content[1].props.title).toBe("A");
  });

  it("merges quick user edits into one step, but not across a seal", () => {
    const h = new HistoryStack();
    const p0 = project();
    const a = step(p0, "A"); h.record({ source: "user", label: "x", summary: a.summary, patches: a.patches, inverse: a.inverse, at: 1000 });
    const b = step(a.project, "B"); h.record({ source: "user", label: "x", summary: b.summary, patches: b.patches, inverse: b.inverse, at: 2000 });
    expect(h.past).toHaveLength(1);
    expect(h.undo(b.project)!.project).toEqual(p0);
    h.redo(p0);
    h.seal();
    const c = step(b.project, "C"); h.record({ source: "user", label: "x", summary: c.summary, patches: c.patches, inverse: c.inverse, at: 2100 });
    expect(h.past).toHaveLength(2);
  });

  it("a new change clears the redo stack", () => {
    const h = new HistoryStack();
    const a = step(project(), "A"); h.record({ source: "ai", label: "A", summary: [], patches: a.patches, inverse: a.inverse });
    h.undo(a.project);
    expect(h.future).toHaveLength(1);
    const b = step(project(), "B"); h.record({ source: "ai", label: "B", summary: [], patches: b.patches, inverse: b.inverse });
    expect(h.future).toHaveLength(0);
  });
});
