import { expect, test } from "bun:test";
import { addBphProfile, bphStats } from "./bph-combat";
import type { BphGeneral } from "./bph-commanders";
import { bphHireSlots } from "./bph-join";
import { freshBphSave } from "./bph-save";
import { createBphRun } from "./bph-session";
import { activeBphEffects } from "./bph-upgrades";
import { freshMeta } from "./meta";
import { advance, createRun, hireBphGeneral } from "./rules";
import type { Run } from "./rules";
import { riverLane } from "./river";
import { UNIT_SPECIAL_TEXT } from "./unit-codex-i18n";

function battle(general: BphGeneral, special = 0): Run {
  const meta = freshMeta(), save = meta.bph = freshBphSave(51);
  if (special) save.unitUpgrades.Hero1_Barbarian = { special };
  return createBphRun(meta, { seed: 1593, general, upgrades: activeBphEffects(save) });
}

function spawn(run: Run, profileId: string, copies = 1) {
  const troops = run.squads[0].soldiers, index = troops.length;
  addBphProfile(run, { profileId, copies, foil: false, discovered: false },
    { packId: "Pack1_Basic", position: { x: 100, y: 200 } });
  return troops[index];
}

const pairs = [
  ["권율", "Hero2_Pyromancer", "cooldown", 1 / 1.10, 0],
  ["신립", "Hero5_Rider", "moveSpeed", 1.10, 0],
  ["신립", "Hero5_Rider", "damage", 1.08, 0],
  ["송상현", "Hero1_Archer", "range", 1.10, 0],
  ["황진", "Hero1_Squire", "hp", 1.12, 0],
  ["김시민", "Hero6_Shotgun", "damage", 1.10, 0],
  ["사명대사", "Hero2_Monk", "damageReduction", 1, .10],
  ["이순신", "Hero7_AstralFisher", "cooldown", 1 / 1.10, 0],
] as const;
const troopProfiles = [...new Set([...pairs.map(([, profile]) => profile), "Hero1_Barbarian"])];

for (const [general, profile, stat, factor, addition] of pairs) {
  test(`${general} changes ${stat} only for its own troop while fielded`, () => {
    const run = battle("곽재우");
    if (run.bph) run.bph.save.unlockedGenerals = ["곽재우", general];
    const troop = spawn(run, profile);
    // Check every other pairing, including the gunner and hwacha that share a body kind.
    const others = troopProfiles.filter(id => id !== profile).map(id => spawn(run, id));
    const before = bphStats(troop, run), othersBefore = others.map(unit => bphStats(unit, run));
    if (!before) throw new Error("Expected recruited troop stats");

    run.gold = bphHireSlots(run)[0].price;
    hireBphGeneral(run, 0);
    expect(run.squads[1].general).toBe(general);
    expect(bphStats(troop, run)?.[stat]).toBeCloseTo(before[stat] * factor + addition, 9);
    expect(others.map(unit => bphStats(unit, run))).toEqual(othersBefore);

    const leader = run.squads[1];
    leader.hp = 0;
    leader.downUntil = run.time + 20;
    expect(bphStats(troop, run)?.[stat]).toBeCloseTo(before[stat] * factor + addition, 9);
    run.squads.pop();
    expect(bphStats(troop, run)).toEqual(before);
  });
}

test("황진 increases existing and newly recruited spearmen's live HP without changing their health fraction", () => {
  const run = battle("권율");
  const save = run.bph?.save;
  if (!save) throw new Error("Expected survival run");
  save.unlockedGenerals.push("황진");
  const spearman = spawn(run, "Hero1_Squire"), originalMax = spearman.maxHp;
  spearman.hp = originalMax / 2;

  run.gold = bphHireSlots(run)[0].price;
  hireBphGeneral(run, 0);
  const recruit = spawn(run, "Hero1_Squire");
  advance(run, .05);

  expect(spearman.maxHp).toBeCloseTo(originalMax * 1.12, 9);
  expect(spearman.hp).toBeCloseTo(spearman.maxHp / 2, 9);
  expect(recruit.hp).toBeCloseTo(spearman.maxHp, 9);
});

for (const [stage, damagePerAlly, capWord] of [[0, 0, "다섯"], [1, .04, "여섯"], [2, .06, "일곱"], [3, .08, "여덟"]] as const) {
  test(`militia upgrade copy shows the actual run cap at special stage ${stage}`, () => {
    const description = UNIT_SPECIAL_TEXT.Hero1_Barbarian?.ko.description;
    const base = "주변의 다른 의병 한 명마다 공격력이 오릅니다. 최대 다섯 명까지 연계됩니다.";
    expect(description?.()).toBe(base);
    const run = battle("권율", stage);
    expect(description?.(run)).toBe(base);
    run.bph?.save.unlockedGenerals.push("곽재우");
    run.gold = bphHireSlots(run)[0].price;
    hireBphGeneral(run, 0);
    expect(run.squads[1]?.general).toBe("곽재우");
    expect(description?.(run)).toBe(`주변의 다른 의병 한 명마다 공격력이 오릅니다. 최대 ${capWord} 명까지 연계됩니다.`);
  });
  test(`곽재우 increases only the militia momentum cap by ${stage} at special stage ${stage}`, () => {
    for (const general of ["곽재우", "권율"] as const) {
      const run = battle(general, stage);
      const militia = spawn(run, "Hero1_Barbarian"), archer = spawn(run, "Hero1_Archer");
      const damage = bphStats(militia, run)?.damage ?? NaN;
      const archerBefore = bphStats(archer, run);
      spawn(run, "Hero1_Barbarian", 9);
      const cap = 5 + (general === "곽재우" ? stage : 0);
      expect(bphStats(militia, run)?.damage).toBeCloseTo(damage * (1 + cap * damagePerAlly), 9);
      expect(bphStats(archer, run)).toEqual(archerBefore);
    }
  });
}

test("이순신 speeds up the separate deck cannon even on a support ship", () => {
  for (const general of ["이순신", "곽재우"] as const) {
    const run = battle(general);
    const ship = spawn(run, "Hero3_Portal");
    ship.x = 100; ship.y = riverLane(); ship.gunAt = 0;
    const enemy = createRun(4).enemies[0];
    run.enemies.push({ ...enemy, id: run.nextId++, goalX: ship.x, goalY: ship.y - 60,
      x: ship.x, y: ship.y - 60, speed: 0, hp: 100, maxHp: 100 });
    advance(run, .05);
    expect(run.shots.some(shot => shot.naval && shot.source === "panokseon")).toBe(true);
    expect((ship.gunAt ?? NaN) - run.time).toBeCloseTo(general === "이순신" ? 3 / 1.10 : 3, 9);
  }
});
