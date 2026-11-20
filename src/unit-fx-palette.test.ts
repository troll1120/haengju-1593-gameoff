import { expect, test } from "bun:test";
import { recolorAlliedEffectPixels } from "./unit-fx-palette";

test("allied effects replace red with gold while preserving alpha and other colors", () => {
  const pixels = new Uint8ClampedArray([232, 69, 55, 200, 120, 18, 9, 64,
    255, 255, 255, 255, 12, 18, 25, 255, 20, 190, 170, 100, 255, 0, 0, 0]);
  recolorAlliedEffectPixels(pixels);
  for (const at of [0, 4]) {
    expect(pixels[at + 1]).toBeGreaterThan(pixels[at] * .7);
    expect(pixels[at + 1]).toBeGreaterThan(pixels[at + 2]);
  }
  expect([pixels[3], pixels[7]]).toEqual([200, 64]);
  expect([...pixels.slice(8)]).toEqual([255, 255, 255, 255, 12, 18, 25, 255, 20, 190, 170, 100, 255, 0, 0, 0]);
});
