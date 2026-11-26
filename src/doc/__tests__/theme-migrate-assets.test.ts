import { describe, expect, it } from "vitest";
import { collectDataUrls, dehydrate, hasRefs, rehydrate } from "../assets";
import { migrateProject } from "../migrate";
import { validateSite } from "../schema";
import { checkContrast, contrast, onColor, resolveTheme, themeVars } from "../theme";
import { project } from "./fixtures";

describe("theme", () => {
  it("computes WCAG contrast", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
    expect(onColor("#84BF31".toLowerCase())).toBe("#141414");
    expect(onColor("#1F5C4A".toLowerCase())).toBe("#ffffff");
  });
  it("falls back to the template for everything not overridden", () => {
    const r = resolveTheme("atelier", "#8a5a2b", {});
    expect(r.colors.background).toBe("#f7f3ec");
    expect(r.fonts).toEqual({ heading: "fraunces", body: "dmsans" });
    const v = themeVars({}, r);
    expect(Object.keys(v.style)).toEqual(["--c-on-primary"]);
    expect(v.attrs).toEqual({});
  });
  it("writes only the overridden tokens", () => {
    const t = { colors: { background: "#101010", text: "#fafafa" }, radius: "large" as const };
    const r = resolveTheme("lumen", "#2f6f5e", t);
    const v = themeVars(t, r);
    expect(v.style["--s-bg"]).toBe("#101010");
    expect(v.style["--r-btn"]).toBe("999px");
    expect(v.attrs["data-radius"]).toBe("large");
    expect(checkContrast(r).map((i) => i.pair)).not.toContain("Text on background");
  });
  it("flags unreadable combinations", () => {
    const r = resolveTheme("kontrast", "#ffee00", { colors: { text: "#dddddd" } });
    expect(checkContrast(r).map((i) => i.pair)).toContain("Text on background");
  });
});

describe("migration", () => {
  it("moves the old font and text size into the theme, once", () => {
    const p = project({ draft: { ...project().draft, root: { props: { template: "atelier", fontFamily: "inter", textScale: "l" } as never } } });
    const m = migrateProject(p);
    expect(m.theme).toEqual({ fonts: { heading: "inter", body: "inter" }, typeScale: "l" });
    expect(m.kind).toBe("residential");
    expect(migrateProject(m)).toBe(m);
    expect(validateSite(m)).toEqual([]);
  });
  it("leaves an untouched site with an empty theme", () => {
    expect(migrateProject(project()).theme).toEqual({});
  });
});

describe("asset store", () => {
  const big = "data:image/png;base64," + "A".repeat(6000);
  it("stores each image once and puts it back", async () => {
    const value = { a: { image: big }, list: [{ src: big }, { src: "data:image/png;base64,small" }] };
    const { value: out, assets } = await dehydrate(value);
    expect(assets.size).toBe(1);
    expect(hasRefs(out)).toBe(true);
    expect(JSON.stringify(out).length).toBeLessThan(400);
    expect(out.list[1].src).toBe("data:image/png;base64,small");
    expect(rehydrate(out, (h) => assets.get(h))).toEqual(value);
    expect(collectDataUrls(value).size).toBe(1);
  });
});
