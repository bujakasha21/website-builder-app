import { describe, expect, it } from "vitest";
import { buildPage } from "@/lib/templates";
import { FEATURES, KIND_FEATURES, needsUnits, type Brief } from "@/lib/profile";

const base = { name: "Test", address: "", zip: "", city: "Zürich", type: "rent" as const, units: [], floorPlans: [] };
const types = (b: Brief) => buildPage(base, "atelier", b).content.map((c) => c.type);
const KNOWN = new Set(["Header", "Hero", "Advantages", "TextImage", "Text", "Facts", "Gallery", "Embed", "Blog", "Testimonials", "Faq", "Downloads", "UnitFinder", "UnitList", "FloorPlanBlock", "Location", "Booking", "Shops", "Hours", "Newsletter", "ContactForm", "Waitlist", "Viewing", "Contacts", "Footer"]);

describe("page from the interview", () => {
  it("residential: apartment table with building view, no shop sections", () => {
    const b: Brief = { kind: "residential", name: "Parkhof", description: "48 flats by the lake.", features: KIND_FEATURES.residential, languages: ["de-CH"] };
    const page = buildPage(base, "atelier", b);
    const t = page.content.map((c) => c.type);
    expect(t).toContain("UnitFinder");
    expect(page.content.find((c) => c.type === "UnitFinder")!.props.variant).toBe("split");
    expect(t).not.toContain("Shops");
    expect((page.root.props as Record<string, unknown>).unitDetail).toBe("page");
  });

  it("shopping centre: shops, hours, news, newsletter; no apartments; menu points at them", () => {
    const b: Brief = { kind: "shopping-centre", name: "Arena", description: "60 shops.", features: KIND_FEATURES["shopping-centre"], languages: ["de-CH"] };
    const page = buildPage(base, "kontrast", b);
    const t = page.content.map((c) => c.type);
    expect(t).toEqual(expect.arrayContaining(["Shops", "Hours", "Blog", "Newsletter", "ContactForm"]));
    expect(t).not.toContain("UnitFinder");
    expect(t).not.toContain("Advantages");
    const links = (page.content[0].props as { links: { href: string }[] }).links.map((l) => l.href);
    expect(links).toEqual(expect.arrayContaining(["#shops", "#hours", "#news"]));
    expect(page.content.find((c) => c.type === "Hero")!.props.text).toBe("60 shops.");
    expect(page.content.find((c) => c.type === "Hero")!.props).toMatchObject({ cta: "See the shops", ctaHref: "#shops" });
  });

  it("only picked features appear, and every section type exists", () => {
    for (const f of FEATURES) {
      const b: Brief = { kind: "other", name: "X", description: "", features: [f.id], languages: ["en"] };
      const t = types(b);
      t.forEach((x) => expect(KNOWN.has(x), `${f.id} → ${x}`).toBe(true));
      f.blocks.filter((x) => x !== "FloorPlanBlock" && x !== "Facts") // both need real apartments or plans.forEach((x) => expect(t, f.id).toContain(x));
    }
    expect(types({ kind: "booking", name: "X", description: "", features: ["booking"], languages: ["en"] })).toEqual(["Header", "Hero", "TextImage", "Booking", "Footer"]);
  });

  it("knows when the apartment steps are needed", () => {
    expect(needsUnits({ features: ["blog", "contact"] })).toBe(false);
    expect(needsUnits({ features: ["isometry"] })).toBe(true);
  });
});
