import { describe, expect, it } from "vitest";
import { gridOf, morph, type Analysis } from "../studio";

describe("Studio floor plan reading", () => {
  it("closes the gap between the two contour lines of a wall", () => {
    const W = 20, H = 9, a = new Uint8Array(W * H);
    for (let x = 2; x < 18; x++) { a[3 * W + x] = 1; a[5 * W + x] = 1; } // two parallel lines, 1 px apart
    const closed = morph(morph(a, W, H, 1, false), W, H, 1, true);
    expect(closed[4 * W + 10]).toBe(1); // now one solid wall
    expect(closed[1 * W + 10]).toBe(0);
  });
  it("turns a walled square into merged wall rectangles and one floor rectangle", () => {
    const W = 60, H = 60, wall = new Uint8Array(W * H), inside = new Uint8Array(W * H);
    for (let y = 10; y < 50; y++) for (let x = 10; x < 50; x++) {
      const edge = x < 14 || x >= 46 || y < 14 || y >= 46;
      (edge ? wall : inside)[y * W + x] = 1;
    }
    const an: Analysis = { W, H, wall, inside, bbox: [10, 10, 49, 49], r: 2 };
    const g = gridOf(an);
    expect(g.walls.length).toBeGreaterThan(0);
    expect(g.walls.length).toBeLessThanOrEqual(4); // a ring merges into few rectangles
    expect(g.floors).toHaveLength(1);
  });
});
