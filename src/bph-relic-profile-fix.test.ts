import { expect, test } from "bun:test";
import type { BphEffect, BphFxContext } from "./bph-contract";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import { bphStats } from "./bph-combat";
import { bindBphConsumers, bphFxContext, dispatchBphEffects } from "./bph-fx-dispatch";
import { BPH_PROFILE_CONSUMERS } from "./bph-fx-profiles";
import { BPH_STATUS_CONSUMERS } from "./bph-fx-status";
import { activeBphEffects, BPH_UPGRADE_NODES } from "./bph-upgrades";
import { equipBphRelic, grantBphRelic } from "./bph-account";
import { createBphRun } from "./bph-session";
import { freshBphSave } from "./bph-save";
import { freshMeta } from "./meta";
import { bphEffectCombat, createRun } from "./rules";
import type { Unit } from "./rules";

function fixture(relic: string | readonly string[] | null, rolls: number[] = []) {
  const meta = freshMeta();
  meta.bph = freshBphSave();
  meta.bph.discovered = Object.keys(BPH_PROFILES);
  meta.bph.codexRewards = {
    version: 1, claimed: meta.bph.discovered.map(id => `discovery:${id}`), pendingGold: 0,
  };
  const run = createBphRun(meta, { seed: 1593, general: "권율", upgrades: [] });
  const native = bphFxContext(run);
  if (!native || !run.bph) throw new Error("Missing production battle context");
  const effects: readonly BphEffect[] = relic
    ? (typeof relic === "string" ? [relic] : relic).flatMap(id => {
      const save = freshBphSave();
      expect(grantBphRelic(save, id)).toBe(true);
      expect(equipBphRelic(save, id)).toBe(true);
      return activeBphEffects(save);
    }) : [];
  const context: BphFxContext = {
    ...native, effects, ...bphEffectCombat(run, run.bph.fxEvents),
    random: () => rolls.shift() ?? 0.99,
    chance: value => Math.max(0, Math.min(1, value)),
  };
  bindBphConsumers(context, [...BPH_STATUS_CONSUMERS, ...BPH_PROFILE_CONSUMERS]);
  run.enemies = [];
  function spawn(id: string, packId = "Pack1_Basic") {
    context.spawnProfile(id, 1, { packId, position: { x: 300, y: 300 } });
    return run.squads[0].soldiers.at(-1)!;
  }
  function enemy(x = 310, y = 300) {
    const seed = createRun(4).enemies[0];
    if (!seed) throw new Error("Missing enemy fixture");
    const target = { ...seed, id: run.nextId++, x, y, hp: 100, maxHp: 100, shielded: false, stun: 0 };
    run.enemies.push(target);
    return target;
  }
  function death(unit: Unit) {
    unit.hp = 0;
    dispatchBphEffects(run, { kind: "unit-death", unit, killer: null });
  }
  function attack(unit: Unit) {
    const target = enemy();
    const stats = bphStats(unit, run);
    if (!stats) throw new Error("Missing production stats");
    context.applyDamage({ target, source: unit, amount: stats.damage });
    return 100 - target.hp;
  }
  return { run, context, spawn, enemy, death, attack, rolls };
}

test.each([
  ["Relic1_CharmArcanist", "4", "0", "monk", undefined],
  ["Relic1_CharmMystic", "5", "0", "monk", undefined],
  ["Relic1_CharmOutcast", "6", "0", "militia", undefined],
  ["Relic1_CharmWarrior", "1", "0", "spearman", undefined],
  ["Relic_HuntersAreOutcast", "3", "6", "archer", "militia"],
  ["R_ArcanistTomePower", "4", "0", "monk", undefined],
  ["R_CharmHunter", "6", "0", "militia", undefined],
  ["R_HunterPeriodicInvisibility", "3", "0", "archer", undefined],
  ["R_MysticSpawnFortify", "5", "5", "spearman", "spearman"],
  ["R_WarriorAliveGiant", "1", "0", "spearman", undefined],
  ["Relic_ArcanistsAreHunters", "4", "3", "monk", "archer"],
  ["Relic_MilitiaAreMystics", "1", "5", "spearman", "monk"],
  ["Relic_MysticsAreArcanists", "5", "4", "hwacha", "monk"],
  ["Relic_OutcastsAreMilitia", "6", "1", "militia", "spearman"],
  ["R_HunterArrowBounce - Demo", "3", "0", "archer", undefined],
  ["R_WarriorsSpawnFortify - Demo", "5", "5", "monk", "monk"],
] as const)("%s remaps every equipped runtime row without changing generated targets", (id, legacy, secondLegacy, first, second) => {
  const save = freshBphSave();
  const raw = BPH_UPGRADE_NODES[id].effects;
  const before = structuredClone(raw);
  expect(grantBphRelic(save, id)).toBe(true);
  expect(activeBphEffects(save).filter(effect => effect.nodeId === id)).toEqual([]);
  expect(equipBphRelic(save, id)).toBe(true);
  const equipped = activeBphEffects(save).filter(effect => effect.nodeId === id);
  expect(equipped.map(effect => effect.type)).toEqual(raw.map(effect => effect.type));
  for (const { targets } of equipped) {
    expect(targets.targetHaengjuClass).toBe(first);
    if (second) expect(targets.secondTargetHaengjuClass).toBe(second);
    else expect(targets).not.toHaveProperty("secondTargetHaengjuClass");
    expect(targets).not.toHaveProperty("targetClass");
    expect(targets).not.toHaveProperty("secondTargetClass");
  }
  expect(raw).toEqual(before);
  for (const { targets } of raw) {
    expect(targets.targetClass).toBe(legacy);
    expect(targets.secondTargetClass).toBe(secondLegacy);
    expect(targets).not.toHaveProperty("targetHaengjuClass");
    expect(targets).not.toHaveProperty("secondTargetHaengjuClass");
  }
});

