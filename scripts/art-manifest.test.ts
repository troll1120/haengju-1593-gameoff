import { expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { buildAtlas } from "./art-atlas";
import { packedFrameFolders } from "./art-manifest";

const root = resolve(import.meta.dir, "../public/art");

test("every soldier and general frame folder is left out of builds only because its packed sheet ships beside it", () => {
  const folders = ["soldiers", "generals"].flatMap(top => readdirSync(resolve(root, top), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => `${top}/${entry.name}`)).sort();
  expect(packedFrameFolders(root)).toEqual(folders);
  for (const folder of folders) expect([folder, existsSync(resolve(root, `${folder}.webp`))]).toEqual([folder, true]);
});

test("the preload fetches the packed sheets as single files and never one of their source frames", async () => {
  const { index } = await buildAtlas(root, resolve(import.meta.dir, "../node_modules/.cache/art-atlas"));
  const single = index.loose, packed = packedFrameFolders(root);
  expect(single.filter(file => packed.some(folder => file.startsWith(`${folder}/`)))).toEqual([]);
  for (const folder of packed) expect(single).toContain(`${folder}.webp`);
  expect(single).toContain("generals/kwak_jaeu_bow_attack.webp");
});
