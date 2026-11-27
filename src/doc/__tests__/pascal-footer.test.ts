import { describe, expect, it, vi } from "vitest";
// the rules import the section components, which load fonts through Next.js; not needed here
vi.mock("next/font/google", () => ({ Geist: () => ({ style: { fontFamily: "test" }, variable: "test", className: "test" }) }));
import { pascal } from "@/editor/pascal/local";
import { project } from "./fixtures";
import type { Data } from "@puckeditor/core";

const page = (footer: Record<string, unknown>) => ({ root: { props: {} }, zones: {}, content: [{ type: "Hero", props: { id: "hero", title: "X" } }, { type: "Footer", props: { id: "f", company: "Lukavica", layout: "split", showLogo: "yes", logoSize: "m", copyright: "© {year} {company}", imprintLabel: "Imprint", privacyLabel: "Privacy", ...footer } }] }) as unknown as Data;

describe("Pascal rules: footer requests", () => {
  it("does Davor's sentence: bigger logo, copyright in the middle, Impressum/Datenschutz on the right", async () => {
    const d = page({});
    const pr = await pascal.respond("in footer where the logo is, make it bigger and on center type copyright message, all rights reserved and on the right, impressum and datenschutz links", { project: project({ logo: "data:image/png;base64,x" }), data: d });
    expect(pr.apply).toBeTypeOf("function");
    const after = pr.apply!(d);
    const f = (after.content as { type: string; props: Record<string, unknown> }[]).find((c) => c.type === "Footer")!.props;
    expect(f).toMatchObject({ logoSize: "l", layout: "three", copyright: "© {year} {company}. All rights reserved.", imprintLabel: "Impressum", privacyLabel: "Datenschutz" });
    expect(pr.changes?.length).toBeGreaterThanOrEqual(4);
  });
  it("says so when nothing would change", async () => {
    const d = page({ logoSize: "xl", layout: "three", copyright: "© {year} {company}. All rights reserved.", imprintLabel: "Impressum", privacyLabel: "Datenschutz" });
    const pr = await pascal.respond("footer: copyright in the middle, impressum and datenschutz on the right", { project: project(), data: d });
    expect(pr.apply).toBeUndefined();
    expect(pr.reply).toMatch(/nothing to change/);
  });
});

describe("Pascal rules: footer layout words", () => {
  it("two parts with English link names", async () => {
    const d = page({ layout: "three", imprintLabel: "Impressum", privacyLabel: "Datenschutz" });
    const pr = await pascal.respond("footer in two parts with imprint and privacy links", { project: project(), data: d });
    const f = (pr.apply!(d).content as { type: string; props: Record<string, unknown> }[]).find((c) => c.type === "Footer")!.props;
    expect(f).toMatchObject({ layout: "split", imprintLabel: "Imprint", privacyLabel: "Privacy" });
  });
});
