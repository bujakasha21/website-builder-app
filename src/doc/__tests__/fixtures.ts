import type { Project } from "@/lib/types";
import type { BlockRegistry } from "../ops";

export const registry: BlockRegistry = {
  Header: { label: "Menu bar", fields: ["links", "cta"] },
  Hero: { label: "Hero", fields: ["title", "text", "image", "variant"] },
  Gallery: { fields: ["images", "variant"] },
  Text: { fields: ["title", "body"] },
};
export const defaults = (type: string) => (type === "Hero" ? { title: "Welcome", text: "", variant: "background" } : {});

export function project(over: Partial<Project> = {}): Project {
  return {
    id: "p1", name: "Parkhof", slug: "parkhof", address: "", zip: "", city: "Bern", lat: 0, lng: 0, type: "rent",
    locale: "de-CH", accent: "#1F5C4A", template: "atelier",
    draft: {
      root: { props: { template: "atelier" } },
      content: [
        { type: "Header", props: { id: "h", links: [{ label: "Home", href: "#" }] } },
        { type: "Hero", props: { id: "hero", title: "Parkhof", text: "Living in Bern" } },
        { type: "Text", props: { id: "t1", title: "About", body: "Lorem" } },
      ],
      zones: {},
    },
    published: null, units: [], floorPlans: [], leads: [], slots: [], bookings: [], views: 0, createdAt: 1,
    ...over,
  } as Project;
}
