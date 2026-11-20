import { expect, test } from "bun:test";
import { equipBphRelic, grantBphMastery, grantBphRelic, notifyBphQuestCompletion } from "./bph-account";
import { bphStats, hitBphPack } from "./bph-combat";
import type { BphEffect, BphSpawnOrigin } from "./bph-contract";
import { BPH_PACKS, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { bindBphConsumers, bphFxContext, bphTapStrike, dispatchBphEffects } from "./bph-fx-dispatch";
import { collectBphTemple } from "./bph-fx-buildings";
import { BPH_CASTLE_UNLOCK_PLACEMENTS } from "./bph-castle-buildings";
import { fireMartialArrow } from "./bph-native-projectiles";
import { martialTauntTarget } from "./bph-native-martial-warlord";
import { freshBphSave } from "./bph-save";
import { createBphRun } from "./bph-session";
import { buyBphRecruit } from "./bph-recruit";
import { createBphShop } from "./bph-shop";
import { BPH_TAP_STRIKE } from "./bph-tap-strike";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { bphDrawPool } from "./bph-tome-availability";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { activeBphEffects } from "./bph-upgrades";
import { freshMeta } from "./meta";
import { advance, createRun } from "./rules";
import type { Enemy, Unit } from "./rules";

// The only relic input is the production account grant/equip path. Extra effects
// are explicit prerequisites (a building, class upgrade, or mastery bonus), never
// substitutes for the relic under test.
function effect(type: string, value: number, targets: Record<string, string> = {}): BphEffect {
  return { nodeId: `test:${type}`, type, value, targets, effectPower: 0,
    effectPowerScale: 0, stackCap: 0, countStep: 0 };
}
function fixture(id: string, worn: boolean, extras: readonly BphEffect[] = [], roll = 0) {
  const save = freshBphSave(1593), meta = freshMeta();
  expect(grantBphRelic(save, id)).toBe(true);
  if (worn) expect(equipBphRelic(save, id)).toBe(true);
  meta.bph = save;
  const run = createBphRun(meta, { seed: 1593, general: "권율",
    upgrades: [...activeBphEffects(save), ...extras] });
  const native = bphFxContext(run);
  if (!native || !run.bph) throw new Error("Missing production battle context");
  const ctx = { ...native, random: () => roll };
  bindBphConsumers(ctx, undefined, false);
  run.phase = "playing";
  run.enemies = [];
  return { run, save, ctx, worn };
}
type Fixture = ReturnType<typeof fixture>;
function spawn(f: Fixture, id = "Hero1_Squire", origin: Partial<BphSpawnOrigin> = {}) {
  const index = f.run.squads[0].soldiers.length;
  f.ctx.spawnProfile(id, 1, { packId: "Pack1_Basic", cause: "pack",
    position: { x: 100, y: 200 }, ...origin });
  const unit = f.run.squads[0].soldiers[index];
  if (!unit) throw new Error(`No actual soldier spawned for ${id}`);
  return unit;
}
const recruits = {
  archer: ["Hero1_Archer", "Pack1_Basic"],
  militia: ["Hero1_Barbarian", "Pack1_Basic"],
  spearman: ["Hero1_Squire", "Pack1_Basic"],
  monk: ["Hero5_Beastmaster", "Pack6_Forest"],
  hwacha: ["Hero2_Pyromancer", "Pack2_Advanced"],
  chongtong: ["Hero6_Shotgun", "Pack5_Skeleton"],
  cavalry: ["Hero7_Warlord", "Pack7_Arctic"],
  panokseon: ["Hero7_AstralFisher", "Pack7_Arctic"],
} as const;
type Recruit = keyof typeof recruits;
function recruit(f: Fixture, kind: Recruit) {
  const [id, packId] = recruits[kind];
  expect(bphDrawPool(BPH_PACKS[packId]).some(card => card.id === id && card.weight > 0)).toBe(true);
  return spawn(f, id, { packId });
}
function enemy(f: Fixture, x = 100, y = 200): Enemy {
  const original = createRun(4).enemies[0];
  const target = { ...original, id: f.run.nextId++, x, y, hp: 1000, maxHp: 1000,
    kind: "yari" as const, shielded: false, boss: false, stun: 0, speed: 0, burn: 0 };
  f.run.enemies.push(target);
  return target;
}
function step(f: Fixture, dt: number) {
  f.run.time += dt;
  dispatchBphEffects(f.run, { kind: "step", dt });
}
function stats(f: Fixture, unit: Unit) {
  const value = bphStats(unit, f.run);
  if (!value) throw new Error("Missing native unit stats");
  return value;
}
function kill(f: Fixture, unit: Unit) {
  f.ctx.applyUnitDamage({ target: unit, amount: unit.maxHp * 10 });
}
function volley(f: Fixture, point = { x: 100, y: 200 }) {
  dispatchBphEffects(f.run, { kind: "tap", position: point });
  step(f, BPH_TAP_STRIKE.travelSeconds);
}
function open(f: Fixture, packId = "Pack1_Basic") {
  f.ctx.grantPack(packId, 1);
  const instance = f.save.inventory.at(-1);
  if (!instance) throw new Error("Native pack grant failed");
  let result = hitBphPack(f.run, instance.id);
  if (!result.length) result = hitBphPack(f.run, instance.id);
  expect(result.length).toBeGreaterThan(0);
  return result;
}
function strike(f: Fixture, unit: Unit, target: Enemy) {
  const attack = { multiplier: 1, extraProjectiles: 0, bounces: 0, handled: false };
  dispatchBphEffects(f.run, { kind: "before-attack", unit, target, attack });
  f.ctx.applyDamage({ target, source: unit, amount: stats(f, unit).damage * attack.multiplier });
  dispatchBphEffects(f.run, { kind: "after-attack", unit, target });
}
function enemyAcquires(f: Fixture, unit: Unit) {
  // Enemy acquisition, rather than damage immunity: an already-launched hit
  // can still hit an invisible soldier.
  const source = enemy(f, unit.x + 20, unit.y);
  source.kind = "teppo";
  source.clock = 1000;
  source.strikeAt = 0;
  source.prey = null;
  const squad = f.run.squads[0];
  squad.x = squad.y = -1000;
  unit.emerging = false;
  unit.clock = 1000;
  advance(f.run, 0.01);
  const prey = f.run.enemies.find(target => target.id === source.id)?.prey;
  return prey?.[0] === squad.id && prey?.[1] === squad.soldiers.indexOf(unit);
}

type Check = (f: Fixture) => void;
const checks: Record<string, Check> = {
  _REMOVERelic1_Flail: f => {
    const target = enemy(f, 100 + BPH_TAP_STRIKE.radius * 1.25);
    volley(f);
    expect(target.hp).toBe(f.worn ? 1000 - BPH_TAP_STRIKE.damage : 1000);
  },
  Relic1_CharmArcanist: f => {
    const target = enemy(f);
    recruit(f, "hwacha");
    expect(f.ctx.state.counters["status:tome-serial"] ?? 0).toBe(0);
    // Earthquake is executable and belongs to this source pack; the third
    // monk must not add another activation.
    for (let n = 0; n < 3; n++) recruit(f, "monk");
    expect(f.ctx.state.counters["status:tome-serial"] ?? 0).toBe(f.worn ? 2 : 0);
    dispatchBphEffects(f.run, { kind: "aim", position: target });
    step(f, 2);
    expect(target.hp < 1000).toBe(f.worn);
  },
  Relic1_CharmMystic: f => {
    const units = [recruit(f, "panokseon"), ...Array.from({ length: 3 }, () => recruit(f, "monk"))];
    for (const unit of units) kill(f, unit);
    step(f, 0);
    expect(units.map(unit => unit.hp)).toEqual([0,
      f.worn ? units[1].maxHp / 2 : 0, f.worn ? units[2].maxHp / 2 : 0, 0]);
    for (const unit of units.filter(unit => unit.hp > 0)) kill(f, unit);
    step(f, 0);
    expect(units.every(unit => unit.hp <= 0)).toBe(true);
  },
  Relic1_CharmOutcast: f => {
    const cavalry = recruit(f, "cavalry"), militia = recruit(f, "militia");
    const before = f.run.gold;
    kill(f, cavalry);
    expect(f.run.gold).toBe(before);
    kill(f, militia);
    expect(f.run.gold - before).toBe(f.worn ? 1 : 0);
  },
  Relic1_CharmWarrior: f => {
    recruit(f, "militia");
    for (let n = 0; n < 3; n++) recruit(f, "spearman");
    const alive = f.run.squads[0].soldiers.filter(unit => unit.hp > 0);
    expect(alive.map(unit => unit.bph?.profileId)).toEqual([
      "Hero1_Barbarian", ...Array<string>(f.worn ? 5 : 3).fill("Hero1_Squire"),
    ]);
  },
  Relic1_Club: f => {
    const target = enemy(f);
    for (let n = 0; n < 3; n++) volley(f);
    expect(target.hp).toBe(1000 - BPH_TAP_STRIKE.damage * (f.worn ? 4 : 3));
    expect(target.stun).toBeCloseTo(f.worn ? 0.8 : 0.08, 6);
  },
  Relic1_FourLeafClover: f => {
    // A 12% roll misses the native 10% giant chance until the clover
    // multiplies it. The outcome is measured as real giant attack damage.
    const unit = spawn(f), target = enemy(f);
    strike(f, unit, target);
    expect(1000 - target.hp).toBeCloseTo(BPH_PROFILES.Hero1_Squire.damage * (f.worn ? 1.4 : 1), 6);
  },
  Relic1_GiantsMight: f => {
    const target = enemy(f);
    strike(f, spawn(f), target);
    expect(1000 - target.hp).toBeCloseTo(BPH_PROFILES.Hero1_Squire.damage * (f.worn ? 1.4 : 1), 6);
  },
  Relic1_Rapier: f => {
    open(f);
    volley(f);
    const remaining = BPH_TAP_STRIKE.rechargeSeconds / 1.15 - BPH_TAP_STRIKE.travelSeconds + 0.00001;
    step(f, remaining);
    expect(bphTapStrike(f.run)?.charges).toBe(BPH_TAP_STRIKE.charges - (f.worn ? 0 : 1));
  },
  Relic1_Rare: f => {
    const unit = spawn(f, "Hero1_Barbarian"), target = enemy(f);
    dispatchBphEffects(f.run, { kind: "after-attack", unit, target });
    step(f, 0);
    expect(target.hp).toBe(f.worn ? 998 : 1000);
  },
  Relic1_TomeDuration: f => {
    f.ctx.spawnProfile("Tome_RaiseDead", 1, { packId: "Pack_Tomes", cause: "pack" });
    step(f, 0);
    f.run.time = 14;
    dispatchBphEffects(f.run, { kind: "step", dt: 3 });
    expect(f.run.squads[0].soldiers.filter(unit => unit.bph?.profileId === "Hero_Skeleton"))
      .toHaveLength(f.worn ? 3 : 0);
  },
  Relic2_Nature_RingOfDuplication: f => {
    spawn(f); spawn(f);
    expect(f.run.squads[0].soldiers.filter(unit => unit.hp > 0)).toHaveLength(f.worn ? 3 : 2);
  },
  Relic2_Nature_TalkingBeet: f => {
    const first = spawn(f), second = spawn(f, "Hero1_Archer"), target = enemy(f);
    f.ctx.applyBuff({ target: first, side: "ally", id: "Charge", duration: 5, power: 100, stacks: 1 });
    strike(f, second, target);
    expect(1000 - target.hp).toBeCloseTo(BPH_PROFILES.Hero1_Archer.damage * (f.worn ? 2 : 1), 6);
  },
  R_ArcanistTomePower: f => {
    for (const kind of ["monk", "hwacha", "chongtong"] as const) {
      const unit = recruit(f, kind), target = enemy(f);
      strike(f, unit, target);
      expect(1000 - target.hp).toBeCloseTo(
        BPH_PROFILES[recruits[kind][0]].damage * (f.worn && kind === "monk" ? 1.5 : 1), 6);
    }
  },
  R_CharmHunter: f => {
    for (const kind of ["militia", "cavalry"] as const) {
      const unit = recruit(f, kind), victim = enemy(f), target = enemy(f);
      f.ctx.applyDamage({ target: victim, source: unit, amount: 2000 });
      strike(f, unit, target);
      expect(1000 - target.hp).toBeCloseTo(
        BPH_PROFILES[recruits[kind][0]].damage * (f.worn && kind === "militia" ? 2 : 1), 6);
    }
  },
  R_Epic: f => {
    const unit = spawn(f, "Hero1_Archer");
    expect(unit.bph?.giant).toBe(f.worn);
    const target = enemy(f);
    strike(f, unit, target);
    expect(1000 - target.hp).toBeCloseTo(BPH_PROFILES.Hero1_Archer.damage * (f.worn ? 1.4 : 1), 6);
  },
  R_HeroMoveSpeed: f => {
    expect(stats(f, spawn(f)).moveSpeed)
      .toBeCloseTo(BPH_PROFILES.Hero1_Squire.moveSpeed * (f.worn ? 1.3 : 1), 6);
  },
  R_HeroSpawnTransformAllHeroes: f => {
    const first = spawn(f), before = stats(f, first).damage;
    spawn(f, "Hero1_Barbarian");
    expect(stats(f, first).damage).toBeCloseTo(f.worn ? BPH_PROFILES.Hero1_Barbarian.damage * 1.33 : before, 6);
    step(f, 10.01);
    expect(stats(f, first).damage).toBeCloseTo(BPH_PROFILES.Hero1_Squire.damage * (f.worn ? 1.33 : 1), 6);
  },
  R_HunterPeriodicInvisibility: f => {
    expect(f.ctx.state.counters["status:unconfirmed:HeroPeriodicApplyStatus"]).toBeUndefined();
    const unit = recruit(f, "archer"), sibling = recruit(f, "chongtong");
    step(f, 15);
    expect(stats(f, unit).cooldown).toBeCloseTo(BPH_PROFILES.Hero1_Archer.cooldown / (f.worn ? 2 : 1), 6);
    expect(stats(f, sibling).cooldown).toBeCloseTo(BPH_PROFILES.Hero6_Shotgun.cooldown, 6);
    // Leave only the archer available for the enemy acquisition assertion.
    kill(f, sibling);
    expect(enemyAcquires(f, unit)).toBe(!f.worn);
    step(f, 5.01);
    expect(enemyAcquires(f, unit)).toBe(true);
  },
  R_MysticSpawnFortify: f => {
    const sibling = recruit(f, "panokseon"), unit = recruit(f, "spearman");
    for (const target of [unit, sibling, recruit(f, "monk")]) {
      const hp = target.hp, blocked = f.worn && target === unit ? 1 : 0;
      f.ctx.applyUnitDamage({ target, amount: 1 });
      expect(target.hp).toBe(hp - 1 + blocked);
      f.ctx.applyUnitDamage({ target, amount: 1 });
      expect(target.hp).toBe(hp - 2 + blocked);
    }
  },
  R_QuestCompleteCoin: f => {
    const before = f.run.gold;
    f.save.questProgress["claims:test:relic"] = 1;
    expect(notifyBphQuestCompletion(f.save, "test:relic")).toBe(true);
    expect(f.run.gold - before).toBe(f.worn ? 1 : 0);
    expect(notifyBphQuestCompletion(f.save, "test:relic")).toBe(false);
  },
  R_WarriorAliveGiant: f => {
    const unit = recruit(f, "spearman"), sibling = recruit(f, "militia");
    unit.hp = sibling.hp = 1;
    step(f, 15);
    expect(unit.hp).toBe(f.worn ? unit.maxHp : 1);
    expect(unit.bph?.giant).toBe(f.worn);
    expect(sibling.hp).toBe(1);
    expect(sibling.bph?.giant).toBe(false);
  },
  Relic4_Arctic_FrozenMace: f => {
    const target = enemy(f);
    for (let n = 0; n < 12; n++) {
      volley(f);
      if (n < 11) step(f, BPH_TAP_STRIKE.rechargeSeconds);
    }
    expect(target.stun).toBeGreaterThan(f.worn ? 1 : 0);
    if (!f.worn) expect(target.stun).toBeCloseTo(0.08, 6);
  },
  _REMOVERelic3_Cursed_Lantern: f => {
    open(f);
    expect(f.run.squads[0].soldiers.filter(unit => unit.bph?.profileId === "Hero1_Squire" && unit.hp > 0))
      .toHaveLength(f.worn ? 0 : 1);
    expect(f.run.squads[0].soldiers.filter(unit => unit.bph?.profileId === "Hero_Skeleton" && unit.hp > 0))
      .toHaveLength(f.worn ? 1 : 0);
  },
  R_EpicAttacksEletrify_Demo: f => {
    const unit = spawn(f, "Hero1_Archer");
    const target = enemy(f, 110);
    dispatchBphEffects(f.run, { kind: "after-attack", unit, target });
    step(f, 0);
    expect(target.hp).toBeLessThanOrEqual(f.worn ? 998 : 1000);
    if (!f.worn) expect(target.hp).toBe(1000);
  },
  R_AutomaticBallista: f => {
    expect(f.run.maxBase).toBe(BPH_SURVIVAL_TABLE.keepHp * (f.worn ? 2 : 1));
    const target = enemy(f);
    dispatchBphEffects(f.run, { kind: "towerAttacked", attacker: target,
      position: { x: 100, y: 200 }, amount: 1, hpLost: 1 });
    step(f, BPH_TAP_STRIKE.travelSeconds);
    expect(target.hp).toBe(f.worn ? 999 : 1000);
  },
  R_EchoingBones: f => {
    step(f, 3);
    expect(f.run.squads[0].soldiers.filter(unit => unit.bph?.profileId === "Hero_Skeleton"))
      .toHaveLength(f.worn ? 6 : 0);
  },
  R_FirstPackPortal: f => {
    open(f);
    expect(f.run.squads[0].soldiers.filter(unit => unit.bph?.profileId === "Hero3_Portal"))
      .toHaveLength(f.worn ? 1 : 0);
    expect(f.run.squads[0].soldiers.filter(unit => unit.bph?.profileId === "Hero1_Squire"))
      .toHaveLength(f.worn ? 0 : 1);
  },
  R_ShockNeedle: f => {
    const target = enemy(f), outside = enemy(f, 100 + BPH_TAP_STRIKE.radius + 10);
    // The second enemy is outside the volley, within one electrify jump.
    volley(f);
    expect(target.hp).toBe(1000 - BPH_TAP_STRIKE.damage - (f.worn ? 2 : 0));
    expect(outside.hp).toBe(f.worn ? 998 : 1000);
  },
  R_SunstrideBoots: f => {
    const unit = spawn(f), target = enemy(f);
    step(f, 0);
    for (let n = 0; n < 10; n++) { unit.x = n % 2 ? 100 : 300; step(f, 0.1); }
    expect(target.hp).toBe(f.worn ? 999 : 1000);
  },
  Relic3_Cursed_RitualDagger: f => {
    kill(f, spawn(f));
    const target = enemy(f);
    volley(f);
    expect(1000 - target.hp).toBeCloseTo(BPH_TAP_STRIKE.damage * (f.worn ? 1.1 : 1), 6);
  },
  Relic2_Nature_LifeStaff: f => {
    spawn(f); spawn(f);
    const target = enemy(f);
    volley(f);
    expect(1000 - target.hp).toBeCloseTo(BPH_TAP_STRIKE.damage * (f.worn ? 1.1 : 1), 6);
  },
  "R_HunterArrowBounce - Demo": f => {
    for (const kind of ["archer", "chongtong"] as const) {
      f.run.enemies = [];
      const unit = recruit(f, kind), first = enemy(f, 180), second = enemy(f, 180, 260);
      const attack = { multiplier: 1, extraProjectiles: 0, bounces: 0, handled: false };
      dispatchBphEffects(f.run, { kind: "before-attack", unit, target: first, attack });
      fireMartialArrow(f.ctx, { unit, target: first,
        amount: stats(f, unit).damage, critical: false, ...attack }, 0);
      for (let n = 0; n < 8; n++) step(f, 0.05);
      expect(first.hp).toBeLessThan(1000);
      expect(second.hp < 1000).toBe(f.worn && kind === "archer");
    }
  },
  _REMOVER_HeroSpawnInvisibility: f => {
    expect(f.ctx.state.counters["status:unconfirmed:HeroSpawnApplyStatusToSelf"]).toBeUndefined();
    const unit = spawn(f);
    step(f, 6);
    expect(stats(f, unit).cooldown).toBeCloseTo(BPH_PROFILES.Hero1_Squire.cooldown / (f.worn ? 2 : 1), 6);
    expect(enemyAcquires(f, unit)).toBe(!f.worn);
    step(f, 4.01);
    expect(enemyAcquires(f, unit)).toBe(true);
  },
  _REMOVERelic1_WarBanner: f => {
    f.run.gold = f.save.coins = 100;
    const shop = createBphShop(f.save, f.ctx.effects);
    // Different products, including a duplicate, pass through the actual
    // recruit purchase API; only distinct pack types contribute surge.
    for (const packId of ["Pack1_Basic", "Pack1_Basic", "Pack2_Advanced"]) {
      shop.offers = [{ packId, box: false, price: 1, sold: false, discounted: false }];
      expect(buyBphRecruit(f.run, shop, 0)).not.toBeNull();
    }
    expect(grantBphMastery(f.save, { receiptId: "relic:test", amount: 10, source: "combat" }))
      .toBeCloseTo(f.worn ? 12 : 10, 6);
  },
  R_BuildingsActivateFaster: f => {
    step(f, 30);
    collectBphTemple(f.run);
    expect(f.run.gold).toBe(f.worn ? 4 : 3);
    step(f, 25);
    collectBphTemple(f.run);
    expect(f.save.inventory).toHaveLength(f.worn ? 2 : 1);
  },
  R_CommonSacrificeRareFromPack: f => {
    const unit = spawn(f);
    expect(unit.hp).toBe(f.worn ? 0 : unit.maxHp);
    const replacement = f.run.squads[0].soldiers.find(other => other.bph?.parentId === unit.id);
    expect(replacement ? BPH_PROFILES[replacement.bph!.profileId].rarity : -1).toBe(f.worn ? 1 : -1);
    if (replacement) expect(replacement.hp).toBeGreaterThan(0);
  },
  R_FirstEpicSacrificeCommons: f => {
    const unit = spawn(f, "Hero1_Archer");
    expect(unit.hp).toBe(f.worn ? 0 : unit.maxHp);
    const replacements = f.run.squads[0].soldiers.filter(other => other.bph?.parentId === unit.id && other.hp > 0);
    expect(replacements).toHaveLength(f.worn ? 3 : 0);
    expect(replacements.every(other => BPH_PROFILES[other.bph!.profileId].rarity === 0)).toBe(true);
  },
  R_RareSacrificeGainPack: f => {
    spawn(f, "Hero1_Barbarian");
    const second = spawn(f, "Hero1_Barbarian");
    expect(second.hp).toBe(f.worn ? 0 : second.maxHp);
    expect(f.save.inventory.map(pack => pack.packId)).toEqual(f.worn ? ["Pack1_Basic"] : []);
  },
  "R_WarriorsSpawnFortify - Demo": f => {
    const sibling = recruit(f, "panokseon");
    const units = Array.from({ length: 3 }, () => recruit(f, "monk"));
    for (const unit of units) {
      const hp = unit.hp;
      f.ctx.applyUnitDamage({ target: unit, amount: 1 });
      expect(unit.hp).toBe(f.worn ? hp : hp - 1);
      f.ctx.applyUnitDamage({ target: unit, amount: 1 });
      expect(unit.hp).toBe(f.worn ? hp - 1 : hp - 2);
    }
    f.ctx.applyUnitDamage({ target: sibling, amount: 1 });
    expect(sibling.hp).toBe(sibling.maxHp - 1);
  },
};

const rings = [
  ["Relic_HuntersAreOutcast", "archer", 3, "militia", 6, "cavalry", 6],
  ["Relic_ArcanistsAreHunters", "monk", 5, "archer", 3, "chongtong", 3],
  ["Relic_MilitiaAreMystics", "spearman", 1, "monk", 5, "panokseon", 5],
  ["Relic_MysticsAreArcanists", "hwacha", 4, "monk", 5, "panokseon", 5],
  ["Relic_OutcastsAreMilitia", "militia", 6, "spearman", 1, "cavalry", 6],
] as const;
// Canonical effects follow the ring in both directions. Legacy upgrades only
// see the troop's original class, including the off-class sibling.
for (const [id, first, firstLegacy, second, secondLegacy, sibling, siblingLegacy] of rings) {
  checks[id] = f => {
    for (const kind of [first, second, sibling]) {
      const unit = recruit(f, kind), target = enemy(f);
      const legacy = (kind === first || (kind === sibling && siblingLegacy === firstLegacy)) ? 0.1 : 0.2;
      const canonical = kind === sibling ? 0 : f.worn ? 1 : 0.5;
      strike(f, unit, target);
      expect(1000 - target.hp).toBeCloseTo(BPH_PROFILES[recruits[kind][0]].damage * (1 + legacy + canonical), 6);
    }
  };
}

const extras: Record<string, readonly BphEffect[]> = {
  Relic1_FourLeafClover: [effect("HeroSpawnAsGiantChance", 0.1), effect("GiantDamageBonus", 0.4)],
  R_ArcanistTomePower: [effect("MasterySurgeBonus", 1)],
  R_Epic: [effect("GiantDamageBonus", 0.4)],
  R_BuildingsActivateFaster: [
    effect("BuildingActivateTwiceChance", 0, { placementId: BPH_CASTLE_UNLOCK_PLACEMENTS.temple }),
    effect("UnlockBuilding", 1, { targetBuilding: "Building_3Magic" }),
  ],
};
for (const [id, first, firstLegacy, second, secondLegacy] of rings) extras[id] = [
  ...[first, second].map(klass => effect("HeroAttackPower", 0.5, { targetHaengjuClass: klass })),
  effect("HeroAttackPower", 0.1, { targetClass: String(firstLegacy) }),
  effect("HeroAttackPower", 0.2, { targetClass: String(secondLegacy) }),
];

export const ALL_RELIC_BATTLE_IDS = Object.keys(checks).sort();
test("every relic definition has a worn-versus-owned-only battle assertion", () => {
  expect(ALL_RELIC_BATTLE_IDS).toHaveLength(45);
  expect(ALL_RELIC_BATTLE_IDS)
    .toEqual(Object.values(BPH_UPGRADE_NODES).filter(node => node.type === 5).map(node => node.id).sort());
});
for (const id of ALL_RELIC_BATTLE_IDS) {
  test(`${id}: equipping changes its observable battle outcome`, () => {
    for (const worn of [false, true]) {
      const roll = id === "Relic1_FourLeafClover" ? 0.12 : 0;
      checks[id](fixture(id, worn, extras[id], roll));
    }
  });
}

test("Invisibility excludes Warlord taunts from enemy acquisition and live cached queries", () => {
  const f = fixture("_REMOVER_HeroSpawnInvisibility", true);
  const unit = spawn(f, "Hero7_Warlord");
  expect(enemyAcquires(f, unit)).toBe(false);
  const source = f.run.enemies.at(-1)!;
  expect(martialTauntTarget(f.ctx, source)).toBeNull();
  const status = f.ctx.state.statuses.find(s => s.targetId === unit.id && s.id === "Invisibility")!;
  status.until = f.run.time;
  expect(martialTauntTarget(f.ctx, source)?.unit).toBe(unit);
  status.until = f.run.time + 1;
  expect(martialTauntTarget(f.ctx, source)).toBeNull();
});

test("Invisibility drops a held target before a windup fires, while launched shots still hit", () => {
  const f = fixture("_REMOVER_HeroSpawnInvisibility", true);
  const unit = spawn(f);
  const squad = f.run.squads[0];
  squad.x = squad.y = -1000;
  unit.emerging = false;
  unit.clock = 1000;
  const source = enemy(f, unit.x + 20, unit.y);
  source.kind = "teppo";
  source.clock = 1000;
  source.prey = [squad.id, squad.soldiers.indexOf(unit)];
  source.strikeAt = f.run.time + 0.005;
  advance(f.run, 0.01);
  expect(source.prey).toBeNull();
  expect(f.run.shots.filter(shot => shot.from === source.id)).toHaveLength(0);
  const hp = unit.hp;
  f.run.shots.push({ id: f.run.nextId++, kind: "bullet", x: unit.x, y: unit.y,
    toX: unit.x, toY: unit.y, speed: 380, target: 0,
    prey: [squad.id, squad.soldiers.indexOf(unit)], damage: 1, critical: false,
    by: "weapon", splash: 0, pierce: 0, from: source.id });
  advance(f.run, 0.01);
  expect(unit.hp).toBeLessThan(hp);
});

// Already-working secondary abilities must not mask a dead recruitment
// modifier. Draw from the same complete known collection with the same seeds,
// through a real pack grant/open/spawn. Clearing units between draws avoids
// duplicated/sacrificed soldiers changing the number of measured receipts.
const weightedTroops: Readonly<Record<string, Recruit>> = {
  Relic1_CharmArcanist: "monk", Relic1_CharmMystic: "monk",
  Relic1_CharmOutcast: "militia", Relic1_CharmWarrior: "spearman",
  R_ArcanistTomePower: "monk", R_CharmHunter: "militia",
  R_HunterPeriodicInvisibility: "archer", R_MysticSpawnFortify: "spearman",
  R_WarriorAliveGiant: "spearman", "R_HunterArrowBounce - Demo": "archer",
  "R_WarriorsSpawnFortify - Demo": "monk",
};
const weighted = Object.values(BPH_UPGRADE_NODES).filter(node => node.type === 5 &&
  node.effects.some(e => e.type === "BoosterPackTargetHeroWeightDouble" ||
    e.type === "BoosterPackTargetTomePityStacks" || e.type === "PackRareWeightBoost" ||
    e.type === "PackEpicWeightBoost" || e.type === "PackLegendaryWeightBoost"));
for (const node of weighted) {
  test(`${node.id}: recruitment modifier changes actual weighted battle arrivals`, () => {
    const modifier = node.effects.find(e => e.type === "BoosterPackTargetHeroWeightDouble" ||
      e.type === "BoosterPackTargetTomePityStacks" || e.type.startsWith("Pack") && e.type.endsWith("WeightBoost"))!;
    const desired = (id: string) => {
      if (modifier.type === "BoosterPackTargetTomePityStacks") return !!BPH_TOMES[id];
      if (modifier.type === "BoosterPackTargetHeroWeightDouble") {
        const cls = weightedTroops[node.id];
        if (!cls) throw new Error(`Missing expected recruitment class for ${node.id}`);
        return BPH_PROFILES[id]?.classId === cls;
      }
      const card = BPH_PROFILES[id] ?? BPH_TOMES[id];
      // The clover boosts every non-common tier, while the other two boost
      // their one authored rarity. Count drawn cards, never effect counters.
      return !!card && (node.id === "Relic1_FourLeafClover" ? card.rarity > 0 :
        card.rarity === (modifier.type === "PackRareWeightBoost" ? 1 : 2));
    };
    const pack = Object.values(BPH_PACKS).filter(p => bphDrawPool(p).some(card => desired(card.id)) &&
      bphDrawPool(p).some(card => BPH_PROFILES[card.id] && !desired(card.id)))
      .sort((a, b) => {
        const ratio = (p: typeof a) => {
          const pool = bphDrawPool(p), total = pool.reduce((n, card) => n + card.weight, 0);
          return Math.abs(0.5 - pool.filter(card => desired(card.id)).reduce((n, card) => n + card.weight, 0) / total);
        };
        return ratio(a) - ratio(b);
      })[0];
    if (!pack) throw new Error(`No mixed recruitment pool for ${node.id}`);
    const totals = [false, true].map(worn => {
      const f = fixture(node.id, worn);
      f.save.dimension = 99; // No scripted first-open overrides.
      f.save.discovered = [...Object.keys(BPH_PROFILES), ...Object.keys(BPH_TOMES)];
      f.save.foils = [...f.save.discovered]; // No unknown-unit or foil pity draws.
      f.save.firstThunderstorm = f.save.firstSquireFoil = true;
      let arrivals = 0;
      for (let seed = 1; seed <= 256; seed++) {
        f.save.rng = seed;
        f.save.packs[pack.id] = { opened: 100, sinceNewHero: 0, sinceNewFoil: 0 };
        f.run.squads[0].soldiers = [];
        const receipts = open(f, pack.id);
        for (const receipt of receipts) {
          expect(receipt.reason).toBe("weighted");
          for (const card of receipt.cards) {
            if (!desired(card.profileId)) continue;
            if (BPH_PROFILES[card.profileId]) {
              expect(f.run.squads[0].soldiers.some(unit => unit.bph?.resultId === receipt.id &&
                unit.bph?.birthProfileId === card.profileId)).toBe(true);
            }
            arrivals++;
          }
        }
      }
      return arrivals;
    });
    expect(totals[1]).toBeGreaterThan(totals[0]);
  });
}

test("FirstPackPortal replaces only the first opening in each new battle of a mature account", () => {
  for (const worn of [false, true]) {
    const f = fixture("R_FirstPackPortal", worn);
    f.save.totalOpened = 100;
    f.save.packs.Pack1_Basic = { opened: 100, sinceNewHero: 0, sinceNewFoil: 0 };
    const first = open(f), second = open(f);
    expect(first[0].cards.some(card => card.profileId === "Hero3_Portal")).toBe(worn);
    expect(second[0].cards.some(card => card.profileId === "Hero3_Portal")).toBe(false);
    expect(f.run.squads[0].soldiers.filter(unit => unit.bph?.profileId === "Hero3_Portal"))
      .toHaveLength(worn ? 1 : 0);
  }
});
