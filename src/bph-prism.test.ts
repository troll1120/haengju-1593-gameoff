import { expect, test } from "bun:test";
import { bphPrism, BPH_FOIL_PRISM, prismSheet, PRISM_PHASES, PRISM_ROWS, PRISM_STILL_ROW } from "./bph-prism";
import { PALETTE } from "./presentation";

const rgb = (paint: number) => [paint >> 16 & 255, paint >> 8 & 255, paint & 255];
/** Two 4x4 frames: an outline ring around a 2x2 painted core, the second frame one pixel lower. */
function sheet(): Uint8ClampedArray {
  const width = 8, height = 5, pixels = new Uint8ClampedArray(width * height * 4);
  const put = (x: number, y: number, paint: number) => pixels.set([...rgb(paint), 255], (y * width + x) * 4);
  for (const [dx, dy] of [[0, 0], [4, 1]]) for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++)
    put(dx + x, dy + y, x === 0 || y === 0 || x === 3 || y === 3 ? PALETTE.outline : 0x6e9aa0);
  return pixels;
}

test.each(["Hero1_Squire", "Hero1_Squire2", "Hero1_Squire3", "Hero4_Bannerman", "Hero_SkeletonUpgraded", "Hero7_Warlord_Spiked"])(
  "%s wears a prism only when the battle unit is foil", profileId => {
  expect(bphPrism(profileId, false)).toBe(0);
  expect(bphPrism(profileId, true)).toBe(BPH_FOIL_PRISM);
});

test("the prism sheet only covers painted body pixels, never the outline or empty space", () => {
  const width = 8, height = 5, source = sheet(), out = prismSheet(source, width, height, { width: 4, height: 5 });
  expect(out.length).toBe(width * height * PRISM_ROWS * 4);
  for (let row = 0; row < PRISM_ROWS; row++) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = (y * width + x) * 4, shown = out[((row * height + y) * width + x) * 4 + 3] > 0;
    const body = source[at + 3] > 0 && (source[at] << 16 | source[at + 1] << 8 | source[at + 2]) !== PALETTE.outline;
    if (!body) expect(shown).toBe(false);
  }
});

test("a moving band leaves most body pixels untouched and respects partial source alpha", () => {
  const width = 24, height = 24, source = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) source.set([110, 154, 160, i % 2 ? 64 : 255], i * 4);
  const out = prismSheet(source, width, height, { width, height });
  for (let row = 0; row < PRISM_PHASES; row++) {
    let shown = 0;
    for (let i = 0; i < width * height; i++) {
      const alpha = out[(row * width * height + i) * 4 + 3];
      expect(alpha).toBeLessThanOrEqual(source[i * 4 + 3]);
      if (alpha) shown++;
    }
    expect(shown).toBeLessThan(width * height / 3);
  }
  expect(out.slice(0, width * height * 4)).not.toEqual(out.slice(width * height * 4 * 4, width * height * 4 * 5));
});

test("a sweep phase moves the band, and both frames shimmer the same way at their own pixels", () => {
  const width = 8, height = 5, out = prismSheet(sheet(), width, height, { width: 4, height: 5 });
  const alpha = (row: number, x: number, y: number) => out[((row * height + y) * width + x) * 4 + 3];
  expect([0, 1, 2, 3].map(row => alpha(row, 1, 1))).not.toEqual([0, 1, 2, 3].map(() => alpha(0, 1, 1)));
  for (let row = 0; row < PRISM_STILL_ROW; row++) expect(alpha(row, 5, 2)).toBe(alpha(row, 1, 2));
});
