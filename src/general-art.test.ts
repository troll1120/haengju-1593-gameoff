import { afterAll, beforeAll, expect, test } from "bun:test";
import { inflateSync } from "node:zlib";
import { resolve } from "node:path";
import { type launch, reviewBrowserSession } from "../scripts/review-browser";
import { ART_ORIGINAL } from "./art-root";
import { GENERAL_ART, GENERALS, SOLDIERS } from "./roster";
import { PALETTE } from "./presentation";

let fixturePhone: Awaited<ReturnType<typeof launch>>;
let fixtureServer: ReturnType<typeof Bun.serve>;
const session = reviewBrowserSession(["--single-process", "--no-zygote", "--disable-gpu"]);
beforeAll(async () => {
  const built = await Bun.build({
    entrypoints: [resolve(import.meta.dir, "general-art.ts")],
    target: "browser",
  });
  expect(built.success).toBe(true);
  const module = await built.outputs[0].text();
  fixtureServer = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/module.js") return new Response(module, { headers: { "Content-Type": "text/javascript" } });
      if (path.startsWith("/art/")) return new Response(Bun.file(resolve(import.meta.dir, "../public", path.slice(1))));
      return new Response("<!doctype html><html><body></body></html>", { headers: { "Content-Type": "text/html" } });
    },
  });
  fixturePhone = await session.open();
  await fixturePhone.view.navigate(`http://127.0.0.1:${fixtureServer.port}/`);
  await fixturePhone.evaluate(`(async () => {
    const { personalize, recolorPainted } = await import("/module.js");
    const pictures = new Map();
    for (const base of ["lee_boknam","no_gaebang","lee_jeongheon","kim_huisu","song_bongsu"]) {
      const picture = new Image();
      picture.src = "./art/icons/personalize-" + base + ".webp";
      await picture.decode();
      pictures.set("personalize-" + base, picture);
    }
    for (const suffix of ["white", "hurt"]) {
      const picture = new Image();
      picture.src = "./art/icons/hit-masks-" + suffix + ".webp";
      await picture.decode();
      pictures.set("hit-masks-" + suffix, picture);
    }
    window.personalizePixels = (base, input, width) => {
      const data = new Uint8ClampedArray(input);
      personalize(base, data, width, { source: slug => pictures.get(slug) });
      return Array.from(data);
    };
    window.tintPixels = (suffix, input) => {
      const source = pictures.get("hit-masks-" + suffix);
      const canvas = document.createElement("canvas");
      canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
      const context = canvas.getContext("2d");
      context.drawImage(source, 0, 0);
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Map();
      for (let at = 0; at < rgba.length; at += 4) if (rgba[at + 3])
        colors.set(rgba[at] << 16 | rgba[at + 1] << 8 | rgba[at + 2], [...rgba.slice(at, at + 3)]);
      const materials = [...colors.values()].sort((a,b) => a[0]+a[1]+a[2]-b[0]-b[1]-b[2]).slice(1);
      const data = new Uint8ClampedArray(input);
      recolorPainted(data, source, suffix === "white" ? .3 : .5);
      return { pixels: Array.from(data), materials };
    };
  })()`);
}, 45000);
afterAll(async () => {
  await session.close();
  fixtureServer?.stop(true);
});
async function personalize(base: string, data: Uint8ClampedArray, width: number): Promise<void> {
  const result = await fixturePhone.evaluate(
    `window.personalizePixels(${JSON.stringify(base)},${JSON.stringify([...data])},${width})`,
  );
  expect(Array.isArray(result)).toBe(true);
  expect(result).toHaveLength(data.length);
  data.set(result as number[]);
}

