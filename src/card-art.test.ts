import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { BPH_GENERALS } from "./bph-commanders";
import { SKILL_ICONS, skillIconFile, skillPicture } from "./card-art";
import { generalPortrait } from "./roster";

const shipped = resolve(import.meta.dir, "../public");
const digest = async (file: string) => new Bun.CryptoHasher("sha256").update(await Bun.file(resolve(shipped, file)).bytes()).digest("hex");

test("every survival commander's skill button shows a picture of its own", async () => {
  const files = BPH_GENERALS.map(general => skillIconFile(SKILL_ICONS[general]));
  expect(new Set(files).size).toBe(BPH_GENERALS.length);
  BPH_GENERALS.forEach((general, index) => expect(skillPicture(general)).toContain(`src="${files[index]}"`));
  const pictureBytes = await Promise.all(files.map(digest));
  expect(new Set(pictureBytes).size).toBe(BPH_GENERALS.length);
});

test("every survival commander shows a portrait of their own", async () => {
  const files = BPH_GENERALS.map(general => `art/portraits/${generalPortrait(general)}.png`);
  expect(new Set(files).size).toBe(BPH_GENERALS.length);
  expect(new Set(await Promise.all(files.map(digest))).size).toBe(BPH_GENERALS.length);
});
