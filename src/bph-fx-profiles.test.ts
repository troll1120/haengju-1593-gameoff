import { expect, test } from "bun:test";
import type { BphEffect, BphFxContext, BphFxEvent, BphSpawnOrigin } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import { bindBphConsumers, bphFxContext, bphRegisteredKinds, dispatchBphEffects } from "./bph-fx-dispatch";
import { BPH_PROFILE_CONSUMERS, BPH_PROFILE_UNCONFIRMED } from "./bph-fx-profiles";
import { BPH_STATUS_CONSUMERS } from "./bph-fx-status";
import { freshBphSave, parseBphSave } from "./bph-save";
import { BPH_UNIT_STAT_PERCENT, buyBphUnitUpgrade } from "./bph-unit-upgrades";
import { bphEffectCombat, createRun } from "./rules";
import type { Effect, Enemy, Unit } from "./rules";
import { createBphRun, settleBphRun } from "./bph-session";
import { bphStats, hitBphPack } from "./bph-combat";
import { freshMeta } from "./meta";
import { advance } from "./rules";
import { hitBphEnemy } from "./rules";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import { HEIGHT, WIDTH } from "./geometry";
import { BPH_PLACEMENTS, BPH_UPGRADE_NODES, activeBphEffects, buyBphNode } from "./bph-upgrades";

function isEffect(value: unknown): value is BphEffect {
  if (typeof value !== "object" || value === null) return false;
  if (!("nodeId" in value) || typeof value.nodeId !== "string"
    || !("type" in value) || typeof value.type !== "string"
    || !("value" in value) || typeof value.value !== "number"
    || !("effectPower" in value) || typeof value.effectPower !== "number"
    || !("effectPowerScale" in value) || typeof value.effectPowerScale !== "number"
    || !("stackCap" in value) || typeof value.stackCap !== "number"
    || !("countStep" in value) || typeof value.countStep !== "number"
    || !("targets" in value) || typeof value.targets !== "object" || value.targets === null) return false;
  return Object.values(value.targets).every(target => typeof target === "string");
}
const data: unknown = await Bun.file(new URL("../review/p10/fx-profiles/original-effects.json", import.meta.url)).json();
if (!Array.isArray(data) || !data.every(isEffect)) throw new Error("Invalid original effect fixture");
const originals: readonly BphEffect[] = data;

function original(nodeId: string, type: string): BphEffect {
  const row = originals.find(row => row.nodeId === nodeId && row.type === type);
  if (!row) throw new Error(`Missing independent original fixture: ${nodeId}/${type}`);
  const targets: Record<string, string> = {};
  for (const [key, value] of Object.entries(row.targets)) {
    if (typeof value === "string") targets[key] = value;
  }
  return { ...row, targets };
}

function fixture(effects: readonly BphEffect[], rolls: readonly number[] = []) {
  const meta = freshMeta();
  // Isolate authored kill rewards from the separately tested first-encounter award.
  meta.bph = freshBphSave();
  meta.bph.discovered = ["Hero1_Squire", "Hero4_Duelist"];
  meta.bph.codexRewards = { version: 1, claimed: ["discovery:Hero1_Squire", "discovery:Hero4_Duelist"], pendingGold: 0 };
  const run = createBphRun(meta, { seed: 1593, general: "권율", upgrades: [] });
  const native = bphFxContext(run);
  if (!native || !run.bph) throw new Error("Production battle must bind its native context");
  const save = native.save, output: Effect[] = run.bph.fxEvents;
  const events: BphFxEvent[] = [];
  const queued = [...rolls];
  const context: BphFxContext = {
    ...native, effects,
    ...bphEffectCombat(run, output),
    random: () => {
      const roll = queued.shift();
      if (roll === undefined) throw new Error("Unexpected combat RNG draw");
      return roll;
    },
  };
  function spawn(id: string, origin: Partial<BphSpawnOrigin> = {}): Unit {
    const before = run.squads[0].soldiers.length;
    context.spawnProfile(id, 1, { packId: "Pack1_Basic", ...origin });
    const unit = run.squads[0].soldiers[before];
    if (!unit) throw new Error(`Profile spawn did not materialize ${id}`);
    return unit;
  }
  function readStats(unit: Unit) {
    const stats = bphStats(unit, run);
    if (!stats) throw new Error("Missing production profile stats");
    return stats;
  }
  function enemy() {
    const seed = createRun(4).enemies[0];
    if (!seed) throw new Error("createRun must seed its opening enemies");
    return { ...seed, id: run.nextId++, hp: 0, maxHp: 20 };
  }
  function kill(unit: Unit | null) {
    dispatchBphEffects(run, { kind: "enemy-killed", enemy: enemy(), killer: unit });
  }
  function death(unit: Unit) {
    unit.hp = 0;
    dispatchBphEffects(run, { kind: "unit-death", unit, killer: null });
  }
  function attack(unit: Unit, target: Enemy = enemy()) {
    const attack = { multiplier: 1, extraProjectiles: 0, bounces: 0, handled: false };
    dispatchBphEffects(run, { kind: "before-attack", unit, target, attack });
    return attack;
  }
  bindBphConsumers(context, [...BPH_PROFILE_CONSUMERS, {
    id: "buildings", kinds: [], onEvent: (_ctx, event) => { events.push(event); }, consume: () => {},
  }]);
  function step(dt: number) {
    run.time += dt;
    context.emitEvent({ kind: "step", dt });
  }
  function target(x: number, y: number, hp = 100) {
    const target = enemy();
    Object.assign(target, { x, y, goalX: x, goalY: y, hp, maxHp: hp, kind: "yari", shielded: false, speed: 0, stun: 0 });
    run.enemies.push(target);
    return target;
  }
  return { context, run, save, output, events, spawn, readStats, enemy, target, step, kill, death, attack, queued };
}

// Each row protects the original percentage's field and target, with a different
// unrelated profile as a negative control. A wrong field or an omitted filter
// changes the observable dispatcher result.
const statCases = [
  { node: "SN_RangerAttackSpeed", kind: "ArcherFireRate", id: "Hero1_Archer", field: "cooldown", factor: 1 / 1.25 },
  { node: "SN_RangerRange", kind: "ArcherRange", id: "Hero1_Archer", field: "range", factor: 1.3499999940395355 },
  { node: "SN_FireMageSpeed", kind: "FireMageAttackSpeed", id: "Hero2_Pyromancer", field: "cooldown", factor: 1 / 1.1500000059604645 },
  { node: "SN_Barbarian_AreaAttack", kind: "HeroAreaAttack", id: "Hero1_Barbarian", field: "area", factor: 1.5 },
  { node: "SN_SquireDamage 2", kind: "HeroAttackPower", id: "Hero1_Squire", field: "damage", factor: 1.5 },
  { node: "SN_SkeletonShotgunArrowCount", kind: "HeroAttackRange", id: "Hero6_Shotgun", field: "range", factor: 1.1000000014901161 },
  { node: "SN_MonkAttackSpeed", kind: "HeroAttackSpeed", id: "Hero2_Monk", field: "cooldown", factor: 1 / 1.25 },
  { node: "SN_Barbarian_Duration", kind: "HeroDuration", id: "Hero1_Barbarian", field: "hp", factor: 1.5 },
  { node: "R_HeroMoveSpeed", kind: "HeroMoveSpeed", id: "Hero1_Squire", field: "moveSpeed", factor: 1.300000011920929 },
] as const;

for (const row of statCases) test(`${row.kind} changes its original stat through the dispatcher`, () => {
  const effect = original(row.node, row.kind), f = fixture([effect]);
  const unit = f.spawn(row.id), baseline = fixture([]), control = baseline.spawn(row.id);
  const expected = baseline.readStats(control)[row.field] * row.factor;
  expect(f.readStats(unit)[row.field]).toBeCloseTo(expected, 10);
  if (effect.targets.targetHero) {
    const unrelated = f.spawn("Hero_Bear"), plain = baseline.spawn("Hero_Bear");
    expect(f.readStats(unrelated)).toEqual(baseline.readStats(plain));
  }
});

