import { expect, test } from "bun:test";
import { root, portraits, decode, displayedRect, crop, components, suspectComponents } from "../scripts/codex-portrait-pixels";

// R: shipped codex pixels must not show detached crop debris or tiny floating blobs.
// Existing sprite tests check dimensions/palettes, not connected components.
for (const { id, art } of portraits) test(`codex portrait has no floating blobs: ${id}`, async () => {
  const image = await decode(`${root}/public/${art.src.replace("./", "")}`);
  const rect = displayedRect(art, image);
  expect(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= image.width
    && rect.y + rect.height <= image.height).toBe(true);
  const displayed = crop(image, rect);
  expect(components(displayed).length).toBeGreaterThan(0);
  const hits = suspectComponents(displayed).map(({ pixels, ...component }) => component);
  expect({ texture: art.src, rect, hits }).toEqual({ texture: art.src, rect, hits: [] });
});

// R: a card draws a window of the battle frame at one shared scale; no opaque pixel of the figure may fall outside it.
for (const { id, art } of portraits) if (art.kind === "sprite") test(`codex card shows the whole figure: ${id}`, async () => {
  const image = await decode(`${root}/public/${art.src.replace("./", "")}`), frame = crop(image, art.rect);
  const outside: number[][] = [];
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    const fx = art.rect.x + x, fy = art.rect.y + y;
    if (frame.data[(y * frame.width + x) * 4 + 3] >= 128 && (fx < art.view.x || fy < art.view.y
      || fx >= art.view.x + art.view.width || fy >= art.view.y + art.view.height)) outside.push([x, y]);
  }
  expect({ texture: art.src, view: art.view, outside }).toEqual({ texture: art.src, view: art.view, outside: [] });
});

test("portrait audit keeps diagonal strokes and flags tiny or edge-connected debris", () => {
  const data = new Uint8Array(40 * 40 * 4);
  const fill = (x: number, y: number, width: number, height: number, alpha = 255): void => {
    for (let yy = y; yy < y + height; yy++) for (let xx = x; xx < x + width; xx++)
      data.set([30, 40, 50, alpha], (yy * 40 + xx) * 4);
  };
  fill(10, 10, 10, 10); // Main body.
  fill(20, 20, 1, 1); // Diagonal stroke belongs to the main body.
  fill(2, 12, 3, 4, 128); // The reported twelve-pixel class of blob.
  fill(0, 30, 4, 4); // Larger debris still fails at an edge.
  fill(30, 5, 4, 4); // Larger detached art away from edges is allowed by this rule.
  fill(35, 35, 1, 1, 127); // Sub-threshold alpha does not form an opaque component.
  expect(suspectComponents({ width: 40, height: 40, data })
    .map(({ x, y, width, height, count }) => ({ x, y, width, height, count })))
    .toEqual([
      { x: 0, y: 30, width: 4, height: 4, count: 16 },
      { x: 2, y: 12, width: 3, height: 4, count: 12 },
    ]);
});
