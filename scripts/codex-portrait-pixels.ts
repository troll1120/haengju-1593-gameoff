import { inflateSync, deflateSync, crc32 } from "node:zlib";
import { BPH_CODEX_CLASSES, bphClassArt, bphSlotArt, bphGeneralArt } from "../src/bph-codex-page";
import type { BphCodexPicture } from "../src/bph-codex-page";
import { BPH_CODEX_SLOTS } from "../src/bph-codex-data";
import { BPH_CODEX_GROUPS } from "../src/bph-codex-groups";
import { BPH_GENERALS } from "../src/bph-commanders";

export const root = `${import.meta.dir}/..`;
export type Picture = { readonly width: number; readonly height: number; readonly data: Uint8Array };
export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
export type Component = Rect & { readonly count: number; readonly pixels: readonly number[]; readonly edge: boolean };
export const portraits = [
  ...BPH_CODEX_CLASSES.map(id => ({ id: `class:${id}`, art: bphClassArt(id) })),
  ...BPH_CODEX_SLOTS.map(slot => ({ id: `slot:${slot.id}`, art: bphSlotArt(slot) })),
  ...BPH_CODEX_GROUPS.map(group => ({ id: `group:${group.slot.id}`, art: bphSlotArt(group.slot) })),
  ...BPH_GENERALS.map(id => ({ id: `general:${id}`, art: bphGeneralArt(id) })),
];

/** Same five PNG row filters as general-art.test.ts. Native Bun conversion handles WebP. */
export async function decode(file: string): Promise<Picture> {
  const bytes = file.endsWith(".png") ? await Bun.file(file).bytes()
    : await Bun.file(file).image().png().bytes();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (bytes[24] !== 8 || bytes[25] !== 6) throw new Error(`Expected 8-bit RGBA: ${file}`);
  const chunks: Uint8Array[] = [];
  for (let at = 8; at < bytes.length;) {
    const size = view.getUint32(at);
    if (String.fromCharCode(...bytes.subarray(at + 4, at + 8)) === "IDAT")
      chunks.push(bytes.subarray(at + 8, at + 8 + size));
    at += size + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4;
  const data = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < stride; x++) {
    const filter = raw[y * (stride + 1)], at = y * stride + x;
    if (filter > 4) throw new Error(`Invalid PNG filter: ${filter}`);
    const a = x >= 4 ? data[at - 4] : 0, b = y ? data[at - stride] : 0;
    const c = x >= 4 && y ? data[at - stride - 4] : 0;
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b
      : filter === 3 ? Math.floor((a + b) / 2) : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    data[at] = raw[y * (stride + 1) + x + 1] + predictor;
  }
  return { width, height, data };
}

/** The codex draws a sprite's own battle frame rect, or a whole icon image. */
export function displayedRect(art: BphCodexPicture, image: Picture): Rect {
  return art.kind === "image" ? { x: 0, y: 0, width: image.width, height: image.height } : art.rect;
}
export function crop(image: Picture, rect: Rect, scale = 1): Picture {
  const width = rect.width * scale, height = rect.height * scale, data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const source = ((rect.y + Math.floor(y / scale)) * image.width + rect.x + Math.floor(x / scale)) * 4;
    data.set(image.data.subarray(source, source + 4), (y * width + x) * 4);
  }
  return { width, height, data };
}
/** Alpha >= 128 is opaque; eight-neighbour connectivity keeps diagonal pixel strokes intact. */
export function components(image: Picture): Component[] {
  const visited = new Uint8Array(image.width * image.height), found: Component[] = [];
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || image.data[start * 4 + 3] < 128) continue;
    const pixels = [start]; visited[start] = 1;
    let minX = image.width, minY = image.height, maxX = 0, maxY = 0;
    for (let cursor = 0; cursor < pixels.length; cursor++) {
      const at = pixels[cursor], x = at % image.width, y = Math.floor(at / image.width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, next = ny * image.width + nx;
        if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height || visited[next]
          || image.data[next * 4 + 3] < 128) continue;
        visited[next] = 1; pixels.push(next);
      }
    }
    found.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1,
      count: pixels.length, pixels, edge: minX === 0 || minY === 0 || maxX === image.width - 1 || maxY === image.height - 1 });
  }
  return found.sort((a, b) => b.count - a.count);
}
export function suspectComponents(image: Picture): Component[] {
  return components(image).slice(1).filter(component => component.edge || component.count <= 12);
}
export function encode(image: Picture): Uint8Array {
  const chunk = (name: string, data: Uint8Array): Buffer => {
    const body = Buffer.concat([Buffer.from(name), data]), out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length); body.copy(out, 4); out.writeUInt32BE(crc32(body), body.length + 4); return out;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(image.width); header.writeUInt32BE(image.height, 4);
  header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc((image.width * 4 + 1) * image.height);
  for (let y = 0; y < image.height; y++)
    rows.set(image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4), y * (image.width * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)), chunk("IEND", new Uint8Array())]);
}
