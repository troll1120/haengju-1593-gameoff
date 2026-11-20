import { expect, test } from "bun:test";
import { inflateSync } from "node:zlib";
import { ALLY_ANIMATIONS, ALLY_TEXTURES, BOW_ATTACK_ART, BOW_ATTACK_FRAMES, THROW_ATTACK_ART, FULL_ALLY_ART } from "./ally-animation";
import { ENEMY_ANIMATIONS, ENEMY_TEXTURES, enemyArt, FULL_ENEMY_ART } from "./enemy-animation";
import { fullsetArt } from "./fullset-art";
import { battleLayout, headLayout, UNIT_FRAME, BOSS_FRAME } from "./sprite-layout";
import { advance, createRun, soldier, useSkill } from "./rules";
import { contains, distance, fortRect } from "./geometry";
import type { Point } from "./geometry";
import { SHIP_ART, SHIP_FRAME } from "./river";
import { GENERALS, GENERAL_ART, generalUnit } from "./roster";
import { bphArtFile } from "./bph-art";

const art = `${import.meta.dir}/../public/art`;
async function size(file: string): Promise<{ width: number; height: number }> {
  const bytes = await Bun.file(`${art}/${file}`).bytes();
  const png = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: png.getUint32(16), height: png.getUint32(20) };
}
const bodies: string[] = [];
for await (const file of new Bun.Glob("**/*.png").scan(`${art}/units`)) bodies.push(file);
for (const file of bodies) test(`${file} contains exactly two configured unit frames`, async () => {
  expect(await size(`units/${file}`)).toEqual({ width: UNIT_FRAME.width * 2, height: UNIT_FRAME.height });
});
test("every active allied and enemy body is covered by the unit-sheet dimension checks", () => {
  for (const key of new Set([...ALLY_TEXTURES, ...ENEMY_TEXTURES])) expect(bodies).toContain(`${bphArtFile(key)}.png`);
});
for (const general of GENERALS) test(`${general} fields a complete body matching its class and configured frame layout`, async () => {
  const body = generalUnit(general);
  expect(await size(`units/${body}.png`)).toEqual({ width: UNIT_FRAME.width * 2, height: UNIT_FRAME.height });
  expect(body).toBe(GENERAL_ART[general]);
});
for (const actor of [...FULL_ENEMY_ART, ...FULL_ALLY_ART]) for (const direction of ["front", "back", "side"])
  for (const [pose, count] of Object.entries(fullsetArt(actor).poses))
    for (let frame = 0; frame < count; frame++) test(`${actor}/${direction}_${pose}_${frame} is one complete boss frame`, async () => {
      const set = fullsetArt(actor);
      expect(await size(`${set.file}/${direction}_${pose}_${frame}.png`)).toEqual(set.frame);
    });
/** RGBA bytes of a non-interlaced 8-bit RGBA PNG: the format of the pose frames and of a packed sheet re-encoded by Bun. */
function rgba(png: Uint8Array): { readonly width: number; readonly data: Uint8Array } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength), chunks: Uint8Array[] = [];
  if (view.getUint16(24) !== 0x0806 || png[28] !== 0) throw new Error("Expected a non-interlaced 8-bit RGBA PNG");
  for (let at = 8; at < png.length; at += view.getUint32(at) + 12)
    if (view.getUint32(at + 4) === 0x49444154) chunks.push(png.subarray(at + 8, at + 8 + view.getUint32(at)));
  const raw = inflateSync(Buffer.concat(chunks)), width = view.getUint32(16), stride = width * 4, data = new Uint8Array(stride * view.getUint32(20));
  for (let at = 0; at < data.length; at++) {
    const y = Math.floor(at / stride), x = at % stride, filter = raw[y * (stride + 1)];
    const a = x >= 4 ? data[at - 4] : 0, b = y ? data[at - stride] : 0, c = x >= 4 && y ? data[at - stride - 4] : 0;
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    data[at] = raw[y * (stride + 1) + x + 1] + (filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
  }
  return { width, data };
}
const packed = [...FULL_ENEMY_ART.map(actor => [actor, `boss-sheet-${actor}`, ENEMY_ANIMATIONS, `enemy-${actor}`] as const),
  ...FULL_ALLY_ART.map(actor => [actor, `ally-sheet-${actor}`, ALLY_ANIMATIONS, `ally-full-${actor}`] as const)];
