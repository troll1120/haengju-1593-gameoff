import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import type { Plugin, ViteDevServer } from "vite";

/**
 * Owner DM 1794932697 follow-up: the title screen fetched ~3,150 single files and on a slow phone the per-request latency,
 * not the bytes, made the full preload take minutes. The art stays as single files in public/art (the source of truth);
 * this packs them into a few sheets per folder at build/dev-server start, cached by content hash.
 */
export type AtlasFrame = readonly [page: number, x: number, y: number, width: number, height: number];
export type AtlasIndex = {
  readonly pages: readonly { readonly file: string; readonly group: string; readonly width: number; readonly height: number }[];
  readonly frames: Readonly<Record<string, AtlasFrame>>;
  readonly loose: readonly string[];
};
type Rgba = { width: number; height: number; data: Uint8Array };

const VERSION = "atlas-1";
const PAGE_MAX = 2048;
const IMAGE = /\.(?:png|webp|jpe?g|gif)$/i;

/** Why a file is not packed: the title scenes are first paint (index.html preloads camp.png); the per-actor animation
 *  sheets are already one file per actor; lossy WebP would decode differently at build time than in the browser. */
export function looseReason(file: string, bytes: Uint8Array): string | undefined {
  const parts = file.split("/");
  if (parts[0] === "scenes") return "title scene";
  if (parts.length === 2 && (parts[0] === "generals" || parts[0] === "soldiers") && file.endsWith(".webp")) return "animation sheet";
  if (file.endsWith(".webp")) {
    const text = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
    if (text.includes("ANIM")) return "animated webp";
    if (!text.includes("VP8L") || text.includes("VP8 ")) return "lossy webp";
  } else if (!file.endsWith(".png")) return "not png/webp";
  return undefined;
}

const groupOf = (file: string) => file.split("/")[0];

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (bytes: Uint8Array) => { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function decodePng(bytes: Uint8Array): Rgba {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0, depth = 0, color = 0, palette: Uint8Array | undefined, trns: Uint8Array | undefined;
  const idat: Uint8Array[] = [];
  for (let at = 8; at < bytes.length;) {
    const length = view.getUint32(at), type = String.fromCharCode(...bytes.subarray(at + 4, at + 8)), body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8); height = view.getUint32(at + 12); depth = body[8]; color = body[9];
      if (body[12] !== 0) throw new Error("interlaced png");
    } else if (type === "PLTE") palette = body; else if (type === "tRNS") trns = body; else if (type === "IDAT") idat.push(body);
    at += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (!channels || (depth !== 8 && !(color === 3 && depth < 8))) throw new Error(`png type ${color}/${depth}`);
  const raw = inflateSync(Buffer.concat(idat)), bpp = Math.max(1, channels * depth / 8), stride = Math.ceil(width * channels * depth / 8);
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = rows.subarray(y * stride, (y + 1) * stride), up = y ? rows.subarray((y - 1) * stride, y * stride) : undefined;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0, b = up ? up[x] : 0, c = up && x >= bpp ? up[x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      if (predictor === undefined) throw new Error(`png filter ${filter}`);
      out[x] = (line[x] + predictor) & 0xff;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const o = (y * width + x) * 4, row = y * stride;
    if (color === 6) data.set(rows.subarray(row + x * 4, row + x * 4 + 4), o);
    else if (color === 2) { data.set(rows.subarray(row + x * 3, row + x * 3 + 3), o); data[o + 3] = 255; }
    else if (color === 0) { data.fill(rows[row + x], o, o + 3); data[o + 3] = 255; }
    else if (color === 4) { data.fill(rows[row + x * 2], o, o + 3); data[o + 3] = rows[row + x * 2 + 1]; }
    else {
      const bit = x * depth, index = (rows[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
      data.set(palette!.subarray(index * 3, index * 3 + 3), o); data[o + 3] = trns && index < trns.length ? trns[index] : 255;
    }
  }
  return { width, height, data };
}

export function encodePng({ width, height, data }: Rgba): Uint8Array {
  const stride = width * 4, raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const line = data.subarray(y * stride, (y + 1) * stride), up = y ? data.subarray((y - 1) * stride, y * stride) : undefined;
    let best = 0, bestCost = Infinity, bestRow = line;
    for (let filter = 0; filter < 5; filter++) {
      const row = new Uint8Array(stride);
      let cost = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? line[x - 4] : 0, b = up ? up[x] : 0, c = up && x >= 4 ? up[x - 4] : 0;
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const value = (line[x] - [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]) & 0xff;
        row[x] = value; cost += value < 128 ? value : 256 - value;
      }
      if (cost < bestCost) { best = filter; bestCost = cost; bestRow = row; }
    }
    raw[y * (stride + 1)] = best; raw.set(bestRow, y * (stride + 1) + 1);
  }
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length), view = new DataView(out.buffer);
    view.setUint32(0, body.length); out.set(new TextEncoder().encode(type), 4); out.set(body, 8);
    view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
    return out;
  };
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, width); view.setUint32(4, height); header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", new Uint8Array())]);
}

