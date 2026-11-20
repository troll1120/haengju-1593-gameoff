import { expect, test } from "bun:test";
import { freshBphSave, parseBphSave } from "./bph-save";
import { activeBphEffects } from "./bph-upgrades";
import { bphUnitBaseStatBonus, bphUnitUpgradeEffects, bphUnitUpgradePrice, buyBphUnitUpgrade } from "./bph-unit-upgrades";
import { addBphProfile, bphStats } from "./bph-combat";
import { BPH_PROFILES } from "./bph-data";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { growthFor } from "./skill-growth";
import { bphMasterySideCounts } from "./bph-mastery-sides";
import { bphWallTierCap } from "./bph-smithy";
import { bphCastleUnlocks } from "./bph-castle-buildings";

test("purchases use only earned mastery and survive a save round-trip", () => {
  const save = freshBphSave();
  save.resources.mastery = 71;
  expect(buyBphUnitUpgrade(save, "Hero1_Squire", "attack")).toBe(false);
  save.discovered.push("Hero1_Squire", "Hero1_Archer");
  expect(buyBphUnitUpgrade(save, "Hero1_Squire", "attack")).toBe(true);
  expect(buyBphUnitUpgrade(save, "Hero1_Squire", "attack")).toBe(true);
  expect(buyBphUnitUpgrade(save, "Hero1_Archer", "health")).toBe(false);
  expect(buyBphUnitUpgrade(save, "Hero1_Archer", "special")).toBe(true);
  expect(buyBphUnitUpgrade(save, "Hero1_Squire", "health")).toBe(false);
  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
  expect(restored.resources.mastery).toBe(0);
  expect(restored.coins).toBe(3);
  expect(restored.unitUpgrades).toEqual({ Hero1_Squire: { attack: 2 }, Hero1_Archer: { special: 1 } });
  const effects = bphUnitUpgradeEffects(restored);
  expect(effects).toMatchObject([
    { type: "HeroProjectileCount", value: 1, targets: { targetHero: "Hero1_Archer" } },
  ]);
  for (const effect of effects) expect(effect.targets.placementId).toBeUndefined();
  const active = activeBphEffects(restored);
  expect(bphMasterySideCounts(active)).toEqual(bphMasterySideCounts([]));
  expect(bphWallTierCap(active)).toBe(bphWallTierCap([]));
  expect(bphCastleUnlocks(active)).toEqual(bphCastleUnlocks([]));
});

test("zero stages emit no effects and invalid saved slots cannot produce an effect", () => {
  const save = freshBphSave();
  const { unitUpgrades: _omitted, ...legacy } = save;
  expect(parseBphSave(legacy).unitUpgrades).toEqual({});
  save.unitUpgrades.Hero1_Squire = { attack: 0, health: 0, attackSpeed: 0, special: 0 };
  expect(activeBphEffects(save)).toEqual([]);
  const restored = parseBphSave({ ...save, unitUpgrades: {
    Hero1_Squire: { attack: 6, health: 2, attackSpeed: -1, special: 1.5 },
    Hero1_Archer: { health: 2 }, Hero9_Supernova: { attack: 3 },
    Hero2_Pyromancer: { special: 2 },
  } });
  expect(restored.unitUpgrades).toEqual({ Hero1_Squire: { attack: 6, health: 2 }, Hero2_Pyromancer: { special: 2 } });
  expect(bphUnitUpgradePrice(restored, "Hero2_Pyromancer", "special")).toBeUndefined();
});

test("base tracks start at five times the unit price, grow 4% a stage, buy stage six and saturate safely", () => {
  const save = freshBphSave();
  const id = "Hero1_Squire";
  save.discovered.push(id);
  save.resources.mastery = 165;
  for (const price of [25, 26, 27, 28, 29, 30]) {
    expect(bphUnitUpgradePrice(save, id, "attack")).toBe(price);
    expect(buyBphUnitUpgrade(save, id, "attack")).toBe(true);
  }
  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
  expect(restored.resources.mastery).toBe(0);
  expect(restored.unitUpgrades[id].attack).toBe(6);
  expect(1 + bphUnitBaseStatBonus(restored.unitUpgrades[id], "attack")).toBeCloseTo(1.54);
  restored.unitUpgrades[id].attack = 1000;
  expect(bphUnitUpgradePrice(restored, id, "attack")).toBe(200);
  expect(growthFor("권율", { level: 1, squads: [], bph: { upgrades: activeBphEffects(restored) } }))
    .toMatchObject({ purchases: 1000, level: 20, tier: 3 });
});

test("codex stats add only their base amounts alongside other combat boosts", () => {
  const id = "Hero2_Knight", p = BPH_PROFILES[id];
  function stats(stage: number) {
    const meta = freshMeta(), save = meta.bph = freshBphSave(51);
    save.unitUpgrades[id] = { health: stage, attack: stage, attackSpeed: stage };
    const effects = ["HeroAttackPower", "HeroDuration", "HeroAttackSpeed"].map(type => ({
      nodeId: type, type, value: .5, effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0, targets: {},
    }));
    const run = createBphRun(meta, { seed: 1593, general: "황진", upgrades: [...activeBphEffects(save), ...effects] });
    run.bph!.smithy = { levels: { [p.classId]: 2 }, wall: 0 };
    addBphProfile(run, { profileId: id, copies: 1, foil: false, discovered: false }, { packId: "Pack2_Advanced" });
    const troop = run.squads[0].soldiers.at(-1)!;
    return { ...bphStats(troop, run)!, spawnedHp: troop.maxHp };
  }
  const before = stats(0), after = stats(6);
  expect(before.damage).toBeGreaterThan(p.damage);
  expect(before.hp).toBeGreaterThan(p.hp);
  expect(1 / before.cooldown).toBeGreaterThan(1 / p.cooldown);
  expect(after.damage - before.damage).toBeCloseTo(p.damage * .54);
  expect(after.hp - before.hp).toBeCloseTo(p.hp * .96);
  expect(after.spawnedHp).toBeCloseTo(after.hp);
  expect(1 / after.cooldown - 1 / before.cooldown).toBeCloseTo(.54 / p.cooldown);
});
