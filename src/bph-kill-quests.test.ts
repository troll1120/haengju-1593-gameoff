import { expect, test } from "bun:test";
import type { BphSave } from "./bph-contract";
import { bphFxContext } from "./bph-fx-dispatch";
import { BPH_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";
import { freshBphSave, parseBphSave } from "./bph-save";
import { createBphRun } from "./bph-session";
import { bphSurvivalPlan, bphSurvivalProfiles } from "./bph-survival";
import { BPH_SURVIVAL_CHAPTERS } from "./bph-survival-data";
import { BPH_DEFAULT_GRID } from "./bph-upgrade-data";
import { BPH_PLACEMENTS, bphNodeBlockers, buyBphNode, canBuyBphNode, recordBphProgress } from "./bph-upgrades";
import { freshMeta } from "./meta";
import { advance, createRun } from "./rules";
import type { Run } from "./rules";

const SHORT = "퀘스트 진행 부족", GONE = "이후 전투에 대상 적 없음";
function placement(nodeId: string): string {
  const found = [...BPH_PLACEMENTS.values()].find(p => p.gridId === BPH_DEFAULT_GRID && p.nodeId === nodeId);
  if (!found) throw new RangeError(nodeId);
  return found.id;
}
const GOBLIN = placement("Q_DefeatGoblin"), OGRE = placement("Q_DefeatOgre");

/** Every other placement bought, so both kill quests are connected; no progress is injected. */
function account(chapter = 0, save = freshBphSave()): BphSave {
  save.chapter = chapter;
  const others = [...BPH_PLACEMENTS.values()].filter(p =>
    p.nodeId && p.id !== GOBLIN && p.id !== OGRE && !BPH_HIDDEN_UPGRADES.has(p.nodeId));
  save.purchasedPlacements = others.map(p => p.id);
  save.purchasedNodes = [...new Set(others.flatMap(p => p.nodeId ? [p.nodeId] : []))];
  recordBphProgress(save, { kind: "chapter-entered", chapter, dimension: save.dimension });
  return save;
}
function battle(save: BphSave, seed = 144): Run {
  const meta = freshMeta();
  meta.bph = save;
  return createBphRun(meta, { seed, general: "권율", upgrades: [] });
}
/** Production damage path; the second hit lands on the corpse and must not be a second death. */
function kill(run: Run, profileId: string, count: number, boss = false): void {
  const context = bphFxContext(run);
  if (!context) throw new RangeError("missing battle context");
  const template = createRun(4).enemies[0];
  for (let i = 0; i < count; i++) {
    const enemy = { ...template, id: run.nextId++, kind: "yari" as const, bphProfileId: profileId,
      boss, hp: 1, maxHp: 1, shielded: false };
    run.enemies.push(enemy);
    context.applyDamage({ target: enemy, amount: 2 });
    context.applyDamage({ target: enemy, amount: 2 });
  }
}

test("each Caveling death advances Caveling Hunt once, and the 50th completes it", () => {
  const save = account(), run = battle(save), income = save.income;
  expect(save.questActivatedAt[GOBLIN]).toBeDefined();
  expect(save.questProgress[GOBLIN]).toBe(0);
  kill(run, "Monster1_Caveling", 49);
  kill(run, "Monster1_Raider", 5);
  expect(save.questProgress[GOBLIN]).toBe(49);
  expect(bphNodeBlockers(save, GOBLIN)).toEqual([SHORT]);
  kill(run, "Monster1_Caveling", 1);
  expect(save.questProgress[GOBLIN]).toBe(50);
  expect(buyBphNode(save, GOBLIN)).toBe(true);
  expect(save.income).toBe(income + 1);
  kill(run, "Monster1_Caveling", 3);
  expect(save.questProgress[GOBLIN]).toBe(50);
  expect(buyBphNode(save, GOBLIN)).toBe(false);
});

test("killing the chapter 1 boss completes Apogre Hunt", () => {
  const [boss, ...others] = new Set(bphSurvivalPlan(BPH_SURVIVAL_CHAPTERS[0])
    .filter(spawn => spawn.boss).map(spawn => spawn.profileId));
  expect(others).toEqual([]);
  const save = account(), run = battle(save);
  kill(run, "Monster1_Caveling", 10);
  expect(save.questProgress[OGRE]).toBe(0);
  expect(canBuyBphNode(save, OGRE)).toBe(false);
  kill(run, boss, 1, true);
  expect(save.questProgress[OGRE]).toBe(1);
  expect(buyBphNode(save, OGRE)).toBe(true);
  expect(save.questProgress[`claims:${OGRE}`]).toBe(1);
});

test("counting draws no RNG and writes only its quest; spans without target deaths stay byte-identical", () => {
  const counting = account(), claimed = structuredClone(counting);
  claimed.purchasedPlacements.push(GOBLIN);
  claimed.questProgress[`claims:${GOBLIN}`] = 1;
  const a = battle(counting, 501), b = battle(claimed, 501);
  // This quest-isolation comparison supplies its own deaths; dense ambient waves are tested separately.
  for (const run of [a, b]) run.bph!.survival!.cursor = bphSurvivalPlan(run.bph!.waveId).length;
  const rest = (save: BphSave) => JSON.stringify({ ...save,
    purchasedPlacements: save.purchasedPlacements.filter(id => id !== GOBLIN),
    questProgress: Object.fromEntries(Object.entries(save.questProgress).filter(([key]) => !key.endsWith(GOBLIN))) });
  for (const run of [a, b]) {
    for (let tick = 0; tick < 90; tick++) advance(run, 1 / 30);
    kill(run, "Monster1_Raider", 4);
  }
  expect(a.kills).toBe(4);
  expect(counting.questProgress[GOBLIN]).toBe(0);
  expect(rest(counting)).toBe(rest(claimed));
  expect(a.rng).toBe(b.rng);
  for (const run of [a, b]) kill(run, "Monster1_Caveling", 3);
  expect(counting.questProgress[GOBLIN]).toBe(3);
  expect(claimed.questProgress[GOBLIN]).toBe(0);
  expect(rest(counting)).toBe(rest(claimed));
  expect(a.rng).toBe(b.rng);
  expect(a.kills).toBe(b.kills);
});

test("a save round-trip keeps kill progress, and later deaths continue from it", () => {
  const save = account();
  kill(battle(save), "Monster1_Caveling", 20);
  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
  expect(restored.questProgress[GOBLIN]).toBe(20);
  kill(battle(restored, 145), "Monster1_Caveling", 30);
  expect(restored.questProgress[GOBLIN]).toBe(50);
  expect(buyBphNode(restored, GOBLIN)).toBe(true);
});

const C1_BOSS = bphSurvivalPlan(BPH_SURVIVAL_CHAPTERS[0]).find(spawn => spawn.boss)!.profileId;

test("every profiled death adds once to the lifetime tally, which survives a save round-trip", () => {
  const save = freshBphSave(), run = battle(save);
  expect(save.questActivatedAt[GOBLIN]).toBeUndefined();
  kill(run, "Monster1_Caveling", 3);
  kill(run, "Monster1_Raider", 2);
  kill(run, C1_BOSS, 1, true);
  expect(save.killTally).toEqual({ Monster1_Caveling: 3, Monster1_Raider: 2, [C1_BOSS]: 1 });
  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
  expect(restored.killTally).toEqual(save.killTally);
  kill(battle(restored, 145), "Monster1_Caveling", 4);
  expect(restored.killTally?.Monster1_Caveling).toBe(7);
});

test("kills before activation seed kill quests: 897 Cavelings complete Caveling Hunt, the C1 boss completes Apogre Hunt", () => {
  const save = freshBphSave(), run = battle(save);
  kill(run, "Monster1_Caveling", 897);
  kill(run, C1_BOSS, 1, true);
  expect(save.questProgress[GOBLIN]).toBeUndefined();
  account(1, save);
  expect(save.questProgress[GOBLIN]).toBe(50);
  expect(save.questProgress[OGRE]).toBe(1);
  expect(bphNodeBlockers(save, GOBLIN)).toEqual([]);
  expect(buyBphNode(save, GOBLIN)).toBe(true);
  expect(buyBphNode(save, OGRE)).toBe(true);
  expect(save.killTally?.Monster1_Caveling).toBe(897);
});

test("a partial tally seeds progress once and later kills keep adding", () => {
  const save = freshBphSave();
  kill(battle(save), "Monster1_Caveling", 20);
  account(0, save);
  expect(save.questProgress[GOBLIN]).toBe(20);
  kill(battle(save, 145), "Monster1_Caveling", 29);
  expect(save.questProgress[GOBLIN]).toBe(49);
  expect(save.killTally?.Monster1_Caveling).toBe(49);
  kill(battle(save, 146), "Monster1_Caveling", 1);
  expect(buyBphNode(save, GOBLIN)).toBe(true);
});

test("no-kill saves keep their old bytes and the tally draws no RNG", () => {
  const fresh = freshBphSave();
  expect("killTally" in fresh).toBe(false);
  expect("killTally" in parseBphSave(JSON.parse(JSON.stringify(fresh)))).toBe(false);
  const plain = account(), tallied = structuredClone(plain);
  tallied.killTally = { Monster1_Caveling: 897, Monster1_Raider: 40 };
  const a = battle(plain, 501), b = battle(tallied, 501);
  for (const run of [a, b]) {
    for (let tick = 0; tick < 90; tick++) advance(run, 1 / 30);
    kill(run, "Monster1_Raider", 4);
  }
  expect(a.rng).toBe(b.rng);
  expect(a.kills).toBe(b.kills);
  const { killTally: left, ...restA } = plain, { killTally: right, ...restB } = tallied;
  expect(JSON.stringify(restA)).toBe(JSON.stringify(restB));
  expect(right!.Monster1_Raider - (left?.Monster1_Raider ?? 0)).toBe(40);
});

test("an old save without a tally loads with none and its frozen kill quests keep the honest reason", () => {
  const old = JSON.parse(JSON.stringify(account(1)));
  delete old.killTally;
  const save = parseBphSave(old);
  expect(save.killTally).toBeUndefined();
  expect(save.questProgress[GOBLIN]).toBe(0);
  expect(bphNodeBlockers(save, GOBLIN)).toEqual([SHORT, GONE]);
  // Since the 15:00 contract (ba634d8) Boss1_Apogre is a commander any chapter can field, so the ogre quest stays live.
  expect(bphNodeBlockers(save, OGRE)).toEqual([SHORT]);
});

test("after chapter 1 is cleared its kill quests say no later battle fields the target", () => {
  for (const chapter of [1, 3, 9]) {
    expect(bphNodeBlockers(account(chapter), GOBLIN)).toEqual([SHORT, GONE]);
    expect(bphNodeBlockers(account(chapter), OGRE)).toEqual([SHORT]);
  }
  expect(bphSurvivalProfiles(BPH_SURVIVAL_CHAPTERS[2]).has("Boss3_Witch2")).toBe(true);
  const done = account();
  kill(battle(done), "Monster1_Caveling", 50);
  done.chapter = 1;
  expect(bphNodeBlockers(done, GOBLIN)).toEqual([]);
  expect(buyBphNode(done, GOBLIN)).toBe(true);
});
