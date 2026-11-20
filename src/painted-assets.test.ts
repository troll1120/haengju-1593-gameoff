import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { BOSS_MARKS, HEAD_RING, chargeRing, paint, pixelIcon, timberFrame } from "./icons";
import type { IconName } from "./icons";
import { PAINTED_FILES } from "./painted-files";

type Asset = {
  slug: string; inventoryId: string; index?: number; url: string;
  width: number; height: number; sha256: string; nativeArtwork: boolean;
  frameWidth?: number; frameHeight?: number; frames?: number;
};
const publicRoot = resolve(import.meta.dir, "../public");
const manifest: { inventoryCount: number; assets: Asset[] } =
  await Bun.file(resolve(publicRoot, "art/icons/manifest.json")).json();

test("the image registry covers every inventory item and every native runtime part", () => {
  expect(manifest.inventoryCount).toBe(120);
  expect(new Set(manifest.assets.map(asset => asset.inventoryId)).size).toBe(120);
  expect(new Set(manifest.assets.map(asset => asset.slug)).size).toBe(manifest.assets.length);
  const native = manifest.assets.filter(asset => asset.nativeArtwork);
  const registered: string[] = [...PAINTED_FILES];
  expect(registered.sort()).toEqual(native.map(asset => asset.slug).sort());
  for (const asset of native) {
    const frameWidth = asset.frameWidth ?? asset.width;
    const frameHeight = asset.frameHeight ?? asset.height;
    expect([24, 32]).toContain(frameWidth);
    expect(frameHeight).toBe(frameWidth);
    expect(asset.width).toBe(frameWidth * (asset.frames ?? 1));
    expect(asset.height).toBe(frameHeight);
  }
});

test("every installed WebP matches the verified manifest bytes", async () => {
  const text = new TextDecoder();
  for (const asset of manifest.assets) {
    const bytes = await Bun.file(resolve(publicRoot, asset.url.slice(2))).bytes();
    expect(text.decode(bytes.subarray(0, 4))).toBe("RIFF");
    expect(text.decode(bytes.subarray(8, 12))).toBe("WEBP");
    expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
  }
});

test("runtime damage stages, lane and wall material are preloaded", () => {
  for (const slug of [
    "keep-cracks-stage-1", "keep-cracks-stage-2", "keep-cracks-stage-3",
    "range-danger-lane", "wall-protection-fill",
  ] as const) expect(PAINTED_FILES).toContain(slug);
});

test("icon and legacy entry points bind actual image files while paint remains exported", () => {
  const urls = new Set(manifest.assets.map(asset => asset.url));
  const names = new Set(manifest.assets.filter(asset => asset.index && asset.index <= 41)
    .map(asset => asset.inventoryId));
  expect(names.size).toBe(41);
  for (const name of names) expect(urls.has(pixelIcon(name as IconName))).toBe(true);
  for (const name of ["mastery", "foil", "fame", "grain", "relic", "military-order", "attack"] as const)
    expect(urls.has(pixelIcon(name))).toBe(true);
  for (const slug of Object.values(BOSS_MARKS)) expect(PAINTED_FILES).toContain(slug);
  expect(urls.has(HEAD_RING)).toBe(true);
  expect(urls.has(timberFrame())).toBe(true);
  expect(typeof paint).toBe("function");
  for (const kind of ["plate", "portrait", "urgent"] as const) {
    const strip = manifest.assets.find(asset => asset.url === chargeRing(kind))!;
    expect(strip.frames).toBe(13);
    expect(strip.width).toBe(32 * 13);
    expect(strip.frameWidth).toBe(32);
    expect(strip.frameHeight).toBe(32);
  }
});