const flatCases = [
  { node: "SN_PaladinBlock", kind: "HeroBlockChance", id: "Hero2_Knight", field: "blockChance", bonus: 0.07000000029802322 },
  { node: "SN_ThiefCritChance", kind: "HeroCritChance", id: "Hero3_DemonSlayer", field: "critChance", bonus: 0.07000000029802322 },
  { node: "SN_ThiefCritDmg", kind: "HeroCritDamage", id: "Hero3_DemonSlayer", field: "critDamage", bonus: 0.5 },
  { node: "_SN_AllHeroes_DamageReduction", kind: "HeroDamageReduction", id: "Hero1_Squire", field: "damageReduction", bonus: 0.25 },
] as const;
for (const row of flatCases) test(`${row.kind} adds original probability or reduction points`, () => {
  const f = fixture([original(row.node, row.kind)]), unit = f.spawn(row.id);
  const plain = fixture([]), control = plain.spawn(row.id);
  expect(f.readStats(unit)[row.field]).toBeCloseTo(plain.readStats(control)[row.field] + row.bonus, 10);
});

test("HeroCritChancePerCombatCoin counts earned coins, excludes the initial balance, and caps", () => {
  const f = fixture([original("SN_DuelistCoinCrit", "HeroCritChancePerCombatCoin")]);
  const duelist = f.spawn("Hero4_Duelist");
  expect(f.readStats(duelist).critChance).toBe(0);
  dispatchBphEffects(f.run, { kind: "coins-gained", amount: 3 });
  expect(f.readStats(duelist).critChance).toBeCloseTo(0.15000000223517418, 10);
  dispatchBphEffects(f.run, { kind: "coins-gained", amount: 40 });
  expect(f.readStats(duelist).critChance).toBe(0.5);
});

for (const row of [
  { type: "HeroDeathAttackPowerBonusDay", node: "SN_HeroDeathAttackPowerRun", field: "damage" },
  { type: "HeroDeathAttackSpeedBonusDay", node: "SN_HeroDeathAttackSpeedRun", field: "cooldown" },
  { type: "HeroDeathMoveSpeedBonusDay", node: "SN_HeroDeathMoveSpeedRun", field: "moveSpeed" },
] as const) test(`${row.type} counts each mapped death once and stops at its original cap`, () => {
  const effect = original(row.node, row.type), f = fixture([effect]);
  const survivor = f.spawn("Hero1_Squire"), corpse = f.spawn("Hero1_Barbarian");
  f.death(corpse);
  const base = BPH_PROFILES.Hero1_Squire;
  if (!base) throw new Error("Missing original Squire");
  const input = row.field === "cooldown" ? base.cooldown : row.field === "damage" ? base.damage : base.moveSpeed;
  const firstFactor = 1.0399999991059303;
  expect(f.readStats(survivor)[row.field]).toBeCloseTo(row.field === "cooldown" ? input / firstFactor : input * firstFactor, 10);
  for (let n = 0; n < 20; n++) f.death(f.spawn("Hero1_Barbarian"));
  const maxFactor = 1.4000000059604645;
  expect(f.readStats(survivor)[row.field]).toBeCloseTo(row.field === "cooldown" ? input / maxFactor : input * maxFactor, 10);
});

test("HeroHpPerPackOpened uses full original count steps and caps the independent HP multiplier", () => {
  const f = fixture([original("SN_HeroHpPerPackOpened", "HeroHpPerPackOpened")]);
  const unit = f.spawn("Hero1_Squire");
  f.save.totalOpened = 9;
  expect(f.readStats(unit).hp).toBe(4);
  f.save.totalOpened = 20;
  expect(f.readStats(unit).hp).toBeCloseTo(4.4000000059604645, 10);
  f.save.totalOpened = 100000;
  expect(f.readStats(unit).hp).toBe(16);
});

test("pack-open HP multiplier applies after an ordinary percent HP upgrade", () => {
  const f = fixture([
    original("SN_HeroHpPerPackOpened", "HeroHpPerPackOpened"),
    original("SN_Barbarian_Duration", "HeroDuration"),
  ]);
  f.save.totalOpened = 20;
  expect(f.readStats(f.spawn("Hero1_Barbarian")).hp).toBeCloseTo(4.9500000067055225, 10);
});

test("HeroStatsPerFoilHeroInCollection counts distinct collectible heroes, excluding enemies and tomes", () => {
  const f = fixture([original("SN_Chaos_HeroStatsPerFoilHero", "HeroStatsPerFoilHeroInCollection")]);
  f.save.foils = ["Hero1_Squire", "Hero1_Squire", "Hero_Bear", "Hero1_Squire2", "Tome_Thunderstorm", "Monster1_Caveling"];
  const unit = f.spawn("Hero1_Squire"), result = f.readStats(unit);
  expect(result.hp).toBeCloseTo(4.800000011920929, 10);
  expect(result.damage).toBeCloseTo(1.2000000029802322, 10);
});

test("ArcherArrowBounce adds the original number only to its target", () => {
  const f = fixture([original("SN_RangerBounce", "ArcherArrowBounce")]);
  expect(f.attack(f.spawn("Hero1_Archer")).bounces).toBe(1);
  expect(f.attack(f.spawn("Hero1_Squire")).bounces).toBe(0);
});

test("ArcherArrowBounceChance uses original class and combat RNG boundary", () => {
  const f = fixture([original("R_HunterArrowBounce - Demo", "ArcherArrowBounceChance")], [0.249999, 0.25]);
  const archer = f.spawn("Hero1_Archer");
  expect(f.attack(archer).bounces).toBe(1);
  expect(f.attack(archer).bounces).toBe(0);
  expect(f.attack(f.spawn("Hero1_Squire")).bounces).toBe(0);
  expect(f.queued).toEqual([]);
});

test("HeroClassAlsoCountsAs applies bidirectional transitive original class aliases to filters", () => {
  const f = fixture([
    original("Relic_HuntersAreOutcast", "HeroClassAlsoCountsAs"),
    original("Relic_ArcanistsAreHunters", "HeroClassAlsoCountsAs"),
    original("R_HunterArrowBounce - Demo", "ArcherArrowBounceChance"),
  ], [0, 0]);
  expect(f.attack(f.spawn("Hero1_Barbarian")).bounces).toBe(1);
  expect(f.attack(f.spawn("Hero6_BloodMage")).bounces).toBe(1);
  expect(f.attack(f.spawn("Hero1_Squire")).bounces).toBe(0);
});

test("HeroProjectileCount adds original shotgun arrows only to the target profile", () => {
  const f = fixture([original("SN_SkeletonShotgunArrowCount", "HeroProjectileCount")]);
  expect(f.attack(f.spawn("Hero6_Shotgun")).extraProjectiles).toBe(1);
  expect(f.attack(f.spawn("Hero1_Archer")).extraProjectiles).toBe(0);
});

test("TargetHeroExtraProjectilesDouble doubles extras regardless of effect order, leaving base arrows alone", () => {
  const extra = original("SN_SkeletonShotgunArrowCount", "HeroProjectileCount");
  const double = original("SN_SkeletonShotgunExtraProjectilesDouble", "TargetHeroExtraProjectilesDouble");
  for (const effects of [[double, extra], [extra, double]]) {
    const f = fixture(effects);
    expect(f.attack(f.spawn("Hero6_Shotgun")).extraProjectiles).toBe(2);
  }
  const alone = fixture([double]);
  expect(alone.attack(alone.spawn("Hero6_Shotgun")).extraProjectiles).toBe(0);
});

