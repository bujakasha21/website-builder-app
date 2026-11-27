import { z } from "zod";

/**
 * What Claude reads from a floor plan picture. Coordinates are fractions of the picture (0–1, x to the right,
 * y downwards), the same frame the wall detector uses, so both can be merged without conversion.
 */
const P = z.object({ x: z.number(), y: z.number() });

export const READ_KINDS = ["living", "kitchen", "bedroom", "bath", "wc", "hall", "office", "balcony", "storage", "other"] as const;
export const FIXTURE_TYPES = ["shower", "tub", "toilet", "basin", "washer", "counter", "fridge", "wardrobe"] as const;

export const PlanReadSchema = z.object({
  rooms: z.array(z.object({
    name: z.string().describe("room name exactly as printed on the plan, e.g. 'Wohnen/Essen/Kochen'; a short German name if none is printed"),
    areaM2: z.number().nullable().describe("area printed on the plan in m², null if none is printed"),
    kind: z.enum(READ_KINDS),
    polygon: z.array(P).describe("outline along the inner face of the walls, corners in order, right angles where the plan has them"),
  })),
  doors: z.array(z.object({
    hinge: P.describe("the jamb the leaf turns on (where the door arc starts)"),
    tip: P.describe("the opposite jamb, where the closed leaf ends"),
    into: P.describe("a point about 0.5 m inside the room the leaf swings into"),
    glass: z.boolean().describe("true for glazed doors to a balcony or terrace"),
  })),
  fixtures: z.array(z.object({
    type: z.enum(FIXTURE_TYPES),
    box: z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() }),
    against: z.enum(["top", "right", "bottom", "left"]).describe("the wall the fixture's back stands against, as seen on the picture"),
  })),
});
export type PlanRead = z.infer<typeof PlanReadSchema>;
