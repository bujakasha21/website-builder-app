import { describe, expect, it } from "vitest";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AiCopySchema } from "@/lib/copy-schema";
import { fromAi } from "@/lib/copy";

describe("Claude copy contract", () => {
  it("turns into a strict JSON schema the API accepts (objects closed, every field required)", () => {
    const f = betaZodOutputFormat(AiCopySchema) as unknown as { type: string; schema: Record<string, unknown> };
    expect(f.type).toBe("json_schema");
    const walk = (s: Record<string, unknown>) => {
      if (s.type === "object") {
        expect(s.additionalProperties).toBe(false);
        expect((s.required as string[]).sort()).toEqual(Object.keys(s.properties as object).sort());
        Object.values(s.properties as Record<string, Record<string, unknown>>).forEach(walk);
      }
      if (s.type === "array") walk(s.items as Record<string, unknown>);
    };
    walk(f.schema);
  });
  it("maps an answer onto the page texts and enforces SEO lengths", () => {
    const c = fromAi({ heroText: "Hi", aboutTitle: "A", aboutText: "B", advantagesTitle: "C", advantages: [], contactText: "D", newsletterText: "E", posts: [], faq: [{ q: "Q", a: "A" }], seo: { title: "x".repeat(80), description: "y".repeat(200) } });
    expect(c.posts).toBeUndefined();
    expect(c.faq).toHaveLength(1);
    expect(c.seo.title.length).toBeLessThanOrEqual(60);
    expect(c.seo.description.length).toBeLessThanOrEqual(155);
  });
});
