import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { ART_ORIGINAL, ART_PROJECT } from "./art-root";
import { whitenHitPixels } from "./hit-feedback";

const project = ART_PROJECT;
const original = ART_ORIGINAL;
const sample = resolve(import.meta.dir, "../public/art");
const approved = await Bun.file(resolve(import.meta.dir, "../review/p10/art-wire/installed-assets.json")).json();
const replacements = new Map<string, string>(approved.assets.map((asset: { unit: string; sha256: string }) =>
  [asset.unit.replace("public/art/", ""), asset.sha256]));
for (const pack of approved.packIcons as { icon: string; sha256: string }[])
  replacements.set(pack.icon.replace("public/art/", ""), pack.sha256);
/** Unified survival portraits are approved by their own install record; each replaces the earlier file of the same name. */
const unified: { portraits: Record<string, string> } =
  await Bun.file(resolve(import.meta.dir, "../review/survival-skill-icons-1116/installed-art.json")).json();
for (const [file, sha256] of Object.entries(unified.portraits)) replacements.set(file, sha256);
/** The arrow projectile sheet is this project's own drawing, approved by its install record. */
const arrow: { art: Record<string, string> } =
  await Bun.file(resolve(import.meta.dir, "../review/survival-arrow-projectile-1116/installed-art.json")).json();
for (const [file, sha256] of Object.entries(arrow.art)) replacements.set(file, sha256);
/** Full-body general sets the sprite pipeline produced outside the originals are approved by their own install record. */
const fullBodies: { sets: Record<string, { origin: string; folder: string; sha256: Record<string, string> }> } =
  await Bun.file(resolve(import.meta.dir, "../review/general-fullsets-1116/installed-art.json")).json();
for (const set of Object.values(fullBodies.sets)) if (set.origin.startsWith("pipeline-"))
  for (const [frame, sha256] of Object.entries(set.sha256)) replacements.set(`${set.folder.replace("public/art/", "")}/${frame}.png`, sha256);
/** The approved relic panel supplies nine original drawings, pinned to its source commit. */
const relicArt: { art: Record<string, string> } =
  await Bun.file(resolve(import.meta.dir, "../review/relic-panel-1117/installed-art.json")).json();
for (const [file, sha256] of Object.entries(relicArt.art)) replacements.set(file, sha256);
/** The eleven tactic books recolour only the cover of the shared book, approved by their install record. */
const tomeArt: { art: Record<string, string> } =
  await Bun.file(resolve(import.meta.dir, "../review/recruit-tomes-1117/installed-art.json")).json();
for (const [file, sha256] of Object.entries(tomeArt.art)) replacements.set(file, sha256);
/** The codex cleanup removed two detached 12-pixel blobs from the enemy spear sheet, approved by its install record. */
const cleaned: { art: Record<string, string> } =
  await Bun.file(resolve(import.meta.dir, "../review/codex-unknown/sprite-blobs/installed-art.json")).json();
for (const [file, sha256] of Object.entries(cleaned.art)) replacements.set(file, sha256);
/** Per-unit variant sheets recoloured and patched from the class sheets, approved by their install record. */
const variants: { art: Record<string, string> } =
  await Bun.file(resolve(import.meta.dir, "../review/unit-variants-1117/installed-art.json")).json();
for (const [file, sha256] of Object.entries(variants.art)) replacements.set(file, sha256);
/** The approved Japanese cavalry sheets supersede the earlier variant import. */
const cavalryArt: { art: Record<string, string> } =
  await Bun.file(resolve(import.meta.dir, "../review/japan-cavalry-art-1119/installed-art.json")).json();
for (const [file, sha256] of Object.entries(cavalryArt.art)) replacements.set(file, sha256);
/** Approved staged motion frames and palette-only variants retain their install hashes. */
const soldiers: { sets: Record<string, { frames: Record<string, string> }> } =
  await Bun.file(resolve(import.meta.dir, "../review/soldier-fullsets-1117/installed-art.json")).json();
for (const [actor, set] of Object.entries(soldiers.sets))
  for (const [frame, sha256] of Object.entries(set.frames)) replacements.set(`soldiers/${actor}/${frame}`, sha256);