test("HeroSpawnShieldPercent absorbs finite damage and does not heal or become permanent immunity", () => {
  const f = fixture([original("SN_HammerShield", "HeroSpawnShieldPercent")]);
  const unit = f.spawn("Hero7_Warlord");
  function hit(amount: number) {
    const hit = { amount, prevented: false };
    dispatchBphEffects(f.run, { kind: "before-unit-damage", unit, source: null, hit });
    return hit.amount;
  }
  expect(hit(unit.maxHp / 4)).toBe(0);
  expect(hit(unit.maxHp / 2)).toBe(unit.maxHp / 4);
  expect(hit(7)).toBe(7);
  expect(unit.hp).toBe(unit.maxHp);
});

test("DuplicateHeroSpawnWhileNoHeroesAlive creates one actual extra and stops synchronous copy recursion", () => {
  const f = fixture([original("Relic2_Nature_RingOfDuplication", "DuplicateHeroSpawnWhileNoHeroesAlive")]);
  f.spawn("Hero1_Squire");
  expect(f.run.squads[0]?.soldiers.length).toBe(2);
  f.spawn("Hero1_Archer");
  expect(f.run.squads[0]?.soldiers.length).toBe(3);
});

test("FirstTargetRaritySpawnDuplicate duplicates the first two original warriors and excludes other classes", () => {
  const f = fixture([original("Relic1_CharmWarrior", "FirstTargetRaritySpawnDuplicate")]);
  f.spawn("Hero1_Archer");
  for (let n = 0; n < 3; n++) f.spawn("Hero1_Squire");
  expect(f.run.squads[0]?.soldiers.length).toBe(6);
});

test("HeroSpawnExtraCopies uses the original 40 percent chance and does not recursively create skeletons", () => {
  const f = fixture([original("R_EchoingBones", "HeroSpawnExtraCopies")], [0.39, 0.4000000059604645]);
  f.spawn("Hero_Skeleton");
  f.spawn("Hero_Skeleton");
  f.spawn("Hero1_Squire");
  expect(f.run.squads[0]?.soldiers.length).toBe(4);
  expect(f.queued).toEqual([]);
});

test("HeroKillHealPercent heals the original fraction only for the original killer", () => {
  const f = fixture([original("SN_Barbarian_HealOnKill", "HeroKillHealPercent")]);
  const unit = f.spawn("Hero1_Barbarian");
  unit.hp = 1;
  f.kill(unit);
  expect(unit.hp).toBeCloseTo(1.4500000178813934, 10);
  const archer = f.spawn("Hero1_Archer");
  archer.hp = 1;
  f.kill(archer);
  expect(archer.hp).toBe(1);
});

test("HeroKillHealChance uses effectPower as chance and value as percent of max HP", () => {
  const f = fixture([original("SN_JaguarKillHeal", "HeroKillHealChance")], [0.249999, 0.25]);
  const unit = f.spawn("Hero_Jaguar");
  unit.hp = unit.maxHp / 4;
  f.kill(unit);
  expect(unit.hp).toBe(unit.maxHp / 2);
  f.kill(unit);
  expect(unit.hp).toBe(unit.maxHp / 2);
});

test("HeroKillMasteryFlat feeds survival settlement, including native nonhero kills", () => {
  const f = fixture([original("SN_HeroMastery", "HeroKillMasteryFlat")]);
  f.kill(f.spawn("Hero1_Squire"));
  expect(f.run.bph?.pendingMastery).toBe(10);
  f.kill(null);
  expect(f.run.bph?.pendingMastery).toBe(20);
  expect(f.save.resources.mastery).toBe(0);
  expect(f.save.coins).toBe(3);
});

test("HeroKillBonusCoinChance grants exactly one saved coin on a successful original killer roll", () => {
  const f = fixture([original("SN_DuelistKillCoinChance", "HeroKillBonusCoinChance")], [0.1, 0.10000000149011612]);
  const unit = f.spawn("Hero4_Duelist");
  f.kill(unit);
  f.kill(unit);
  f.kill(f.spawn("Hero1_Squire"));
  expect(f.save.coins).toBe(4);
});

test("HeroDeathSpawnBonusPackChance grants an original Basic Pack only on a successful death roll", () => {
  const f = fixture([original("SN_Chaos_HeroDeathSpawnPack", "HeroDeathSpawnBonusPackChance")], [0.249, 0.25]);
  f.death(f.spawn("Hero1_Squire"));
  f.death(f.spawn("Hero1_Squire"));
  expect(f.save.inventory.map(pack => pack.packId)).toEqual(["Pack1_Basic"]);
});

test("same-stat bonuses add before the independent collection multiplier and do not compound per read", () => {
  const f = fixture([
    original("SN_SquireDamage 2", "HeroAttackPower"),
    original("SN_HeroDmg", "HeroAttackPower"),
    original("SN_Chaos_HeroStatsPerFoilHero", "HeroStatsPerFoilHeroInCollection"),
  ]);
  f.save.foils = ["Hero_Bear"];
  const unit = f.spawn("Hero1_Squire");
  expect(f.readStats(unit).damage).toBeCloseTo(1.9250000026077032, 10);
  expect(f.readStats(unit).damage).toBeCloseTo(1.9250000026077032, 10);
});

test("battle counters and shields never leak into a second bound run", () => {
  const effect = original("SN_DuelistCoinCrit", "HeroCritChancePerCombatCoin");
  const first = fixture([effect]), second = fixture([effect]);
  dispatchBphEffects(first.run, { kind: "coins-gained", amount: 100 });
  expect(first.readStats(first.spawn("Hero4_Duelist")).critChance).toBe(0.5);
  expect(second.readStats(second.spawn("Hero4_Duelist")).critChance).toBe(0);
});

for (const [kind] of Object.entries(BPH_PROFILE_UNCONFIRMED)) {
  test(`${kind} remains visibly unconfirmed through the dispatcher instead of executing an invented effect`, () => {
    const row = originals.find(effect => effect.type === kind);
    if (!row) throw new Error(`Missing original ${kind}`);
    const f = fixture([original(row.nodeId, row.type)]);
    expect(f.output.filter(effect => effect.label?.startsWith(`미확인 ${kind} (`)).length).toBe(1);
    expect(bphRegisteredKinds().includes(kind)).toBe(false);
    const unit = f.spawn("Hero1_Squire");
    const plain = fixture([]), control = plain.spawn("Hero1_Squire");
    expect(f.readStats(unit)).toEqual(plain.readStats(control));
    const events: BphFxEvent[] = [
      { kind: "run-start" }, { kind: "step", dt: 0.1 }, { kind: "run-ended", won: false },
    ];
    for (const event of events) {
      dispatchBphEffects(f.run, event);
      dispatchBphEffects(plain.run, event);
    }
    expect(f.output.filter(effect => effect.label?.startsWith(`미확인 ${kind} (`)).length).toBe(1);
    expect(f.save).toEqual(plain.save);
    expect(f.run.squads[0]?.soldiers.length).toBe(1);
  });
}

test("intrinsic foil rows do not become global buffs for all discovered or unfoiled copies", () => {
  const f = fixture([original("FOIL_Barbarian", "HeroAreaAttack")]);
  f.save.foils = ["Hero1_Barbarian"];
  const unit = f.spawn("Hero1_Barbarian");
  expect(f.readStats(unit).area).toBe(BPH_PROFILES.Hero1_Barbarian?.area ?? -1);
  expect(f.output.some(effect => effect.label?.includes("개체별 foil 정보 없음"))).toBe(false);
});

