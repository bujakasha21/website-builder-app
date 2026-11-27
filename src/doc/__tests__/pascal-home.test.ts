import { describe, expect, it, vi } from "vitest";
vi.mock("next/font/google", () => ({ Geist: () => ({ style: { fontFamily: "test" }, variable: "test", className: "test" }) }));
import { pascal } from "@/editor/pascal/local";

describe("Pascal on the dashboard", () => {
  it("starts a new website from a sentence that describes one", async () => {
    const pr = await pascal.respond("Website for 24 rental apartments in Zürich near the lake", {});
    expect(pr.go).toBe(`/new?about=${encodeURIComponent("Website for 24 rental apartments in Zürich near the lake")}`);
    expect(pr.confirmLabel).toBe("Build it");
  });
  it("still opens pages when asked to", async () => {
    expect((await pascal.respond("Open floor plans", {})).go).toBe("/studio");
    expect((await pascal.respond("Open my websites", {})).go).toBe("/websites");
    expect((await pascal.respond("new website", {})).go).toBe("/new");
  });
});