/** Enemy spearman, militia, gunner and guard motion sets the owner approved on 2026-11-18, pinned by their install record. */
const addedSoldiers: { sets: Record<string, { frames: Record<string, string> }> } =
  await Bun.file(resolve(import.meta.dir, "../review/soldier-fullsets-1118/installed-art.json")).json();
for (const [actor, set] of Object.entries(addedSoldiers.sets))
  for (const [frame, sha256] of Object.entries(set.frames)) replacements.set(`soldiers/${actor}/${frame}`, sha256);
/** The general join's gate light, gate dust and card glint sheets are image-tool drawings the owner approved, pinned by their install record. */
const joinFx: { art: Record<string, string> } =
  await Bun.file(resolve(import.meta.dir, "../review/general-join-fx-art/installed-art.json")).json();
for (const [file, sha256] of Object.entries(joinFx.art)) replacements.set(file, sha256);
/** The generals' own basic-attack reach sheets (cannon shot, hoof dust, charge wedge, sword thrust, staff sweep) are image-tool drawings, pinned by their install record. */
const generalFx: { art: Record<string, string> } =
  await Bun.file(resolve(import.meta.dir, "../review/general-fx-1118/installed-art.json")).json();
for (const [file, sha256] of Object.entries(generalFx.art)) replacements.set(file, sha256);
/** 송상현's thrown-tablet sheet is image-tool artwork (four flight frames of his wooden tablet) in the same reach-sheet format, pinned by its install record. */
const tabletFx: { art: Record<string, string> } =
  await Bun.file(resolve(import.meta.dir, "../review/songsanghyeon-tablet-1118/installed-art.json")).json();
for (const [file, sha256] of Object.entries(tabletFx.art)) replacements.set(file, sha256);
/** Song Sanghyeon's throw poses and tablet contact sheet are pinned by their install record. */
const tabletThrow: { art: Record<string, string> } =
  await Bun.file(resolve(import.meta.dir, "../review/tablet-throw-hit-1118/installed-art.json")).json();
for (const [file, sha256] of Object.entries(tabletThrow.art)) replacements.set(file, sha256);
/** Yi Sun-sin's and Gwak Jae-u's bow_attack frames are image-tool edits of their own sword attack frames, approved by their install record. */
const bowFrames: { art: Record<string, string> } =
  await Bun.file(resolve(import.meta.dir, "../review/general-bow-attack-1117/installed-art.json")).json();
for (const [file, sha256] of Object.entries(bowFrames.art)) replacements.set(file, sha256);
/** Generation background trapped inside soldier and general frames was made transparent, pinned by its install record. */
const trappedBackground: { art: Record<string, string> } =
  await Bun.file(resolve(import.meta.dir, "../review/trapped-bg-1117/installed-art.json")).json();
for (const [file, sha256] of Object.entries(trappedBackground.art)) replacements.set(file, sha256);
/** Enclosed gaps filled with outline or background colour (bow loops, between arm and body or weapon) were opened, pinned by their install record. */
const enclosedHoles: { art: Record<string, string> } =
  await Bun.file(resolve(import.meta.dir, "../review/enclosed-holes-1117/installed-art.json")).json();
for (const [file, sha256] of Object.entries(enclosedHoles.art)) replacements.set(file, sha256);
/** Round-8 tactic covers, command-building tiers and the ladder carrier the owner approved in the ledger, pinned by their install record. */
const round8: { art: Record<string, string> } =
  await Bun.file(resolve(import.meta.dir, "../review/round8-art-1118/installed-art.json")).json();
for (const [file, sha256] of Object.entries(round8.art)) replacements.set(file, sha256);
/** The dock's troop upgrade pack is an original image-tool drawing with its own install record. */
const packSlot: { art: Record<string, string> } =
  await Bun.file(resolve(import.meta.dir, "../review/pack-slot-1119/installed-art.json")).json();