test("transform relic grants its authored 33 percent global damage bonus", () => {
  const f = fixture([original("R_HeroSpawnTransformAllHeroes", "HeroAttackPower")]);
  expect(f.readStats(f.spawn("Hero1_Squire")).damage).toBeCloseTo(1.3300000131130219, 10);
  expect(f.output.some(effect => effect.label?.includes("동시 행의 적용 조건 미확인"))).toBe(false);
});

for (const row of [
  { kind: "FoilHeroHp", node: "SN_FoilHeroHp", id: "Hero1_Squire", field: "hp", expected: 12 },
  { kind: "FoilHeroAttackPower", node: "SN_FoilHeroAttackPower", id: "Hero1_Squire", field: "damage", expected: 2.5 },
  { kind: "FoilHeroAttackSpeed", node: "SN_FoilHeroAttackSpeed", id: "Hero1_Archer", field: "cooldown", expected: 1.350000023841858 / 2 },
] as const) test(`${row.kind} uses the real instance foil plus its original intrinsic node`, () => {
  const f = fixture([original(row.node, row.kind)]);
  const plain = f.spawn(row.id), foil = f.spawn(row.id, { foil: true });
  expect(f.readStats(foil)[row.field]).toBeCloseTo(row.expected, 10);
  const baseline = fixture([]);
  expect(f.readStats(plain)).toEqual(baseline.readStats(baseline.spawn(row.id)));
});

for (const row of [
  { kind: "TargetPackHeroDamage", node: "SN_HeroFromBasicPackDamage", field: "damage", expected: 1.5 },
  { kind: "TargetPackHeroHp", node: "SN_HeroFromBasicPackDuration", field: "hp", expected: 8 },
] as const) test(`${row.kind} uses the actual originating pack, even for identical profiles`, () => {
  const f = fixture([original(row.node, row.kind)]);
  expect(f.readStats(f.spawn("Hero1_Squire", { packId: "Pack1_Basic" }))[row.field]).toBe(row.expected);
  const unrelated = f.spawn("Hero1_Squire", { packId: "Pack3_Magic" });
  expect(f.readStats(unrelated)[row.field]).toBe(row.field === "hp" ? 4 : 1);
});

test("GiantDamageBonus affects actual giant instances without inventing a default giant multiplier", () => {
  const f = fixture([original("Relic1_GiantsMight", "GiantDamageBonus")]);
  expect(f.readStats(f.spawn("Hero1_Squire", { giant: true })).damage).toBeCloseTo(1.4000000059604645, 10);
  expect(f.readStats(f.spawn("Hero1_Squire")).damage).toBe(1);
});

test("BloodMageLifestealBonus heals from actual HP damage, excluding overkill", () => {
  const f = fixture([original("SN_BloodMage_Lifesteal", "BloodMageLifestealBonus")]);
  const mage = f.spawn("Hero6_BloodMage"), enemy = f.enemy();
  mage.hp = 1; enemy.hp = 3; enemy.kind = "yari"; enemy.shielded = false;
  f.run.enemies = [enemy];
  f.context.applyDamage({ source: mage, target: enemy, amount: 10 });
  expect(mage.hp).toBeCloseTo(2.2000000178813934, 10);
  expect(enemy.hp).toBe(-7);
});

test("BloodMageConsumeOnKillChance claims a real corpse and ends after the original consume times", () => {
  const f = fixture([original("SN_BloodMage_ConsumeChance", "BloodMageConsumeOnKillChance")], [0.24]);
  const mage = f.spawn("Hero6_BloodMage"), enemy = f.enemy();
  enemy.hp = 1; enemy.kind = "yari"; enemy.shielded = false; f.run.enemies = [enemy];
  f.context.applyDamage({ source: mage, target: enemy, amount: 2 });
  expect(f.context.state.consumptions).toEqual([{ sourceId: mage.id, targetId: enemy.id, phase: "start" }]);
  f.run.enemies = [];
  f.run.time = 1.19;
  f.context.emitEvent({ kind: "step", dt: 0.1 });
  expect(f.context.state.consumptions[0].phase).toBe("start");
  f.run.time = 1.21;
  f.context.emitEvent({ kind: "step", dt: 0.02 });
  expect(f.context.state.consumptions[0].phase).toBe("end");
});

test("BloodMageConsumeHealPercent heals only at a successful native consume end", () => {
  const f = fixture([original("SN_BloodMage_ConsumeHeal", "BloodMageConsumeHealPercent")]);
  const mage = f.spawn("Hero6_BloodMage"), enemy = f.enemy();
  mage.hp = 1;
  expect(f.context.beginConsume(mage, enemy)).toBe(true);
  expect(mage.hp).toBe(1);
  expect(f.context.endConsume(mage, enemy)).toBe(true);
  expect(mage.hp).toBeCloseTo(Math.min(mage.maxHp, 1 + mage.maxHp * 0.30000001192092896), 10);
  const hp = mage.hp;
  expect(f.context.endConsume(mage, enemy)).toBe(false);
  expect(mage.hp).toBe(hp);
});

test("HeroBuffShareToRandomHero inserts the same real timed buff once without recursive spreading", () => {
  const f = fixture([original("Relic2_Nature_TalkingBeet", "HeroBuffShareToRandomHero")], [0]);
  const source = f.spawn("Hero1_Squire"), other = f.spawn("Hero1_Archer");
  f.context.applyBuff({ target: source, side: "ally", source, id: "Haste", duration: 5, power: 50, stacks: 1 });
  expect(f.context.state.statuses.map(s => ({ targetId: s.targetId, id: s.id, power: s.power, until: s.until })))
    .toEqual([{ targetId: source.id, id: "Haste", power: 50, until: 5 },
      { targetId: other.id, id: "Haste", power: 50, until: 5 }]);
  f.context.applyBuff({ target: source, side: "ally", id: "Poison", duration: 5, power: 10, stacks: 1 });
  expect(f.context.state.statuses.length).toBe(3);
});

test("HeroCastCount queues original spell casts with their real source instead of extra generic arrows", () => {
  const f = fixture([original("SN_FireMageCast", "HeroCastCount")]);
  const mage = f.spawn("Hero2_Pyromancer");
  expect(f.attack(mage, f.target(mage.x + 20, mage.y)).handled).toBe(true);
  expect(f.context.state.spells.map(s => ({ id: s.id, power: s.power, sourceId: s.sourceId })))
    .toEqual([{ id: "Spell_Fireball", power: 0.25, sourceId: mage.id },
      { id: "Spell_Fireball", power: 0.25, sourceId: mage.id }]);
  expect(f.run.shots).toEqual([]);
});

test("HeroMasteryMultiplier adds and removes its real alive-unit ResourceSurge contribution", () => {
  const f = fixture([original("SN_IllusionistMultiplier", "HeroMasteryMultiplier")]);
  f.context.state.resourceSurge = 2;
  const illusionist = f.spawn("Hero3_Illusionist");
  expect(f.context.state.resourceSurge).toBeCloseTo(2.0700000002980232, 10);
  f.death(illusionist);
  expect(f.context.state.resourceSurge).toBeCloseTo(2, 10);
});

test("profile kill mastery passes through the BUILDINGS ResourceSurge hook at settlement", () => {
  const meta = freshMeta();
  const run = createBphRun(meta, { seed: 144, general: "권율", upgrades: [
    original("SN_IllusionistMultiplier", "HeroMasteryMultiplier"), original("SN_HeroMastery", "HeroKillMasteryFlat"),
  ] });
  const ctx = bphFxContext(run);
  if (!ctx) throw new Error("No native context");
  ctx.spawnProfile("Hero3_Illusionist", 1);
  ctx.spawnProfile("Hero1_Squire", 1);
  const source = run.squads[0].soldiers[1], enemy = createRun(11).enemies[0];
  // Seed 144 id 4 misses both ordinary drop channels, so only profile kill mastery reaches settlement.
  enemy.id = 4; enemy.hp = 1; enemy.kind = "yari"; enemy.shielded = false; run.enemies = [enemy];
  ctx.applyDamage({ source, target: enemy, amount: 2 });
  expect(ctx.save.resources.mastery).toBe(0);
  if (!run.bph) throw new TypeError("Missing native battle");
  expect(run.bph.pendingMastery).toBe(10);
  run.bph.pendingMastery += 950;
  run.phase = "lost";
  settleBphRun(meta, run);
  expect(ctx.save.resources.mastery).toBeCloseTo(10.700000002980232, 8);
});