for (const [actor, texture, animations, prefix] of packed) test(`${actor}'s packed sheet shows the exact pixels of every pose frame`, async () => {
  const set = fullsetArt(actor), { width, height } = set.frame;
  const sheet = rgba(await Bun.file(`${art}/${set.file}.webp`).image().png().bytes()), differing: string[] = [];
  for (const direction of ["front", "back", "side"]) for (const [pose, count] of Object.entries(set.poses)) {
    const frames = animations[`${prefix}-${direction}-${pose}`].frames;
    expect(frames.map(frame => frame.key)).toEqual(Array(count).fill(texture));
    for (const [index, { frame = -1 }] of frames.entries()) {
      const source = rgba(await Bun.file(`${art}/${set.file}/${direction}_${pose}_${index}.png`).bytes());
      const left = frame % set.columns * width, top = Math.floor(frame / set.columns) * height;
      let wrong = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const from = (y * width + x) * 4, to = ((top + y) * sheet.width + left + x) * 4, alpha = source.data[from + 3];
        // The colour stored under a fully transparent pixel is never drawn.
        if (alpha !== sheet.data[to + 3] || alpha && (source.data[from] !== sheet.data[to]
          || source.data[from + 1] !== sheet.data[to + 1] || source.data[from + 2] !== sheet.data[to + 2])) wrong++;
      }
      if (wrong) differing.push(`${direction}_${pose}_${index}: ${wrong}px`);
    }
  }
  expect(differing).toEqual([]);
});
for (const [actor, motion] of [...BOW_ATTACK_ART.map(actor => [actor, "bow"] as const),
  ...THROW_ATTACK_ART.map(actor => [actor, "throw"] as const)]) test(`${actor}'s ${motion}_attack sheet packs every ${motion} frame on the idle foot line`, async () => {
  const sheet = rgba(await Bun.file(`${art}/generals/${actor}_${motion}_attack.webp`).image().png().bytes()), differing: string[] = [];
  expect(sheet.width).toBe(BOSS_FRAME.width * BOW_ATTACK_FRAMES);
  for (const direction of ["front", "back", "side"]) {
    const frames = ALLY_ANIMATIONS[`ally-full-${actor}-${direction}-${motion}_attack`].frames;
    expect(frames.map(frame => frame.key)).toEqual(Array(BOW_ATTACK_FRAMES).fill(`ally-${motion}-${actor}`));
    const idle = rgba(await Bun.file(`${art}/generals/${actor}/${direction}_idle_0.png`).bytes());
    for (const [index, { frame = -1 }] of frames.entries()) {
      const source = rgba(await Bun.file(`${art}/generals/${actor}/${direction}_${motion}_attack_${index}.png`).bytes());
      const left = frame % BOW_ATTACK_FRAMES * BOSS_FRAME.width, top = Math.floor(frame / BOW_ATTACK_FRAMES) * BOSS_FRAME.height;
      let wrong = 0, idleFoot = -1, bowFoot = -1;
      for (let y = 0; y < BOSS_FRAME.height; y++) for (let x = 0; x < BOSS_FRAME.width; x++) {
        const from = (y * BOSS_FRAME.width + x) * 4, to = ((top + y) * sheet.width + left + x) * 4, alpha = source.data[from + 3];
        if (alpha !== sheet.data[to + 3] || alpha && (source.data[from] !== sheet.data[to]
          || source.data[from + 1] !== sheet.data[to + 1] || source.data[from + 2] !== sheet.data[to + 2])) wrong++;
        if (idle.data[from + 3]) idleFoot = y;
        if (alpha) bowFoot = y;
      }
      if (wrong) differing.push(`${direction}_${motion}_attack_${index}: ${wrong}px`);
      // The feet are the anchor: every bow frame stands on the idle body's foot line.
      if (bowFoot !== idleFoot) differing.push(`${direction}_${motion}_attack_${index} feet: ${bowFoot} vs ${idleFoot}`);
    }
  }
  expect(differing).toEqual([]);
});
for (const actor of SHIP_ART) test(`${actor} has fourteen ship frames across three directional rows`, async () => {
  expect(await size(`ships/${actor}.png`)).toEqual({ width: SHIP_FRAME.width * 14, height: SHIP_FRAME.height * 3 });
});
test("an unnamed elite uses the supplied samurai full-body set", () => {
  expect(enemyArt({ kind: "yari", boss: false, elite: true })).toEqual({ base: "samurai", full: true });
});

