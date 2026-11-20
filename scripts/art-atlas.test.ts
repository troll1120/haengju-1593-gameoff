import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAtlas, decodeArt, encodePng, samePixels } from "./art-atlas";

const picture = (width: number, height: number, seed: number) => {
  const data = new Uint8Array(width * height * 4);
  for (let at = 0; at < data.length; at += 4) data.set([(at * seed) & 255, (at >> 3) & 255, seed * 40 & 255, at % 7 ? 255 : 0], at);
  return { width, height, data };
};

describe("art atlas", () => {
  test("packs png and lossless webp per folder with exact pixels, leaves the rest as single files", async () => {
    const root = mkdtempSync(join(tmpdir(), "art-atlas-"));
    try {
      const put = (file: string, bytes: Uint8Array) => { mkdirSync(join(root, file, ".."), { recursive: true }); writeFileSync(join(root, file), bytes); };
      const sources = new Map([["icons/a.png", picture(16, 16, 1)], ["icons/b.png", picture(24, 8, 2)], ["units/c.png", picture(64, 32, 3)],
        ["generals/kim/front_idle_0.png", picture(48, 48, 4)]]);
      for (const [file, image] of sources) put(file, encodePng(image));
      const lossless = picture(20, 12, 5);
      put("icons/d.webp", await new Bun.Image(encodePng(lossless)).webp({ lossless: true }).bytes());
      put("icons/lossy.webp", await new Bun.Image(encodePng(picture(20, 12, 6))).webp({ quality: 60 }).bytes());
      put("scenes/camp.png", encodePng(picture(8, 8, 7)));
      put("generals/kim.webp", await new Bun.Image(encodePng(picture(32, 32, 8))).webp({ lossless: true }).bytes());

      const { index, sheets } = await buildAtlas(root);

      expect([...index.loose].sort()).toEqual(["generals/kim.webp", "icons/lossy.webp", "scenes/camp.png"]);
      expect(index.pages.map(page => page.group).sort()).toEqual(["generals", "icons", "units"]);
      sources.set("icons/d.webp", lossless);
      for (const [file, image] of sources) {
        const [page, x, y, width, height] = index.frames[file];
        const sheet = await decodeArt(index.pages[page].file, sheets.get(index.pages[page].file)!);
        const cut = new Uint8Array(width * height * 4);
        for (let row = 0; row < height; row++) cut.set(sheet.data.subarray(((y + row) * sheet.width + x) * 4, ((y + row) * sheet.width + x + width) * 4), row * width * 4);
        expect(samePixels({ width, height, data: cut }, image)).toBe(true);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