export async function decodeArt(file: string, bytes: Uint8Array): Promise<Rgba> {
  return decodePng(file.endsWith(".png") ? bytes : await new Bun.Image(bytes).png().bytes());
}

/** Fully transparent pixels carry no colour on screen (the browser stores premultiplied pixels), so they compare as 0. */
export function samePixels(a: Rgba, b: Rgba): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let at = 0; at < a.data.length; at += 4) {
    if (a.data[at + 3] !== b.data[at + 3]) return false;
    if (a.data[at + 3] && (a.data[at] !== b.data[at] || a.data[at + 1] !== b.data[at + 1] || a.data[at + 2] !== b.data[at + 2])) return false;
  }
  return true;
}

function shelve(items: { file: string; width: number; height: number }[]) {
  const sorted = [...items].sort((a, b) => b.height - a.height || b.width - a.width || (a.file < b.file ? -1 : 1));
  const area = sorted.reduce((sum, item) => sum + item.width * item.height, 0);
  const width = Math.min(PAGE_MAX, Math.max(...sorted.map(item => item.width), Math.ceil(Math.sqrt(area * 1.2))));
  const pages: { width: number; height: number; placed: { file: string; x: number; y: number; width: number; height: number }[] }[] = [];
  let page = { width, height: 0, placed: [] as { file: string; x: number; y: number; width: number; height: number }[] }, x = 0, y = 0, shelf = 0;
  for (const item of sorted) {
    if (x + item.width > width) { x = 0; y += shelf; shelf = 0; }
    if (y + item.height > PAGE_MAX) { pages.push(page); page = { width, height: 0, placed: [] }; x = 0; y = 0; shelf = 0; }
    page.placed.push({ file: item.file, x, y, width: item.width, height: item.height });
    x += item.width; shelf = Math.max(shelf, item.height); page.height = Math.max(page.height, y + item.height);
  }
  if (page.placed.length) pages.push(page);
  return pages;
}

export type BuiltAtlas = { index: AtlasIndex; sheets: Map<string, Uint8Array>; hash: string };

export function listArt(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && IMAGE.test(entry.name))
    .map(entry => relative(root, resolve(entry.parentPath, entry.name)).split("\\").join("/"))
    .sort();
}