test.each([["yari", true, false], ["ukita", true, false], ["samurai", false, true]] as const)(
  "%s boss or elite does not displace either side of a contact pile", (kind, bossFlag, elite) => {
  const run = createRun(42), hero = run.squads[0], boss = run.enemies[0];
  Object.assign(boss, { kind, boss: bossFlag, elite, x: 195, y: 180 });
  Object.assign(hero, { x: 195, y: 196 });
  run.enemies = [boss, ...run.enemies.slice(1, 5)];
  for (const enemy of run.enemies.slice(1)) { enemy.x = 195; enemy.y = 180; }
  hero.soldiers = [soldier("spearman", 1, { x: 195, y: 184 })];
  const units = [hero, ...hero.soldiers, ...run.enemies];
  const before = structuredClone(run);

  const layout = battleLayout(run);
  for (const unit of units) expect(layout.get(unit) ?? unit).toMatchObject({ x: unit.x, y: unit.y });
  let previous = new Map<Point, Point>(units.map(unit => [unit, { x: unit.x, y: unit.y }]));
  for (let frame = 0; frame < 120; frame++) {
    previous = battleLayout(run, previous, 1 / 60);
    for (const unit of units) expect(previous.get(unit)).toEqual({ x: unit.x, y: unit.y });
  }
  expect(run).toEqual(before);
});

test("display frames preserve the combat RNG sequence, hitboxes and seeded battle result", () => {
  const control = createRun(1593);
  Object.assign(control.enemies[0], { boss: true, x: control.squads[0].x + 20, y: control.squads[0].y });
  const displayed = structuredClone(control), rng = control.rng;
  let previous = new Map<Point, Point>();
  for (let tick = 0; tick < 300; tick++) {
    if (tick === 100) expect(useSkill(displayed, 0)).toEqual(useSkill(control, 0));
    expect(advance(displayed, 1 / 30)).toEqual(advance(control, 1 / 30));
    for (let frame = 0; frame < 2; frame++) previous = battleLayout(displayed, previous, 1 / 60);
    expect(displayed.rng).toBe(control.rng);
  }
  expect(control.rng).not.toBe(rng);
  expect(displayed).toEqual(control);
});

test("nearby boss and general head displays occupy distinct vertical blocks", () => {
  const run = createRun(42), hero = run.squads[0], boss = run.enemies[0];
  Object.assign(boss, { boss: true, x: 195, y: 180 });
  Object.assign(hero, { x: 195, y: 188 });
  run.enemies = [boss];

  const heads = headLayout(run, new Map());

  expect(Math.abs((heads.get(hero) ?? 0) - (heads.get(boss) ?? 0))).toBeGreaterThanOrEqual(30);
});
test("walking interpolation near a boss stays outside walls and within its frame budget", () => {
  const run = createRun(42), hero = run.squads[0], boss = run.enemies[0], wall = fortRect(run.fort);
  Object.assign(hero, { x: wall.left - 24, y: 300 });
  Object.assign(boss, { boss: true, x: hero.x - 12, y: 300 });
  run.enemies = [boss]; hero.soldiers = [];
  let positions = new Map([[hero, { x: hero.x - 24, y: hero.y }]]);
  for (let frame = 0; frame < 120; frame++) {
    const before = positions.get(hero) ?? hero;
    const next = battleLayout(run, positions, 1 / 60);
    const at = next.get(hero) ?? hero;
    expect(distance(before, at)).toBeLessThanOrEqual(168 / 60 + 1e-7);
    expect(contains(wall, at)).toBe(false);
    positions = new Map([[hero, at]]);
  }
  expect(positions.get(hero)).toEqual({ x: hero.x, y: hero.y });
});

test("boss shield and health stay clear of an allied body above the boss", () => {
  const run = createRun(42), hero = run.squads[0], boss = run.enemies[0];
  Object.assign(boss, { boss: true, x: 195, y: 300 });
  Object.assign(hero, { x: 195, y: 248 });
  hero.soldiers = []; run.enemies = [boss];

  const heads = headLayout(run, new Map());

  const top = heads.get(boss) ?? 0;
  expect(top + 24).toBeLessThan(hero.y - 16 - 40);
});