test("HeroReflectDamagePercent returns real native enemy HP damage after an actual ally hit", () => {
  const f = fixture([original("SN_HammerReturnDamage", "HeroReflectDamagePercent")]);
  const unit = f.spawn("Hero7_Warlord"), enemy = f.enemy();
  f.run.squads[0].clock = 100;
  unit.emerging = false; unit.clock = 100;
  enemy.hp = enemy.maxHp = 100; enemy.kind = "yari"; enemy.shielded = false;
  enemy.x = unit.x + 1; enemy.y = unit.y; enemy.goalX = unit.x; enemy.goalY = unit.y;
  enemy.prey = [f.run.squads[0].id, 0]; enemy.stun = 0; enemy.clock = 0; enemy.strikeAt = 0;
  f.run.enemies = [enemy];
  let received = 0;
  bindBphConsumers(f.context, [...BPH_PROFILE_CONSUMERS, {
    id: "status", kinds: [], consume: () => {},
    onEvent: (_ctx, event) => {
      if (event.kind === "damage-dealt" && event.side === "ally" && event.target === unit)
        received += event.dealt + event.blocked;
    },
  }], false);
  for (let tick = 0; tick < 10; tick++) advance(f.run, 0.1);
  expect(unit.hp).toBeLessThan(unit.maxHp);
  expect(received).toBeGreaterThan(0);
  expect(enemy.hp).toBeCloseTo(100 - received * 0.20000000298023224, 8);
});

function firstOriginal(kind: string): BphEffect {
  const candidates = originals.filter(e => e.type === kind);
  const row = candidates.find(e => !e.nodeId.startsWith("FOIL_")) ?? candidates[0];
  if (!row) throw new Error(`Missing original kind ${kind}`);
  return original(row.nodeId, kind);
}

test("HeroDamagePerPurchasedUpgrade counts real upgrade placements, excluding quests and duplicate IDs", () => {
  const f = fixture([firstOriginal("HeroDamagePerPurchasedUpgrade")]);
  const upgrades = [...BPH_PLACEMENTS.values()].filter(p => p.nodeId && BPH_UPGRADE_NODES[p.nodeId].type === 0).slice(0, 2);
  const quest = [...BPH_PLACEMENTS.values()].find(p => p.nodeId && BPH_UPGRADE_NODES[p.nodeId].type === 4);
  if (upgrades.length !== 2 || !quest) throw new Error("Missing independent WEB placements");
  f.save.purchasedPlacements = [upgrades[0].id, upgrades[1].id, upgrades[0].id, quest.id];
  expect(f.readStats(f.spawn("Hero1_Squire")).damage).toBeCloseTo(1.0080000003799796, 10);
});

test("HeroDamagePerPurchasedUpgrade excludes refunded army training and replacement unit stages", () => {
  const f = fixture([firstOriginal("HeroDamagePerPurchasedUpgrade")]);
  f.save.resources.mastery = 1;
  const training = [...BPH_PLACEMENTS.values()].find(placement => placement.nodeId === "HJ_ArmyTraining01");
  if (!training) throw new Error("Missing authored army training");
  expect(buyBphNode(f.save, "_SkillTreeMain_Demo:23:15")).toBe(true);
  f.save.purchasedPlacements.push(training.id);
  const save = parseBphSave(f.save);
  save.discovered.push("Hero1_Squire");
  expect(buyBphUnitUpgrade(save, "Hero1_Squire", "attack")).toBe(true);
  f.save.unitUpgrades = save.unitUpgrades;
  bindBphConsumers({ ...f.context, save, effects: [...f.context.effects, ...activeBphEffects(save)] }, BPH_PROFILE_CONSUMERS, false);
  expect(f.readStats(f.spawn("Hero1_Squire")).damage).toBeCloseTo(1.0040000001899898 + BPH_UNIT_STAT_PERCENT / 100, 10);
});

for (const row of [
  { kind: "BannermanSpawnChargeCount", event: "spawn" },
  { kind: "BannermanAttackExtraChargeCount", event: "attack" },
  { kind: "BannermanDeathChargeCount", event: "death" },
] as const) test(`${row.kind} applies the original count of real Charge buffs without replacement`, () => {
  const f = fixture([firstOriginal(row.kind)], [0, 0]);
  for (let n = 0; n < 4; n++) f.spawn("Hero1_Squire");
  const banner = f.spawn("Hero4_Bannerman");
  if (row.event === "attack") f.attack(banner, f.target(banner.x + 10, banner.y));
  if (row.event === "death") f.death(banner);
  expect(f.context.state.statuses.map(s => ({ id: s.id, until: s.until, power: s.power })))
    .toEqual([{ id: "Charge", until: 3, power: 100 }, { id: "Charge", until: 3, power: 100 }]);
  expect(new Set(f.context.state.statuses.map(s => s.targetId)).size).toBe(2);
});

function fishing(kind: string, foil = false) {
  const f = fixture([firstOriginal(kind)]);
  const fisher = f.spawn("Hero7_AstralFisher", { foil, position: { x: 100, y: 200 } });
  const enemy = f.target(100 + 2 * BPH_WORLD_TO_PX, 200);
  return { ...f, fisher, hooked: enemy };
}

test("AstralFisherExtraLines creates two moving owned hooks only for a real foil fisher", () => {
  const f = fishing("AstralFisherExtraLines", true);
  f.target(240, 250);
  f.attack(f.fisher, f.hooked);
  f.step(0.1);
  const hooks = f.context.state.actors.filter(a => a.kind === "hook");
  expect(hooks.length).toBe(2);
  expect(hooks.every(a => a.ownerId === f.fisher.id && a.x > 100)).toBe(true);
  expect(new Set(hooks.flatMap(a => a.targets)).size).toBe(2);
});

test("AstralFisherHookedDoubleDamage doubles a real cursor hit only after hook contact", () => {
  const f = fishing("AstralFisherHookedDoubleDamage");
  f.attack(f.fisher, f.hooked);
  for (let n = 0; n < 12; n++) f.step(0.05);
  hitBphEnemy(f.run, f.hooked.id);
  expect(f.hooked.hp).toBe(98);
  expect(f.events.filter(e => e.kind === "hook-pull").map(e => e.phase)).toEqual(["start", "hit"]);
});

test("AstralFisherImmuneWhilePulling prevents an incoming hit during the real pull phase, not flight", () => {
  const f = fishing("AstralFisherImmuneWhilePulling");
  f.attack(f.fisher, f.hooked);
  const hit = () => {
    const hit = { amount: 8, prevented: false };
    f.context.emitEvent({ kind: "before-unit-damage", unit: f.fisher, source: f.hooked, hit });
    return hit.prevented;
  };
  expect(hit()).toBe(false);
  for (let n = 0; n < 12; n++) f.step(0.05);
  expect(hit()).toBe(true);
  for (let n = 0; n < 30; n++) f.step(0.05);
  expect(hit()).toBe(false);
});

test("AstralFisherPathStun uses the original line corridor and three-second stun", () => {
  const f = fishing("AstralFisherPathStun");
  const inside = f.target(220, 230), outside = f.target(220, 255);
  f.attack(f.fisher, f.hooked);
  for (let n = 0; n < 12; n++) f.step(0.05);
  expect(inside.stun).toBe(3);
  expect(outside.stun).toBe(0);
});