test("Coin Purse pays actual coins only for militia deaths and lowers the threshold per award", () => {
  const f = fixture("Relic1_CharmOutcast", [0.5, 0.49, 0.35, 0.34, 0.2, 0.19, 0.05, 0.04, 0]);
  const start = { coins: f.context.save.coins, gold: f.run.gold, earned: f.run.earned };
  f.death(f.spawn("Hero1_Squire"));
  f.death(f.spawn("Hero7_Warlord", "Pack7_Arctic"));
  expect(f.rolls).toHaveLength(9);
  const balances: number[] = [];
  for (let n = 0; n < 9; n++) {
    const unit = f.spawn("Hero1_Barbarian");
    f.death(unit);
    const after = f.context.save.coins;
    f.death(unit);
    expect(f.context.save.coins).toBe(after);
    balances.push(after - start.coins);
  }
  expect(balances).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  expect(f.run.gold - start.gold).toBe(4);
  expect(f.run.earned - start.earned).toBe(4);
  expect(f.context.state.counters["profiles:coins"]).toBe(4);
  const plain = fixture(null);
  plain.death(plain.spawn("Hero1_Barbarian"));
  expect(plain.context.save.coins).toBe(start.coins);
});

test("Changeling Mask adds its authored damage before, during, and after transformation", () => {
  const f = fixture("R_HeroSpawnTransformAllHeroes", [0.99, 0, 0.99]);
  const plain = fixture(null);
  const unit = f.spawn("Hero1_Squire");
  const normal = plain.spawn("Hero1_Squire");
  expect(f.attack(unit)).toBeCloseTo(plain.attack(normal) * 1.3300000131130219);
  f.spawn("Hero1_Barbarian");
  expect(unit.bph?.profileId).toBe("Hero1_Barbarian");
  expect(f.attack(unit)).toBeCloseTo(BPH_PROFILES.Hero1_Barbarian.damage * 1.3300000131130219);
  f.run.time = 10;
  dispatchBphEffects(f.run, { kind: "step", dt: 0 });
  expect(unit.bph?.profileId).toBe("Hero1_Squire");
  expect(f.attack(unit)).toBeCloseTo(plain.attack(normal) * 1.3300000131130219);
});

test("Electric Guitar shocks all nearby enemies only on successful epic attack rolls", () => {
  const f = fixture("R_EpicAttacksEletrify_Demo", [0.09]);
  const epic = Object.values(BPH_PROFILES).find(p => p.rarity === 2 && Number(p.raw.heroClass) === 1)!;
  const unit = f.spawn(epic.id);
  const close = f.enemy(300 + BPH_WORLD_TO_PX * 0.9);
  const chained = f.enemy(300 + BPH_WORLD_TO_PX * 0.95);
  const distant = f.enemy(300 + BPH_WORLD_TO_PX * 4);
  dispatchBphEffects(f.run, { kind: "after-attack", unit, target: close });
  expect(close.hp).toBe(98);
  expect(chained.hp).toBe(98);
  expect(close.stun).toBeCloseTo(0.4);
  expect(distant.hp).toBe(100);
  const miss = fixture("R_EpicAttacksEletrify_Demo", [0.10000000149011612]);
  const missed = miss.enemy();
  dispatchBphEffects(miss.run, { kind: "after-attack", unit: miss.spawn(epic.id), target: missed });
  expect(missed.hp).toBe(100);
  const common = fixture("R_EpicAttacksEletrify_Demo", [0]);
  const untouched = common.enemy();
  dispatchBphEffects(common.run, { kind: "after-attack", unit: common.spawn("Hero1_Squire"), target: untouched });
  expect(untouched.hp).toBe(100);
  expect(common.rolls).toEqual([0]);
});

test("Electric Guitar uses the shared extra-chain effect to reach outside its own radius", () => {
  const f = fixture(["R_EpicAttacksEletrify_Demo", "R_ShockNeedle"], [0]);
  const epic = Object.values(BPH_PROFILES).find(p => p.rarity === 2 && Number(p.raw.heroClass) === 1)!;
  const unit = f.spawn(epic.id);
  const close = f.enemy(300 + BPH_WORLD_TO_PX * 0.9);
  const chained = f.enemy(300 + BPH_WORLD_TO_PX * 1.1);
  const distant = f.enemy(300 + BPH_WORLD_TO_PX * 4);
  dispatchBphEffects(f.run, { kind: "after-attack", unit, target: close });
  expect(close.hp).toBe(98);
  expect(chained.hp).toBe(98);
  expect(distant.hp).toBe(100);
});
