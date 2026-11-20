import { PALETTE } from "./presentation";

/** Only a real foil wears the prism; promotion and visual upgrades do not grant foil status. */
export const BPH_FOIL_PRISM = .75;
export const bphPrism = (_profileId: string, foil: boolean): number => foil ? BPH_FOIL_PRISM : 0;

/** A prism sheet stacks the source sheet PRISM_ROWS times: one copy per sweep phase, then a still rainbow edge for reduced motion. */
export const PRISM_PHASES = 8;
export const PRISM_STILL_ROW = PRISM_PHASES;
export const PRISM_ROWS = PRISM_PHASES + 1;
export const PRISM_STEP_MS = 140;

const OUTLINES: ReadonlySet<number> = new Set([PALETTE.outline, PALETTE.dark]);
const BAND_CORE = 200, BAND_EDGE = 130, STILL_EDGE = 150;

function rainbow(turn: number): readonly [number, number, number] {
  const h = (turn % 1 + 1) % 1 * 6, x = 1 - Math.abs(h % 2 - 1);
  const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
  const lift = (channel: number) => Math.round(255 * (.4 + .6 * channel));
  return [lift(r), lift(g), lift(b)];
}

/** Only the moving diagonal band has alpha. Outside it the original sprite is entirely unchanged. */
export function prismSheet(pixels: Uint8ClampedArray, width: number, height: number,
  frame: { readonly width: number; readonly height: number }): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(width * height * PRISM_ROWS * 4);
  const span = frame.width + frame.height, band = Math.max(3, Math.round(span / 16));
  const painted = (x: number, y: number): boolean => {
    const at = (y * width + x) * 4;
    return pixels[at + 3] > 0 && !OUTLINES.has(pixels[at] << 16 | pixels[at + 1] << 8 | pixels[at + 2]);
  };
  const put = (x: number, y: number, row: number, [r, g, b]: readonly [number, number, number], alpha: number) => {
    const at = ((row * height + y) * width + x) * 4;
    out[at] = r; out[at + 1] = g; out[at + 2] = b;
    out[at + 3] = Math.round(alpha * pixels[(y * width + x) * 4 + 3] / 255);
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!painted(x, y)) continue;
    const fx = x % frame.width, fy = y % frame.height, diagonal = fx + fy;
    for (let phase = 0; phase < PRISM_PHASES; phase++) {
      const centre = phase / PRISM_PHASES * (span + 2 * band) - band, distance = Math.abs(diagonal - centre);
      if (distance <= band) put(x, y, phase, rainbow(diagonal / span + phase / PRISM_PHASES),
        distance <= band / 2 ? BAND_CORE : BAND_EDGE);
    }
    const inside = (dx: number, dy: number) => fx + dx >= 0 && fx + dx < frame.width && fy + dy >= 0 && fy + dy < frame.height
      && painted(x + dx, y + dy);
    if (!(inside(1, 0) && inside(-1, 0) && inside(0, 1) && inside(0, -1))) put(x, y, PRISM_STILL_ROW, rainbow(diagonal / span), STILL_EDGE);
  }
  return out;
}