test("AstralFisherPullSpeedPercent completes actual original-distance movement in the reduced pull time", () => {
  const f = fishing("AstralFisherPullSpeedPercent");
  const originalX = f.hooked.x;
  f.attack(f.fisher, f.hooked);
  for (let n = 0; n < 32; n++) f.step(0.05);
  expect(f.context.state.actors.filter(a => a.kind === "hook")).toEqual([]);
  expect(f.hooked.x).toBeCloseTo(originalX - BPH_WORLD_TO_PX, 8);
  expect(f.hooked.hp).toBe(88);
  expect(f.events.filter(e => e.kind === "hook-pull").map(e => e.phase)).toEqual(["start", "hit", "end"]);
});

test("DinoDashDistance extends actual charge acquisition and moves along the original converted distance", () => {
  const f = fixture([firstOriginal("DinoDashDistance")]);
  const dino = f.spawn("Hero5_Dino", { position: { x: 100, y: 200 } });
  f.target(100 + 1.8 * BPH_WORLD_TO_PX, 200);
  f.step(0.05); f.step(0.05);
  expect(dino.x).toBeGreaterThan(100);
  expect(f.context.state.actors.find(a => a.kind === "dash")?.toX).toBeCloseTo(340, 8);
  const plain = fixture([]), other = plain.spawn("Hero5_Dino", { position: { x: 100, y: 200 } });
  plain.target(340, 200); plain.step(0.05);
  expect(other.x).toBe(100);
  expect(plain.context.state.actors).toEqual([]);
});

test("DinoDashRepeatChance repeats one completed physical dash and stops on the original chance boundary", () => {
  const f = fixture([firstOriginal("DinoDashRepeatChance")], [0.24, 0.25]);
  const dino = f.spawn("Hero5_Dino", { position: { x: 100, y: 200 } });
  const target = f.target(100 + 0.8 * BPH_WORLD_TO_PX, 200);
  f.attack(dino, target);
  for (let n = 0; n < 30; n++) f.step(0.05);
  expect(f.events.filter(e => e.kind === "dash-end").length).toBe(2);
  expect(target.hp).toBe(94);
  expect(f.queued).toEqual([]);
});

test("RogueDashCount adds a fourth completed Monk landing rather than generic projectiles", () => {
  const f = fixture([firstOriginal("RogueDashCount")]);
  const monk = f.spawn("Hero2_Monk", { position: { x: 100, y: 200 } });
  const target = f.target(100 + 1.2 * BPH_WORLD_TO_PX, 200);
  f.attack(monk, target);
  for (let n = 0; n < 100; n++) {
    f.step(0.05);
    // Keep this cooldown/upgrade fixture in place despite the separate knockback mechanic.
    Object.assign(target, { x: 100 + 1.2 * BPH_WORLD_TO_PX, y: 200 });
  }
  expect(f.events.filter(e => e.kind === "dash-end").length).toBe(4);
  expect(target.hp).toBeCloseTo(88.8);
  expect(f.run.shots).toEqual([]);
});

test("HeroDashKillGainDashCount adds a Monk hop after a real landing kill", () => {
  const f = fixture([firstOriginal("HeroDashKillGainDashCount")]);
  const monk = f.spawn("Hero2_Monk", { position: { x: 100, y: 200 } });
  const target = f.target(100 + 1.2 * BPH_WORLD_TO_PX, 200);
  const victim = f.target(target.x, target.y, 1);
  f.attack(monk, target); f.step(0.1);
  expect(victim.hp).toBe(1);
  for (let n = 0; n < 100; n++) f.step(0.05);
  expect(victim.hp).toBeCloseTo(-1.8);
  expect(f.events.filter(e => e.kind === "dash-end")).toHaveLength(4);
  expect(f.events.filter(e => e.kind === "enemy-killed").length).toBe(1);
});

test("HeroWheelModeDurationSeconds keeps the real wheel active past its original three seconds", () => {
  // Native wheel wobble draws one combat roll per 0.1s boundary; 0.5 keeps it neutral.
  const f = fixture([firstOriginal("HeroWheelModeDurationSeconds")], Array(45).fill(0.5));
  const wheel = f.spawn("Hero6_Skelewheel");
  f.attack(wheel, f.target(wheel.x + 30, wheel.y));
  for (let n = 0; n < 61; n++) f.step(0.05);
  expect(f.context.state.actors.filter(a => a.kind === "wheel").length).toBe(1);
  for (let n = 0; n < 21; n++) f.step(0.05);
  expect(f.context.state.actors.filter(a => a.kind === "wheel")).toEqual([]);
  expect(wheel.strikeAt).toBe(0);
});

test("HeroWheelModeEdgeHitMoveSpeedMultiplier accelerates only after a real wall reflection", () => {
  const make = (effects: readonly BphEffect[]) => {
    const f = fixture(effects), edge = WIDTH - 0.6000000238418579 * BPH_WORLD_TO_PX;
    const unit = f.spawn("Hero6_Skelewheel", { position: { x: edge - 5, y: HEIGHT / 2 } });
    f.attack(unit, f.target(edge + 5, unit.y));
    f.step(0.01);
    return { ...f, wheel: unit, edge };
  };
  const f = make([firstOriginal("HeroWheelModeEdgeHitMoveSpeedMultiplier")]), plain = make([]);
  expect(f.events.filter(e => e.kind === "wheel-edge").map(e => e.side)).toEqual(["우"]);
  expect(f.wheel.x).toBeLessThan(plain.wheel.x);
  expect(f.wheel.x).toBeLessThan(f.edge);
});

test("HeroWheelModeWheelingMoveSpeedMultiplierRamp changes physical travel after the original 0.1-second interval", () => {
  const make = (effects: readonly BphEffect[]) => {
    const f = fixture(effects, [0.5]), unit = f.spawn("Hero6_Skelewheel", { position: { x: WIDTH / 2, y: HEIGHT / 2 } });
    f.attack(unit, f.target(300, unit.y));
    f.step(0.05); f.step(0.05);
    return { ...f, wheel: unit };
  };
  const f = make([firstOriginal("HeroWheelModeWheelingMoveSpeedMultiplierRamp")]), plain = make([]);
  expect(f.wheel.x).toBeGreaterThan(plain.wheel.x);
  expect(f.context.state.actors.find(a => a.kind === "wheel")?.data.bonus).toBeCloseTo(0.10000000149011612, 10);
});

test("RotatingSwordCount creates two orbiting physical blades that damage on contact entry", () => {
  const f = fixture([firstOriginal("RotatingSwordCount")]), unit = f.spawn("Hero7_Icebourne");
  const orbit = 0.6000000238418579 * BPH_WORLD_TO_PX, angle = Math.PI / 10;
  const target = f.target(unit.x + Math.cos(angle) * orbit, unit.y + Math.sin(angle) * orbit);
  f.attack(unit, target); f.step(0.1);
  expect(f.context.state.actors.filter(a => a.kind === "blade").length).toBe(2);
  expect(target.hp).toBe(100 - BPH_PROFILES.Hero7_Icebourne.damage);
});

test("RotatingSwordSizeBonus enlarges the actual hit corridor by the original 25 percent", () => {
  const run = (effects: readonly BphEffect[]) => {
    const f = fixture(effects), unit = f.spawn("Hero7_Icebourne");
    const radius = 0.6000000238418579 * BPH_WORLD_TO_PX + 42, angle = Math.PI / 10;
    const target = f.target(unit.x + Math.cos(angle) * radius, unit.y + Math.sin(angle) * radius);
    f.attack(unit, target); f.step(0.1);
    return target.hp;
  };
  expect(run([firstOriginal("RotatingSwordSizeBonus")])).toBe(100 - BPH_PROFILES.Hero7_Icebourne.damage);
  expect(run([])).toBe(100);
});