/** Decode the shipped 8-bit RGBA unit sheets, including all five PNG row filters. */
async function pixels(base: string, directory = `${import.meta.dir}/../public/art/units`): Promise<Uint8ClampedArray> {
  const png = await Bun.file(`${directory}/${base}.png`).bytes();
  expect([png[24], png[25]]).toEqual([8, 6]);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength), chunks: Uint8Array[] = [];
  for (let at = 8; at < png.length;) {
    const size = view.getUint32(at), kind = String.fromCharCode(...png.subarray(at + 4, at + 8));
    if (kind === "IDAT") chunks.push(png.subarray(at + 8, at + 8 + size));
    at += size + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), width = view.getUint32(16), height = view.getUint32(20), stride = width * 4;
  const out = new Uint8ClampedArray(stride * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < stride; x++) {
    const filter = raw[y * (stride + 1)], at = y * stride + x;
    const a = x >= 4 ? out[at - 4] : 0, b = y ? out[at - stride] : 0, c = x >= 4 && y ? out[at - stride - 4] : 0;
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    out[at] = (raw[y * (stride + 1) + x + 1] + predictor) % 256;
  }
  return out;
}
test("personal silhouettes separate every general and soldier pair in the shipped pixels", async () => {
  const bodies: { base: string; data: Uint8ClampedArray }[] = [];
  for (const base of [...GENERALS.map(general => GENERAL_ART[general]), ...SOLDIERS]) {
    const data = await pixels(base);
    await personalize(base, data, 64);
    bodies.push({ base, data });
  }
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    let intersection = 0, union = 0, similar = 0;
    // Acceptance uses the first original 32x32 cell.
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const at = (y * 64 + x) * 4, a = bodies[i].data, b = bodies[j].data;
      if (a[at + 3] > 40 || b[at + 3] > 40) union++;
      if (a[at + 3] > 40 && b[at + 3] > 40) {
        intersection++;
        if (Math.abs(a[at] - b[at]) + Math.abs(a[at + 1] - b[at + 1]) + Math.abs(a[at + 2] - b[at + 2]) < 60) similar++;
      }
    }
    const silhouette = intersection / union, sharedColor = similar / intersection;
    expect({ pair: `${bodies[i].base}/${bodies[j].base}`, duplicate: silhouette >= .97 && sharedColor >= .60 }).toEqual({
      pair: `${bodies[i].base}/${bodies[j].base}`, duplicate: false,
    });
    if (silhouette * sharedColor > .70)
      console.error("SILHOUETTE_REGRESSION", { pair: `${bodies[i].base}/${bodies[j].base}`, silhouette, sharedColor });
    expect(silhouette * sharedColor).toBeLessThanOrEqual(.70);
  }
});
test("only retained original sheets receive source-palette flags in both animation cells", async () => {
  const changed: string[] = [];
  for (const general of GENERALS) {
    const base = GENERAL_ART[general], data = await pixels(base), original = data.slice();
    await personalize(base, data, 64);
    if (!data.every((value, i) => value === original[i])) {
      changed.push(base);
      for (const frame of [0, 32]) {
        const pole = (12 * 64 + frame + 1) * 4;
        expect([...data.slice(pole, pole + 4)]).toEqual([0x26, 0x2b, 0x44, 255]);
      }
    }
  }
  expect(changed).toEqual(["lee_boknam", "no_gaebang", "lee_jeongheon", "kim_huisu", "song_bongsu"]);
});
test("the drawing palette contains exactly the opaque colors in the forty-one original unit sheets", async () => {
  const original = new Set<number>();
  const directory = `${ART_ORIGINAL}/haengju/units`;
  for await (const file of new Bun.Glob("*.png").scan(directory)) {
    const data = await pixels(file.slice(0, -4), directory);
    for (let at = 0; at < data.length; at += 4) if (data[at + 3] > 40)
      original.add(data[at] << 16 | data[at + 1] << 8 | data[at + 2]);
  }
  expect(new Set<number>(Object.values(PALETTE))).toEqual(original);
});
test("Lee Boknam recolors only his helmet plume, preserving facial pixels", async () => {
  for (const [base, plume] of [["lee_boknam", PALETTE.gold]] as const) {
    const data = await pixels(base), original = data.slice();
    await personalize(base, data, 64);
    for (const frame of [0, 32]) {
      const tip = (4 * 64 + frame + 20) * 4, cheek = (14 * 64 + frame + 23) * 4;
      expect([...data.slice(tip, tip + 3)]).toEqual([plume >> 16, plume >> 8 & 255, plume & 255]);
      expect([...data.slice(cheek, cheek + 4)]).toEqual([...original.slice(cheek, cheek + 4)]);
    }
  }
});
test("approved general sheets stay pixel-exact through runtime personalization", async () => {
  for (const base of ["samyeong", "yi_sunsin", "kim_simin", "hwang_jin", "shin_gak", "kim_yeomul"]) {
    const data = await pixels(base), original = data.slice();
    await personalize(base, data, 64);
    expect(data).toEqual(original);
  }
});

test("actual painted hit materials preserve every alpha and both frames' color detail", async () => {
  const original = await pixels("lee_boknam");
  for (const [suffix, opacity] of [["white", .3], ["hurt", .5]] as const) {
    const result = await fixturePhone.evaluate(
      `window.tintPixels(${JSON.stringify(suffix)},${JSON.stringify([...original])})`,
    ) as { pixels: number[]; materials: number[][] };
    expect(result.pixels).toHaveLength(original.length);
    expect(result.materials.length).toBeGreaterThan(1);
    const detail = [new Set<string>(), new Set<string>()];
    for (let at = 0; at < original.length; at += 4) {
      expect(result.pixels[at + 3]).toBe(original[at + 3]);
      if (!original[at + 3]) {
        expect(result.pixels.slice(at, at + 4)).toEqual([...original.slice(at, at + 4)]);
        continue;
      }
      const level = Math.min(result.materials.length - 1,
        Math.floor((original[at] + original[at + 1] + original[at + 2]) / 765 * result.materials.length));
      for (let channel = 0; channel < 3; channel++)
        expect(result.pixels[at + channel]).toBe(
          Math.round(original[at + channel] * (1 - opacity) + result.materials[level][channel] * opacity));
      detail[Math.floor((at / 4 % 64) / 32)].add(result.pixels.slice(at, at + 3).join(","));
    }
    for (const frame of detail) expect(frame.size).toBeGreaterThan(2);
  }
});
