// Draws the arrow projectile sheet: sixteen frames, one per sixteenth of a turn clockwise from east.
// Three frames are placed by hand (east, east-south-east, south-east); the other thirteen are exact mirrors and
// quarter turns of those, so no frame is ever resampled. The outline is every empty pixel beside a painted one.
// Usage: bun scripts/arrow-art.ts [preview.png]
import { deflateSync } from "node:zlib";
import { ARROW_ART, PALETTE } from "../src/presentation";

const size = ARROW_ART.size;
const INK: Record<string, number> = {
  n: PALETTE.leather, t: PALETTE.leatherLight, f: PALETTE.white, b: PALETTE.ally,
  m: PALETTE.steelLight, s: PALETTE.silver, h: PALETTE.silverLight,
};
/** Nock, shaft, two feathers bound in the ally colour, and a steel head with a bright tip. */
const EAST = [
  "..ffb......ss",
  "..nttttttttmmhh",
  "..ffb......ss",
];
const EAST_SOUTH_EAST = [
  ".ff",
  ".ntb",
  ".fftt",
  "...b.tt",
  ".......tt",
  ".........tt.s",
  "...........mm",
  "...........s.hh",
];
const SOUTH_EAST = [
  "...nf",
  "...ftf",
  "....ftb",
  ".....bt",
  ".......t",
  "........t",
  ".........t",
  "..........t.s",
  "...........mm",
  "..........smh",
  ".............h",
];
type Frame = readonly number[];
type Picture = { readonly width: number; readonly height: number; readonly rgba: Uint8Array };

function drawn(top: number, rows: readonly string[]): Frame {
  const paint = new Array<number>(size * size).fill(0);
  rows.forEach((row, line) => [...row].forEach((mark, x) => {
    if (mark === ".") return;
    if (!(mark in INK) || x >= size) throw new Error(`Bad arrow pixel ${mark} at ${x},${top + line}`);
    paint[(top + line) * size + x] = INK[mark];
  }));
  return paint.map((ink, at) => {
    if (ink) return ink;
    const x = at % size, y = Math.floor(at / size);
    return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
      .some(([nx, ny]) => nx >= 0 && ny >= 0 && nx < size && ny < size && paint[ny * size + nx] > 0) ? PALETTE.outline : 0;
  });
}
const mirrored = (frame: Frame): Frame => frame.map((_, at) => frame[at % size * size + Math.floor(at / size)]);
const quarterTurn = (frame: Frame): Frame => frame.map((_, at) => frame[(size - 1 - at % size) * size + Math.floor(at / size)]);
function arrowFrames(): readonly Frame[] {
  const frames = [drawn(7, EAST), drawn(4, EAST_SOUTH_EAST), drawn(3, SOUTH_EAST)];
  frames.push(mirrored(frames[1]));
  while (frames.length < ARROW_ART.directions) frames.push(quarterTurn(frames[frames.length - 4]));
  return frames;
}
function picture(frames: readonly Frame[], columns: number, scale: number, grounds: readonly [number, number]): Picture {
  const width = columns * size * scale, height = Math.ceil(frames.length / columns) * size * scale;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const column = Math.floor(x / scale / size), line = Math.floor(y / scale / size);
    const ink = frames[line * columns + column]?.[Math.floor(y / scale) % size * size + Math.floor(x / scale) % size] || grounds[(column + line) % 2];
    if (ink) rgba.set([ink >> 16, ink >> 8 & 255, ink & 255, 255], (y * width + x) * 4);
  }
  return { width, height, rgba };
}
function png({ width, height, rgba }: Picture): Uint8Array {
  const stride = 1 + width * 4, rows = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) rows.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * stride + 1);
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length), view = new DataView(out.buffer);
    view.setUint32(0, data.length); out.set(new TextEncoder().encode(type), 4); out.set(data, 8);
    view.setUint32(8 + data.length, Bun.hash.crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, width); view.setUint32(4, height); header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", new Uint8Array())]);
}
if (import.meta.main) {
  const frames = arrowFrames(), [preview] = Bun.argv.slice(2);
  await Bun.write(`${import.meta.dir}/../public/art/${ARROW_ART.file}.png`, png(picture(frames, frames.length, 1, [0, 0])));
  if (preview) await Bun.write(preview, png(picture(frames, 4, 8, [PALETTE.moss, PALETTE.sand])));
}