test("RotatingSwordSpeedBonus changes the actual angle using the original angular speed", () => {
  const f = fixture([firstOriginal("RotatingSwordSpeedBonus")]), unit = f.spawn("Hero7_Icebourne");
  f.attack(unit, f.target(unit.x, unit.y)); f.step(0.1);
  const blade = f.context.state.actors.find(a => a.kind === "blade"), angle = Math.PI * 1.5 * 0.1;
  if (!blade) throw new Error("No real orbiting blade");
  expect(blade.x).toBeCloseTo(unit.x + Math.cos(angle) * 0.6000000238418579 * BPH_WORLD_TO_PX, 8);
  expect(blade.y).toBeCloseTo(unit.y + Math.sin(angle) * 0.6000000238418579 * BPH_WORLD_TO_PX, 8);
});

for (const kind of ["HeroMoveLightBeamDamage", "HeroMoveLightBeamRadius", "HeroMoveLightBeamDistance"] as const)
  test(`${kind} acts after actual accumulated walking, with original damage and radius`, () => {
    const effects = ["HeroMoveLightBeamDamage", "HeroMoveLightBeamRadius", "HeroMoveLightBeamDistance"].map(firstOriginal);
    const f = fixture(effects), unit = f.spawn("Hero1_Squire", { position: { x: 90, y: 200 } });
    const near = f.target(90 + 0.9 * BPH_WORLD_TO_PX, 200), outside = f.target(90 + 1.1 * BPH_WORLD_TO_PX, 200);
    for (let leg = 0; leg < 9; leg++) { unit.x = leg % 2 === 0 ? 290 : 90; f.step(0.1); }
    expect(f.events.filter(e => e.kind === "spellCast" && e.spellId === "Spell_BeamOfLight")).toEqual([]);
    unit.x = 90; f.step(0.1);
    if (kind === "HeroMoveLightBeamDamage") expect(near.hp).toBe(99);
    if (kind === "HeroMoveLightBeamRadius") expect(outside.hp).toBe(100);
    if (kind === "HeroMoveLightBeamDistance")
      expect(f.events.filter(e => e.kind === "spellCast" && e.spellId === "Spell_BeamOfLight").length).toBe(1);
  });

test("TreantSpawnSeedCount creates a moving seed which actually applies original Fortify on arrival", () => {
  const f = fixture([firstOriginal("TreantSpawnSeedCount")], [0]);
  // Native most-injured pool includes the general; keep the leader out of range.
  f.run.squads[0].x = -1000; f.run.squads[0].y = -1000;
  const ally = f.spawn("Hero1_Squire", { position: { x: 130, y: 200 } });
  f.spawn("Hero5_Treant", { position: { x: 100, y: 200 } });
  expect(f.context.state.actors.filter(a => a.kind === "seed").length).toBe(1);
  f.step(0.05);
  expect(f.context.state.statuses).toMatchObject([{ targetId: ally.id, id: "Fortify", power: 0, until: 5.05 }]);
});

test("TreantSeedBounce reaches a second ally only after a successful original bounce roll", () => {
  const f = fixture([firstOriginal("TreantSpawnSeedCount"), firstOriginal("TreantSeedBounce")], [0.49, 0]);
  // Native most-injured pool includes the general; keep the leader out of range.
  f.run.squads[0].x = -1000; f.run.squads[0].y = -1000;
  const first = f.spawn("Hero1_Squire", { position: { x: 130, y: 200 } });
  const second = f.spawn("Hero1_Archer", { position: { x: 180, y: 200 } });
  f.spawn("Hero5_Treant", { position: { x: 100, y: 200 } });
  f.step(0.05); f.step(0.05);
  expect(f.context.state.statuses.filter(s => s.id === "Fortify").map(s => s.targetId)).toEqual([first.id, second.id]);
  expect(f.context.state.actors.filter(a => a.kind === "seed")).toEqual([]);
});

for (const row of [{ roll: 0.59, count: 1 }, { roll: 0.6, count: 2 }, { roll: 0.9, count: 3 }])
  test(`OnHeroDeathSpawn uses original 60/30/10 weights for ${row.count} skeletons at the real corpse`, () => {
    const f = fixture([original("_REMOVERelic3_Cursed_Lantern", "OnHeroDeathSpawn")], [row.roll]);
    const unit = f.spawn("Hero1_Barbarian", { position: { x: 123, y: 321 } });
    f.death(unit);
    const skeletons = f.run.squads[0].soldiers.filter(s => s.bph?.profileId === "Hero_Skeleton");
    expect(skeletons.length).toBe(row.count);
    expect(skeletons.map(s => ({ x: s.x, y: s.y, parent: s.bph?.parentId, cause: s.bph?.cause })))
      .toEqual(Array.from({ length: row.count }, () => ({ x: 123, y: 321, parent: unit.id, cause: "summon" })));
  });

test("OnHeroDeathSpawn keeps the Barbarian-specific single skeleton separate from the weighted relic", () => {
  const f = fixture([original("SN_Barbarian_DeadSpawnSkeleton", "OnHeroDeathSpawn")]);
  f.death(f.spawn("Hero1_Archer")); f.death(f.spawn("Hero1_Barbarian"));
  expect(f.run.squads[0].soldiers.filter(s => s.bph?.profileId === "Hero_Skeleton").length).toBe(1);
});

test("HeroSkillTreeVisualUpgrade switches to the verified equal-stat spiked profile", () => {
  const f = fixture([firstOriginal("HeroSkillTreeVisualUpgrade")]), unit = f.spawn("Hero7_Warlord");
  expect(f.context.unitInfo(unit)?.profileId).toBe("Hero7_Warlord_Spiked");
  expect(unit.maxHp).toBe(50);
  expect(f.readStats(unit).damage).toBe(6);
});

test("HeroSpawnAsGiantChance changes real instance provenance on the original probability boundary", () => {
  const f = fixture([original("Relic1_GiantsMight", "HeroSpawnAsGiantChance")], [0.09, 0.10000000149011612]);
  const giant = f.spawn("Hero1_Squire"), ordinary = f.spawn("Hero1_Squire");
  expect(f.context.unitInfo(giant)?.giant).toBe(true);
  expect(f.context.unitInfo(ordinary)?.giant).toBe(false);
  expect(giant.maxHp).toBe(4);
});

test("HeroAliveTimeBecomeGiant heals once at original age 15 seconds and preserves a real giant flag", () => {
  const f = fixture([firstOriginal("HeroAliveTimeBecomeGiant")]), unit = f.spawn("Hero1_Squire");
  unit.hp = 1; f.run.time = 14.9; f.context.emitEvent({ kind: "step", dt: 0.1 });
  expect(unit.hp).toBe(1);
  f.run.time = 15; f.context.emitEvent({ kind: "step", dt: 0.1 });
  expect(f.context.unitInfo(unit)?.giant).toBe(true);
  expect(unit.hp).toBe(4);
  unit.hp = 2; f.step(0.1);
  expect(unit.hp).toBe(2);
});

test("PaladinTauntArea stuns a real enemy in the expanded original Shield Bash radius", () => {
  const f = fixture([firstOriginal("PaladinTauntArea"), ...BPH_UPGRADE_NODES["SN_PaladinAbility 1"].effects]);
  bindBphConsumers(f.context, [...BPH_PROFILE_CONSUMERS, ...BPH_STATUS_CONSUMERS, {
    id: "quests", kinds: [], onEvent: (_ctx, event) => { f.events.push(event); }, consume: () => {},
  }], false);
  const knight = f.spawn("Hero2_Knight");
  const inside = f.target(knight.x + 150, knight.y), outside = f.target(knight.x + 165, knight.y);
  f.context.emitEvent({ kind: "damage-dealt", side: "ally", target: knight, source: inside,
    attempted: 3, blocked: 3, dealt: 0, overkill: 0, critical: false });
  f.context.emitEvent({ kind: "step", dt: 0 });
  expect(inside.stun).toBe(1.5);
  expect(outside.stun).toBe(0);
  expect(f.events.filter(e => e.kind === "spellCast" && e.spellId === "Spell_Stun").length).toBe(1);
});