export async function buildAtlas(root: string, cacheDir?: string): Promise<BuiltAtlas> {
  const files = listArt(root), sources = new Map(files.map(file => [file, new Uint8Array(readFileSync(resolve(root, file)))]));
  const digest = createHash("sha256").update(VERSION);
  for (const [file, bytes] of sources) digest.update(file).update("\0").update(bytes);
  const hash = digest.digest("hex").slice(0, 12), cached = cacheDir && resolve(cacheDir, hash);
  if (cached && existsSync(resolve(cached, "index.json"))) {
    const index: AtlasIndex = JSON.parse(readFileSync(resolve(cached, "index.json"), "utf8"));
    return { index, hash, sheets: new Map(index.pages.map(page => [page.file, new Uint8Array(readFileSync(resolve(cached, page.file.split("/").pop()!)))])) };
  }
  const loose: string[] = [], decoded = new Map<string, Rgba>(), groups = new Map<string, { file: string; width: number; height: number }[]>();
  for (const [file, bytes] of sources) {
    const image = looseReason(file, bytes) ? undefined : await decodeArt(file, bytes);
    if (!image || image.width > PAGE_MAX || image.height > PAGE_MAX) { loose.push(file); continue; }
    decoded.set(file, image);
    const group = groupOf(file);
    groups.set(group, [...groups.get(group) ?? [], { file, width: image.width, height: image.height }]);
  }
  const pages: { file: string; group: string; width: number; height: number }[] = [], frames: Record<string, AtlasFrame> = {};
  const sheets = new Map<string, Uint8Array>();
  for (const [group, items] of [...groups].sort(([a], [b]) => (a < b ? -1 : 1))) {
    for (const [n, page] of shelve(items).entries()) {
      const sheet: Rgba = { width: page.width, height: page.height, data: new Uint8Array(page.width * page.height * 4) };
      for (const item of page.placed) {
        const source = decoded.get(item.file)!;
        for (let row = 0; row < item.height; row++)
          sheet.data.set(source.data.subarray(row * item.width * 4, (row + 1) * item.width * 4), ((item.y + row) * page.width + item.x) * 4);
        frames[item.file] = [pages.length, item.x, item.y, item.width, item.height];
      }
      const png = encodePng(sheet), webp = await new Bun.Image(png).webp({ lossless: true }).bytes();
      const smaller = webp.length < png.length && samePixels(decodePng(await new Bun.Image(webp).png().bytes()), sheet);
      const bytes = smaller ? webp : png, name = `${group}-${n}.${createHash("sha256").update(bytes).digest("hex").slice(0, 8)}.${smaller ? "webp" : "png"}`;
      if (!samePixels(await decodeArt(name, bytes), sheet)) throw new Error(`atlas sheet ${name} does not round-trip`);
      pages.push({ file: `art-sheets/${name}`, group, width: page.width, height: page.height });
      sheets.set(`art-sheets/${name}`, bytes);
    }
  }
  const index: AtlasIndex = { pages, frames, loose };
  if (cached) {
    mkdirSync(cached, { recursive: true });
    for (const [file, bytes] of sheets) writeFileSync(resolve(cached, file.split("/").pop()!), bytes);
    writeFileSync(resolve(cached, "index.json"), JSON.stringify(index));
  }
  return { index, sheets, hash };
}

const ID = "virtual:art-atlas";

export function artAtlas(): Plugin {
  const root = resolve(process.cwd(), "public/art"), cacheDir = resolve(process.cwd(), "node_modules/.cache/art-atlas");
  let atlas: Promise<BuiltAtlas> | undefined;
  const current = () => atlas ??= buildAtlas(root, cacheDir);
  return {
    name: "art-atlas",
    resolveId(id) {
      if (id === ID) return `\0${ID}`;
    },
    async load(id) {
      if (id !== `\0${ID}`) return;
      return `export default ${JSON.stringify((await current()).index)};`;
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (request, response, next) => {
        const path = decodeURIComponent((request.url ?? "").split("?")[0]).replace(/^\//, "");
        if (!path.startsWith("art-sheets/")) return next();
        const bytes = (await current()).sheets.get(path);
        if (!bytes) return next();
        response.setHeader("Content-Type", path.endsWith(".webp") ? "image/webp" : "image/png");
        response.end(bytes);
      });
      // An edited or added picture repacks the sheets, so the dev server never shows stale art.
      server.watcher.add(root);
      const repack = (file: string) => {
        if (!file.startsWith(root) || !IMAGE.test(file)) return;
        atlas = undefined;
        const module = server.moduleGraph.getModuleById(`\0${ID}`);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: "full-reload" });
      };
      for (const event of ["add", "change", "unlink"] as const) server.watcher.on(event, repack);
    },
    async generateBundle() {
      for (const [fileName, source] of (await current()).sheets) this.emitFile({ type: "asset", fileName, source });
    },
  };
}
