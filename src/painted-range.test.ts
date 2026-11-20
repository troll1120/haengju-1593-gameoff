import { expect, test } from "bun:test";
import type Phaser from "phaser";
import type { PaintedArt } from "./painted-art";
import { PAINTED_BOUNDS } from "./painted-files";
import { paintedRange } from "./presentation";

function fixture() {
  const calls: { slug: string; x: number; y: number; options: Parameters<PaintedArt["draw"]>[4] }[] = [];
  const transforms: (string | number)[][] = [];
  const graphics = {
    save() { transforms.push(["save"]); return this; },
    translateCanvas(x: number, y: number) { transforms.push(["translate", x, y]); return this; },
    rotateCanvas(angle: number) { transforms.push(["rotate", angle]); return this; },
    restore() { transforms.push(["restore"]); return this; },
  } as unknown as Phaser.GameObjects.Graphics;
  const art = {
    draw(g: Phaser.GameObjects.Graphics, slug: string, x: number, y: number,
      options: Parameters<PaintedArt["draw"]>[4]) {
      calls.push({ slug, x, y, options }); return g;
    },
  } as unknown as PaintedArt;
  return { calls, transforms, graphics, art };
}

test("painted radius maps the opaque rim to the gameplay diameter", () => {
  const f = fixture();
  paintedRange(f.graphics, f.art, "range-danger", 200, 200, 62, .5);
  expect(f.calls).toEqual([{
    slug: "range-danger", x: 138, y: 138,
    options: { source: PAINTED_BOUNDS["range-danger"], width: 124, height: 124, alpha: .5 },
  }]);
});

test("lane caps and middle preserve the same visible radius and endpoints", () => {
  const f = fixture();
  paintedRange(f.graphics, f.art, "range-danger", 200, 100, 22, .5, { x: 0, y: 100 });
  expect(f.calls.map(call => call.slug)).toEqual(["range-danger", "range-danger-lane", "range-danger"]);
  expect(f.calls[0].options?.source).toEqual(PAINTED_BOUNDS["range-danger"]);
  expect(f.calls[1]).toEqual({
    slug: "range-danger-lane", x: 0, y: -22,
    options: { source: { x: 16, y: 2, width: 32, height: 28 }, width: 200, height: 44, alpha: .5 },
  });
  expect(f.calls[2].x).toBe(178);
  expect(f.calls[2].options?.source).toEqual(PAINTED_BOUNDS["range-danger"]);
  expect(f.transforms).toEqual([["save"], ["translate", 0, 100], ["rotate", 0], ["restore"]]);
});