test("HeroSpawnTransformAllHeroesChance restores the original living form and HP ratio after ten seconds", () => {
  const f = fixture([firstOriginal("HeroSpawnTransformAllHeroesChance")], [0.5, 0.3]);
  const originalUnit = f.spawn("Hero1_Squire"); originalUnit.hp = 2;
  f.spawn("Hero1_Barbarian");
  expect(f.context.unitInfo(originalUnit)?.profileId).toBe("Hero1_Barbarian");
  expect(originalUnit.hp).toBe(1.5);
  for (let n = 0; n < 101; n++) f.step(0.1);
  expect(f.context.unitInfo(originalUnit)?.profileId).toBe("Hero1_Squire");
  expect(originalUnit.hp).toBe(2);
  expect(f.context.unitInfo(originalUnit)?.lifeId).toBe(1);
});

test("FirstHeroSpawnSacrificeReplaceFromPack replaces only the first epic with three original common draws", () => {
  const f = fixture([firstOriginal("FirstHeroSpawnSacrificeReplaceFromPack")], [0, 0, 0]);
  const first = f.spawn("Hero1_Archer", { resultId: 7 });
  expect(first.hp).toBe(0);
  const replacements = f.run.squads[0].soldiers.filter(s => s.bph?.parentId === first.id);
  expect(replacements.map(s => s.bph?.profileId)).toEqual(["Hero1_Squire", "Hero1_Squire", "Hero1_Squire"]);
  expect(replacements.map(s => s.bph?.resultId)).toEqual([7, 7, 7]);
  expect(f.spawn("Hero1_Archer").hp).toBe(4);
});

test("HeroSpawnSacrificeChanceReplaceFromPack makes an original rare draw from the actual pack", () => {
  const f = fixture([firstOriginal("HeroSpawnSacrificeChanceReplaceFromPack")], [0.33, 0]);
  const common = f.spawn("Hero1_Squire", { resultId: 9 });
  expect(common.hp).toBe(0);
  const replacement = f.run.squads[0].soldiers.find(s => s.bph?.parentId === common.id);
  expect(replacement?.bph).toMatchObject({ profileId: "Hero1_Barbarian", packId: "Pack1_Basic", resultId: 9, cause: "effect" });
});

test("HeroSpawnEveryNthSacrificeGainPack sacrifices the second real rare and returns its actual originating pack", () => {
  const f = fixture([firstOriginal("HeroSpawnEveryNthSacrificeGainPack")]);
  const first = f.spawn("Hero1_Barbarian", { packId: "Pack3_Magic" });
  const second = f.spawn("Hero1_Barbarian", { packId: "Pack3_Magic" });
  expect(first.hp).toBe(3);
  expect(second.hp).toBe(0);
  expect(f.save.inventory.map(p => p.packId)).toEqual(["Pack3_Magic"]);
});

for (const row of [
  { kind: "SacrificeHeroFromEveryNthPack", opens: 3, dead: [false, false, true] },
  { kind: "SacrificeHeroFromFirstPacksCount", opens: 2, dead: [true, false] },
]) test(`${row.kind} acts on the actual result-linked unit after native pack opening`, () => {
  const f = fixture([firstOriginal(row.kind)]);
  for (let n = 0; n < row.opens; n++) {
    f.context.grantPack("Pack1_Basic", 1);
    const instance = f.save.inventory[f.save.inventory.length - 1];
    hitBphPack(f.run, instance.id);
    const results = hitBphPack(f.run, instance.id);
    expect(results.length).toBe(1);
  }
  expect(f.run.squads[0].soldiers.map(unit => unit.hp === 0)).toEqual(row.dead);
  expect(f.events.filter(e => e.kind === "unit-death").length).toBe(1);
});

for (const row of [
  { kind: "TeleporterExtraTeleportOnAttack", requests: 2 },
  { kind: "TeleporterDepartDamageEnabled", requests: 2 },
] as const) test(`${row.kind} moves the actual Black Hole and queues distinct original damage positions`, () => {
  const f = fixture([firstOriginal(row.kind)]);
  const unit = f.spawn("Hero9_BlackHole", { position: { x: 100, y: 200 } });
  const first = f.target(200, 200); f.target(250, 200);
  f.attack(unit, first);
  expect(f.context.state.spells.length).toBe(row.requests);
  expect(f.context.state.spells.map(s => s.id)).toEqual(["Spell_TeleportAndDamageAoe", "Spell_TeleportAndDamageAoe"]);
  if (row.kind === "TeleporterDepartDamageEnabled") expect(f.context.state.spells.map(s => s.x)).toEqual([100, 200]);
  else { expect(unit.x).toBe(250); expect(f.context.state.spells.map(s => s.x)).toEqual([200, 250]); }
});

test("WavePackSpawnExtraTargetPackChance creates one real extra matching wave pack without recursive grants", () => {
  const f = fixture([firstOriginal("WavePackSpawnExtraTargetPackChance")], [0.49]);
  f.context.grantPack("Pack6_Bush", 1, { sourceWave: "WaveRiftNature", foilChanceBonus: 0.25 });
  expect(f.save.inventory.map(p => ({ packId: p.packId, sourceWave: p.sourceWave, foil: p.foilChanceBonus })))
    .toEqual([{ packId: "Pack6_Bush", sourceWave: "WaveRiftNature", foil: 0.25 },
      { packId: "Pack6_Bush", sourceWave: "WaveRiftNature", foil: 0.25 }]);
  expect(f.events.filter(e => e.kind === "wave-pack-spawn").length).toBe(2);
});

for (const row of [
  { node: "SN_BushPackSpawnCooldownReduction", next: 7.1 },
  { node: "SN_BushPackSpawnCooldownReduction3", next: 5.1 },
]) test(`WaveTargetPackSpawnIntervalReduction schedules actual Nature packs at original 8..11 minus ${8.1 - row.next} seconds`, () => {
  const f = fixture([original(row.node, "WaveTargetPackSpawnIntervalReduction")], [0, 0]);
  if (!f.run.bph) throw new Error("No production battle");
  f.run.bph = { ...f.run.bph, waveId: "WaveRiftNature" };
  f.step(0.1);
  expect(f.save.inventory.length).toBe(1);
  expect(f.context.state.timers["profiles:wave:WaveRiftNature"]).toBeCloseTo(row.next, 8);
  f.run.time = row.next - 0.01; f.context.emitEvent({ kind: "step", dt: 0.01 });
  expect(f.save.inventory.length).toBe(1);
  f.run.time = row.next; f.context.emitEvent({ kind: "step", dt: 0.01 });
  expect(f.save.inventory.length).toBe(2);
  expect(f.save.inventory.every(p => p.sourceWave === "WaveRiftNature")).toBe(true);
});

test("all 108 independent original kinds have exactly one implemented owner or an explicit unconfirmed reason", () => {
  const kinds = [...new Set(originals.map(row => row.type))].sort();
  const registered = bphRegisteredKinds().filter(kind => kinds.includes(kind));
  const classified = [...registered, ...Object.keys(BPH_PROFILE_UNCONFIRMED)];
  expect(new Set(classified).size).toBe(108);
  expect(classified.length).toBe(108);
  expect(classified.sort()).toEqual(kinds);
});