for (const [file, sha256] of Object.entries(packSlot.art)) replacements.set(file, sha256);
const portraits = new Map<string, string>(approved.assets.filter((asset: { portrait: boolean }) => asset.portrait)
  .map((asset: { id: string; portraitSha256: string }) => [`portraits/${asset.id}.png`, asset.portraitSha256]));
const haengju = [
  "scenes/camp.png", "portraits/gwon_yul.png", "portraits/hero.png",
  "portraits/cheo_yeong.png", "portraits/ukita.png",
  "fx/blast_big.png", "fx/death.png", "fx/volley_arc.png", "fx/command.png",
  "terrain/grass_1.png", "terrain/grass_2.png", "terrain/grass_3.png",
  "terrain/path_1.png", "terrain/path_2.png", "terrain/path_3.png",
  "terrain/edge/path_w.png", "terrain/edge/path_e.png",
  "props/wall_ew_a.png", "props/wall_ew_b.png", "props/wall_ew_c.png", "props/wall_ew_d.png",
  "units/archer.png", "units/hwacha.png", "units/yari.png", "units/teppo.png",
  "units/spearman.png", "units/monk.png", "units/kim_simin.png", "units/hero.png", "units/cavalry.png",
  "portraits/kim_simin.png", "props/gate_stone.png", "props/tent.png", "props/tree.png",
  ...["es", "sw", "ne", "nw", "ns"].flatMap(shape => ["a", "b", "c", "d"].map(wear => `props/wall_${shape}_${wear}.png`)),
  "fx/blast.png", "fx/slash.png", "fx/smoke.png", "fx/heal.png", "fx/charge.png", "fx/volley.png", "fx/hit.png", "fx/muzzle.png",
  "anim/scorch.png", "anim/fire_blaze.png", "units/konishi.png", "units/kobayakawa.png", "units/wakizaka.png",
  "units/gwon_yul.png", "units/samurai.png", "units/ukita.png",
  "terrain/edge/path_n.png", "terrain/edge/path_s.png", "terrain/edge/path_ne.png", "terrain/edge/path_nw.png",
  "terrain/edge/path_se.png", "terrain/edge/path_sw.png", "terrain/brush.png", "terrain/rock.png", "terrain/slope_1.png",
];
for (const path of haengju) test(`original Haengju pixels: ${path}`, async () => {
  const replacement = replacements.get(path), portrait = portraits.get(path);
  if (replacement) {
    expect(new Bun.CryptoHasher("sha256").update(await Bun.file(`${sample}/${path}`).bytes()).digest("hex")).toBe(replacement);
    return;
  }
  if (portrait) {
    expect(new Bun.CryptoHasher("sha256").update(await Bun.file(`${sample}/${path}`).bytes()).digest("hex")).toBe(portrait);
    return;
  }
  const source = await Bun.file(`${original}/haengju/${path}`).bytes();
  expect(await Bun.file(`${sample}/${path}`).bytes()).toEqual(source);
});
test("original supply crate marks the reward chest", async () => {
  expect(await Bun.file(`${sample}/scenes/cargo_intact.png`).bytes()).toEqual(await Bun.file(`${original}/scenes/cargo_intact.png`).bytes());
});
test("every shipped picture is an original or approved p9 replacement", async () => {
  const shipped: string[] = [];
  for await (const file of new Bun.Glob("**/*.png").scan(sample)) shipped.push(file);
  expect(shipped.length).toBeGreaterThan(80);
  for (const file of shipped) {
    const replacement = replacements.get(file), portrait = portraits.get(file);
    if (replacement) {
      expect(new Bun.CryptoHasher("sha256").update(await Bun.file(`${sample}/${file}`).bytes()).digest("hex")).toBe(replacement);
      continue;
    }
    if (portrait) {
      expect(new Bun.CryptoHasher("sha256").update(await Bun.file(`${sample}/${file}`).bytes()).digest("hex")).toBe(portrait);
      continue;
    }
    const source = file.startsWith("ui/") ? `chrome/${file.slice(3)}` : file === "scenes/cargo_intact.png" || file.startsWith("icons/") ? file : `haengju/${file}`;
    expect([file, await Bun.file(`${sample}/${file}`).bytes()]).toEqual([file, await Bun.file(`${original}/${source}`).bytes()]);
  }
});
for (const name of ["window", "windowFill", "plateTall", "buttonNormal", "buttonFocused", "buttonDisabled", "portrait", "pointer"]) {
  test(`original UI frame: ${name}`, async () => {
    expect(await Bun.file(`${sample}/ui/${name}.png`).bytes())
      .toEqual(await Bun.file(`${original}/chrome/${name}.png`).bytes());
  });
}
test("cards and result contain real artwork and original font families", async () => {
  const html = await Bun.file(resolve(import.meta.dir, "../index.html")).text();
  const main = await Bun.file(resolve(import.meta.dir, "main.ts")).text();
  const css = await Bun.file(resolve(import.meta.dir, "style.css")).text();
  expect(html).toContain('src="./art/scenes/camp.png"');
  expect(html).toContain('src="./art/portraits/gwon_yul.png"');
  expect(main).toContain('class="card-illustration');
  expect(css).toContain('url("/fonts/DNFBitBitv2.otf")');
  expect(css).toContain('url("/art/ui/window.png")');
  expect(/\p{Extended_Pictographic}/u.test(html + main + css)).toBe(false);
  expect(html + main).not.toContain("수비대");
});
test("the served font is the official DNF Bit Bit v2 file, untouched and shipped with its licence notice as that licence requires", async () => {
  const font = await Bun.file(resolve(import.meta.dir, "../public/fonts/DNFBitBitv2.otf")).bytes();
  expect(new Bun.CryptoHasher("sha256").update(font).digest("hex")).toBe("ffa93fec1e4407156b04a1eb2aad3018746d4eb3ef3000c0720e49f068dda622");
  expect(await Bun.file(resolve(import.meta.dir, "../public/LICENSE-DNFBitBitv2.md")).exists()).toBe(true);
});
test("all 144 strike overlays reuse the original hitfx pixels", async () => {
  const frames: string[] = [];
  for await (const file of new Bun.Glob("*_fx.png").scan(resolve(import.meta.dir, "assets/hitfx"))) frames.push(file);
  expect(frames.length).toBe(144);
  for (const file of frames) {
    expect(await Bun.file(resolve(import.meta.dir, "assets/hitfx", file)).bytes())
      .toEqual(await Bun.file(resolve(project, "tools/art-haengju/proof/hitfx", file)).bytes());
  }
});
test("three burst families animate original strike frames and flash the whole viewport", async () => {
  for (const actor of ["gwon_yul", "kim_simin", "cheo_yeong"])
    for (let frame = 0; frame < 4; frame++)
      expect(await Bun.file(resolve(import.meta.dir, `assets/hitfx/${actor}_side_attack_${frame}_fx.png`)).exists()).toBe(true);
  const main = await Bun.file(resolve(import.meta.dir, "main.ts")).text();
  expect(main).toContain('flame: "gwon_yul", powder: "kim_simin", evolution: "cheo_yeong"');
  expect(await Bun.file(resolve(import.meta.dir, "../index.html")).text()).toContain('id="screen-flash"');
  expect(await Bun.file(resolve(import.meta.dir, "style.css")).text()).toContain('#screen-flash { position: fixed; inset: 0;');
});
test("white hit feedback preserves every silhouette alpha including transparent pixels", () => {
  const pixels = new Uint8ClampedArray([20, 40, 80, 255, 15, 30, 60, 128, 10, 20, 30, 0]);
  whitenHitPixels(pixels);
  expect([...pixels]).toEqual([255, 255, 255, 255, 255, 255, 255, 128, 10, 20, 30, 0]);
});
test("white hit feedback keeps the dark outline so a struck figure stays crisp instead of a blob", () => {
  const pixels = new Uint8ClampedArray([0x1e, 0x23, 0x33, 255, 0x26, 0x2b, 0x44, 255, 0xc8, 0x6f, 0x60, 255]);
  whitenHitPixels(pixels);
  expect([...pixels]).toEqual([0x1e, 0x23, 0x33, 255, 0x26, 0x2b, 0x44, 255, 255, 255, 255, 255]);
});
