import { expect, test } from "bun:test";
import type { BphEffect, BphFxContext, BphFxEvent } from "./bph-contract";
import { aimBphTactic, bindBphConsumers, dispatchBphEffects, freshBphFxState, tapBphStrike, updateBphPointer } from "./bph-fx-dispatch";
import { BPH_CURSOR_TACTICS, BPH_STATUS_CONSUMERS, bphTacticCursorView, bphTapStrikeView } from "./bph-fx-status";
import { BPH_TAP_STRIKE } from "./bph-tap-strike";
import { freshBphSave } from "./bph-save";
import { BPH_HERO_FRENZY, bphHeroFrenzyScale } from "./bph-tome-fields";
import { addBphProfile, bphArms, bphStats, bphUnitInfo, createBphBattle, hitBphPack } from "./bph-combat";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import { advance, bphEffectCombat, createRun, soldier } from "./rules";
import { CENTER } from "./geometry";
import { BPH_ENEMY_MAP, BPH_TOMES } from "./bph-data";
import type { Effect } from "./rules";
import { bphSurvivalPlan } from "./bph-survival";

function isEffect(value: unknown): value is BphEffect {
  if (!value || typeof value !== "object" || !("nodeId" in value) || typeof value.nodeId !== "string" ||
      !("type" in value) || typeof value.type !== "string" || !("targets" in value) ||
      !value.targets || typeof value.targets !== "object" || Array.isArray(value.targets)) return false;
  return Object.values(value.targets).every(target => typeof target === "string") &&
    ["value", "effectPower", "effectPowerScale", "stackCap", "countStep"].every(field => {
      const number: unknown = Reflect.get(value, field);
      return typeof number === "number" && Number.isFinite(number);
    });
}
const source: unknown = await Bun.file(new URL("../review/p10/fx-status/original-effects.json", import.meta.url)).json();
if (!Array.isArray(source)) throw new RangeError("Original effect fixture must be an array");
const originals = source.filter(isEffect);
if (source.length !== originals.length) throw new RangeError("Malformed original effect fixture");

function original(type: string, nodeId?: string): BphEffect {
  const result = originals.find(effect => effect.type === type && (!nodeId || effect.nodeId === nodeId));
  if (!result) throw new RangeError(`Missing original effect ${type}/${nodeId}`);
  return result;
}

function scenario(effects: readonly BphEffect[], profileId = "Hero9_Supernova", roll = 0) {
  const run = createRun(144), output: Effect[] = [];
  const spawned: { id: string; copies: number }[] = [];
  const save = freshBphSave();
  run.bph = createBphBattle(save, effects, "WaveChapter1");
  const unit = soldier("spearman");
  unit.id = run.nextId++;
  unit.bph = { profileId, birthProfileId: profileId, packId: "Pack1_Basic", foil: false, giant: false,
    kills: 0, stage: 0, resultId: 1, parentId: null, lifeId: 1, cause: "pack" };
  run.squads[0].soldiers = [unit];
  const enemy = run.enemies[0];
  const ctx: BphFxContext = {
    run, save, effects, pointer: { x: 0, y: 0 },
    state: freshBphFxState(),
    ...bphEffectCombat(run, output),
    random: () => roll,
    profileId: target => target.bph?.profileId ?? null,
    unitInfo: bphUnitInfo,
    spawnProfile: (id, copies, origin) => {
      spawned.push({ id, copies });
      addBphProfile(run, { profileId: id, copies, foil: origin?.foil ?? false, discovered: false },
        origin ?? { packId: "DeliveryBox", cause: "effect" });
    },
    grantPack: () => { throw new RangeError("Unexpected pack reward in status scenario"); },
  };
  bindBphConsumers(ctx, BPH_STATUS_CONSUMERS);
  return { ctx, unit, enemy, output, spawned, send: (event: BphFxEvent) => dispatchBphEffects(run, event) };
}

function openedTome(id: string, foil = false): BphFxEvent {
  return { kind: "pack-opened", result: { id: 1, packId: "Pack1_Basic", ordinal: 1, cards: [
    { profileId: id, foil, copies: 1, discovered: true },
  ], frenzy: false, reason: "weighted" } };
}

test.each([
  ["HeroDeathCastSpell", "SN_DemolitionistDeathBombs", "Hero9_Supernova", "unit-death", "Spell_Mine", 5],
  ["HeroDeathCastSpellChance", "SN_SkeletonDieThrowBone", "Hero_Skeleton", "unit-death", "Spell_SkeletonBone", 1],
  ["HeroAttackExtraSpellCastChance", "SN_LaserMageExtraQuasar", "Hero9_Quasar", "after-attack", "Spell_Quasar", 1],
  ["HeroAttackedCastSpellChance", "SN_DemolitionistBombOnDamaged", "Hero9_Supernova", "before-unit-damage", "Spell_Mine", 1],
] as const)("%s queues the authored spell count and original hero power through dispatch", (type, node, profile, event, spell, count) => {
  const s = scenario([original(type, node)], profile);
  if (event === "unit-death") s.send({ kind: "unitKilled", side: "ally", unit: s.unit,
    source: null, critical: false, position: s.unit, origin: "attack" });
  else if (event === "after-attack") s.send({ kind: event, unit: s.unit, target: s.enemy });
  else s.send({ kind: "damage-dealt", side: "ally", target: s.unit, source: s.enemy,
    attempted: 10, blocked: 0, dealt: 10, overkill: 0, critical: false });
  expect(s.ctx.state.spells).toEqual(Array.from({ length: count }, () => ({
    id: spell, x: event === "after-attack" ? s.enemy.x : s.unit.x,
    y: event === "after-attack" ? s.enemy.y : s.unit.y, sourceId: s.unit.id, power: 0.25,
    ...(event === "after-attack" ? { targetId: s.enemy.id } : {}),
  })));
});

test.each([["Hero1_Squire", 0], ["Hero_Skeleton", 0.9]] as const)(
  "chance casts exclude the wrong profile or a failed original probability roll (%s, %s)", (profile, roll) => {
  const s = scenario([original("HeroDeathCastSpellChance", "SN_SkeletonDieThrowBone")], profile, roll);
  s.send({ kind: "unitKilled", side: "ally", unit: s.unit, source: null, critical: false, position: s.unit, origin: "attack" });
  expect(s.ctx.state.spells).toEqual([]);
});

test("HeroSpawnApplyStatusToSelf creates the original five second invisibility", () => {
  const s = scenario([original("HeroSpawnApplyStatusToSelf")]);
  s.send({ kind: "unit-spawn", unit: s.unit, profileId: "Hero9_Supernova" });
  expect(s.ctx.state.statuses).toEqual([{ targetId: s.unit.id, id: "Invisibility", until: 5, power: 100, stacks: 1, side: "ally" }]);
});

test("StatusEffectDurationBonus doubles the authored invisibility lifetime", () => {
  const s = scenario([original("HeroSpawnApplyStatusToSelf"), original("StatusEffectDurationBonus")]);
  s.send({ kind: "unit-spawn", unit: s.unit, profileId: "Hero9_Supernova" });
  expect(s.ctx.state.statuses[0]?.until).toBe(10);
});

test("HeroFirstSpawnsApplyStatusToSelf limits revive to the first two matching mystics", () => {
  const s = scenario([original("HeroFirstSpawnsApplyStatusToSelf")], "Hero9_BlackHole");
  const firstId = s.ctx.run.nextId;
  s.ctx.spawnProfile("Hero9_BlackHole", 3);
  expect(s.ctx.state.statuses.map(status => status.targetId)).toEqual([firstId, firstId + 1]);
});

test("HeroSpawnApplyStatusToAllHeroes grants a shield that blocks exactly one attack", () => {
  const s = scenario([original("HeroSpawnApplyStatusToAllHeroes", "R_WarriorsSpawnFortify - Demo")], "Hero9_BlackHole");
  s.send({ kind: "unit-spawn", unit: s.unit, profileId: "Hero9_BlackHole" });
  const first = { amount: 10, prevented: false }, second = { amount: 10, prevented: false };
  s.send({ kind: "before-unit-damage", unit: s.unit, source: s.enemy, hit: first });
  s.send({ kind: "before-unit-damage", unit: s.unit, source: s.enemy, hit: second });
  expect([first.prevented, second.prevented]).toEqual([true, false]);
});

test("HeroKillApplyStatusToSelfChance uses the original 25 percent chance and doubles attacks with Charge", () => {
  const s = scenario([original("HeroKillApplyStatusToSelfChance")], "Hero3_WitchDoctor", 0.24);
  s.send({ kind: "unitKilled", side: "enemy", unit: s.enemy, source: s.unit, critical: false, position: s.enemy, origin: "attack" });
  const attack = { multiplier: 1, extraProjectiles: 0, bounces: 0, handled: false };
  s.send({ kind: "before-attack", unit: s.unit, target: s.enemy, attack });
  expect(attack.multiplier).toBe(2);
});

test("HeroPeriodicApplyStatus waits fifteen seconds and targets only the authored hunter class", () => {
  const s = scenario([original("HeroPeriodicApplyStatus")], "Hero9_Supernova");
  s.send({ kind: "step", dt: 14 });
  expect(s.ctx.state.statuses).toEqual([]);
  s.ctx.run.time = 15;
  s.send({ kind: "step", dt: 1 });
  expect(s.ctx.state.statuses).toEqual([{ targetId: s.unit.id, id: "Invisibility", until: 20, power: 100, stacks: 1, side: "ally" }]);
});

test("HeroCombatCoinGainedApplyStatusToRandom fortifies the target Duelist", () => {
  const s = scenario([original("HeroCombatCoinGainedApplyStatusToRandom")], "Hero4_Duelist");
  s.send({ kind: "coins-gained", amount: 1 });
  expect(s.ctx.state.statuses).toEqual([{ targetId: s.unit.id, id: "Fortify", until: Infinity, power: 0, stacks: 1, side: "ally" }]);
});

test("StunnedEnemyDamageBonus doubles the incoming damage only during stun", () => {
  const s = scenario([original("StunnedEnemyDamageBonus")]);
  s.enemy.stun = 1;
  const hit = { amount: 7, prevented: false, critical: false };
  s.send({ kind: "before-enemy-damage", enemy: s.enemy, source: s.unit, hit });
  expect(hit.amount).toBe(14);
});

test("status timers and first-spawn limits belong to each battle", () => {
  const effect = original("HeroFirstSpawnsApplyStatusToSelf");
  const first = scenario([effect], "Hero9_BlackHole"), second = scenario([effect], "Hero9_BlackHole");
  first.ctx.spawnProfile("Hero9_BlackHole", 3);
  second.ctx.spawnProfile("Hero9_BlackHole", 1);
  expect(second.ctx.state.statuses.map(status => status.id)).toEqual(["Revive"]);
});

test("HeroAttackApplyStatusChance applies Monkey's authored one second stun on a successful 33 percent roll", () => {
  const s = scenario([original("HeroAttackApplyStatusChance", "SN_MonkeyAttackStun")], "Hero_Monkey", 0.32);
  s.send({ kind: "after-attack", unit: s.unit, target: s.enemy });
  expect(s.enemy.stun).toBe(1);
});

test("HeroBlockCastSpell casts only after a real Fortify block", () => {
  const s = cursor([original("HeroBlockCastSpell", "SN_PaladinBlockThunderbolt")], 0, "Hero2_Knight");
  s.unit.x = 100; s.unit.y = 100;
  s.ctx.applyBuff({ target: s.unit, side: "ally", id: "Fortify", duration: Infinity, power: 0, stacks: 1 });
  const hit = { amount: 10, prevented: false };
  s.send({ kind: "before-unit-damage", unit: s.unit, source: s.enemy, hit });
  s.send({ kind: "damage-dealt", side: "ally", target: s.unit, source: s.enemy,
    attempted: 10, blocked: hit.prevented ? 10 : 0, dealt: hit.prevented ? 0 : 10, overkill: 0, critical: false });
  step(s, 0);
  // Native Hero.GetSpellCastBaseDamage: a Knight-cast Thunderbolt deals her
  // effective attack damage (3), not SpellDefinition.damage * spellPower.
  expect(s.enemy.hp).toBe(997);
});

test("InfectedEnemyDamageBonus preserves the raw twenty percent damage increase", () => {
  const s = scenario([original("InfectedEnemyDamageBonus")]);
  s.ctx.state.statuses.push({ targetId: s.enemy.id, id: "Infected", until: 5, power: 0, stacks: 1 });
  const hit = { amount: 10, prevented: false, critical: false };
  s.send({ kind: "before-enemy-damage", enemy: s.enemy, source: s.unit, hit });
  expect(hit.amount).toBeCloseTo(12.000000029802322);
});

test("InfectedEnemyMoveSpeedMultiplier uses seventy five percent speed without compounding each frame and restores it", () => {
  const s = scenario([original("InfectedEnemyMoveSpeedMultiplier")]), speed = s.enemy.speed;
  s.ctx.state.statuses.push({ targetId: s.enemy.id, id: "Infected", until: 5, power: 0, stacks: 1 });
  s.send({ kind: "step", dt: 1 });
  s.send({ kind: "step", dt: 1 });
  expect(s.enemy.speed).toBe(speed * 0.75);
  s.ctx.run.time = 5;
  s.send({ kind: "step", dt: 1 });
  expect(s.enemy.speed).toBe(speed);
});

test("DayStartGainTargetTome activates Raise Dead with the original three skeletons per channel tick", () => {
  const s = scenario([original("DayStartGainTargetTome")]);
  s.ctx.run.time = 3;
  s.send({ kind: "step", dt: 3 });
  expect(s.spawned).toEqual([{ id: "Hero_Skeleton", copies: 3 }]);
});

test("TomeChannelCastsPerTickBonus adds one skeleton to a real Raise Dead activation", () => {
  const s = scenario([original("TomeChannelCastsPerTickBonus", "SN_TomeRaiseDeadCasts")]);
  s.send(openedTome("Tome_RaiseDead"));
  s.ctx.run.time = 3;
  s.send({ kind: "step", dt: 3 });
  expect(s.spawned).toEqual([{ id: "Hero_Skeleton", copies: 4 }]);
});

test("TomeBuffDurationIncrease extends Raise Dead to fifteen seconds", () => {
  const s = scenario([original("TomeBuffDurationIncrease", "SN_TomeRaiseDeadDuration")]);
  s.send(openedTome("Tome_RaiseDead"));
  s.ctx.run.time = 15;
  s.send({ kind: "step", dt: 3 });
  expect(s.spawned).toEqual([{ id: "Hero_Skeleton", copies: 3 }]);
});

test("a tome opened after a same-tick stat read changes the next attack stats", () => {
  const s = scenario([], "Hero1_Squire");
  const every = bphArms(s.unit, s.ctx.run)!.every;

  s.send(openedTome("Tome_HeroFrenzy"));

  expect(bphArms(s.unit, s.ctx.run)!.every).toBeCloseTo(every / (1 + BPH_HERO_FRENZY.attackSpeed), 9);
});
test("a cached active tome expires at its authored duration", () => {
  const s = scenario([], "Hero1_Squire");
  const every = bphArms(s.unit, s.ctx.run)!.every;
  s.send(openedTome("Tome_HeroFrenzy"));
  expect(bphArms(s.unit, s.ctx.run)!.every).toBeLessThan(every);

  s.ctx.run.time = Number(BPH_TOMES.Tome_HeroFrenzy.raw.buffDuration);

  expect(bphArms(s.unit, s.ctx.run)!.every).toBe(every);
});
test("격려 swings faster, draws soldiers 1.1x, cuts damage taken, keeps damage/move/reach, and a second draw adds another duration", () => {
  const s = scenario([], "Hero1_Squire"), duration = Number(BPH_TOMES.Tome_HeroFrenzy.raw.buffDuration);
  const before = bphStats(s.unit, s.ctx.run)!;
  expect(bphHeroFrenzyScale(s.ctx.run)).toBe(1);
  s.send(openedTome("Tome_HeroFrenzy"));
  const during = bphStats(s.unit, s.ctx.run)!;
  expect(bphHeroFrenzyScale(s.ctx.run)).toBe(1.1);
  expect(during.cooldown).toBeCloseTo(before.cooldown / 1.6, 9);
  expect([during.damageReduction - before.damageReduction, during.damage, during.moveSpeed, during.range, during.area])
    .toEqual([BPH_HERO_FRENZY.reduction, before.damage, before.moveSpeed, before.range, before.area]);
  s.ctx.run.time = duration / 2;
  s.send(openedTome("Tome_HeroFrenzy"));
  expect(Object.keys(s.ctx.state.counters).filter(key => key.startsWith("status:unconfirmed:"))).toEqual([]);
  s.ctx.run.time = duration + 1;
  expect(bphHeroFrenzyScale(s.ctx.run)).toBe(1.1);
  s.ctx.run.time = duration * 2;
  expect([bphHeroFrenzyScale(s.ctx.run), bphStats(s.unit, s.ctx.run)!.cooldown]).toEqual([1, before.cooldown]);
});

test("TomeChannelIntervalReduction quickens the pointer rate of its own cursor tactic by the cast speed increase", () => {
  const effect = original("TomeChannelIntervalReduction");
  const patches = (effects: readonly BphEffect[]) => {
    const s = scenario(effects);
    s.send(openedTome(effect.targets.targetTome));
    s.send({ kind: "aim", position: { x: 100, y: 100 } });
    const every = BPH_CURSOR_TACTICS[effect.targets.targetTome].every / (1 + effect.value);
    s.ctx.run.time = every + 1e-6;
    s.send({ kind: "step", dt: every + 1e-6 });
    return s.ctx.state.actors.filter(actor => actor.data.dragonFire === 1).length;
  };
  expect([patches([effect]), patches([])]).toEqual([1, 0]);
});

test("foil channel bonuses apply only to their own foil tome", () => {
  const s = scenario([original("TomeChannelCastsPerTickBonus", "FOIL_DragonsCall")]);
  s.ctx.run.enemies = [s.enemy]; s.enemy.hp = 100; s.enemy.kind = "yari"; s.enemy.shielded = false;
  s.send(openedTome("Tome_Thunderstorm", true));
  s.send({ kind: "aim", position: { x: s.enemy.x, y: s.enemy.y } });
  s.ctx.run.time = 1;
  s.send({ kind: "step", dt: 1 });
  expect(s.enemy.hp).toBe(97);
});

function cursor(effects: readonly BphEffect[], distance = 0, profile = "Hero9_Supernova", roll = 0) {
  const s = scenario(effects, profile, roll);
  s.ctx.run.enemies = [s.enemy];
  s.enemy.hp = s.enemy.maxHp = 1000; s.enemy.kind = "yari"; s.enemy.boss = false; s.enemy.shielded = false;
  s.ctx.pointer.x = 100; s.ctx.pointer.y = 100; s.enemy.x = 100 + distance; s.enemy.y = 100;
  return s;
}
function step(s: ReturnType<typeof scenario>, dt: number) {
  s.ctx.run.time += dt;
  s.send({ kind: "step", dt });
}

function openPack(s: ReturnType<typeof scenario>, packId = "Pack1_Basic", box = false) {
  const battle = s.ctx.run.bph;
  if (!battle) throw new RangeError("Status scenario must have a native BPH battle");
  const id = s.ctx.save.nextPackId++;
  s.ctx.save.inventory.push({ id, packId, box });
  battle.packs.push({ id, packId, box, hp: 1, x: 100, y: 100 });
  hitBphPack(s.ctx.run, id);
}

const D = BPH_TAP_STRIKE.damage, R = BPH_TAP_STRIKE.radius;
/** One volley on the cursor scenario's spot (100, 100), stepped until it lands. */
function volley(s: ReturnType<typeof scenario>) {
  s.send({ kind: "tap", position: { x: 100, y: 100 } });
  step(s, BPH_TAP_STRIKE.travelSeconds);
}

test("a tap spends one of three charges and its volley lands only after the travel time, on the whole circle", () => {
  const s = cursor([], R - 1);
  s.send({ kind: "tap", position: { x: 100, y: 100 } });
  expect(bphTapStrikeView(s.ctx).charges).toBe(BPH_TAP_STRIKE.charges - 1);
  step(s, BPH_TAP_STRIKE.travelSeconds - 0.01);
  expect(s.enemy.hp).toBe(1000);
  step(s, 0.01);
  expect(s.enemy.hp).toBe(1000 - D);
  expect(s.output.filter(effect => effect.kind === "strike").map(effect => [effect.x, effect.y, effect.value])).toEqual([[100, 100, R]]);
});

test("taps without a charge call nothing, and one charge refills per recharge period up to the cap", () => {
  const s = cursor([], 0);
  for (let i = 0; i < BPH_TAP_STRIKE.charges + 2; i++) s.send({ kind: "tap", position: { x: 100, y: 100 } });
  expect(s.ctx.state.strikes).toHaveLength(BPH_TAP_STRIKE.charges);
  step(s, BPH_TAP_STRIKE.rechargeSeconds - 0.001);
  expect(bphTapStrikeView(s.ctx).charges).toBe(0);
  step(s, 0.002);
  expect(bphTapStrikeView(s.ctx).charges).toBe(1);
  step(s, BPH_TAP_STRIKE.rechargeSeconds * 10);
  expect(bphTapStrikeView(s.ctx)).toEqual({ charges: BPH_TAP_STRIKE.charges, max: BPH_TAP_STRIKE.charges, radius: R, refill: 1 });
});

test.each([
  ["CursorDpsDamage", "SN_CursorDamage 1", 0, 0, 1.5],
  ["CursorDpsRadius", "SN_CursorRadius", R + 10, 0, 1],
  ["CursorDpsEveryNthDamageMult", "Relic1_Club", 0, 2, 2],
  ["HeroAliveCursorDpsDamage", "Relic2_Nature_LifeStaff", 0, 0, 1.0499999999254942],
] as const)("%s changes actual enemy HP on the tap-strike volley", (kind, node, distance, ordinal, multiplier) => {
  const s = cursor([original(kind, node)], distance);
  s.ctx.state.counters["status:cursor-hits"] = ordinal;
  volley(s);
  expect(s.enemy.hp).toBeCloseTo(1000 - D * multiplier);
});

test("the aim ring radius is the radius the next volley actually hits with, mastery included", () => {
  const s = cursor([original("CursorDpsRadius", "SN_CursorRadius")]);
  const ring = bphTapStrikeView(s.ctx).radius;
  s.send({ kind: "tap", position: { x: 100, y: 100 } });
  expect(ring).toBeGreaterThan(R);
  expect(s.output.filter(effect => effect.kind === "strike").map(effect => effect.value)).toEqual([ring]);
});

test("CursorDpsIntervalReduction is the recharge speed: one volley refills 20 percent sooner", () => {
  const s = cursor([original("CursorDpsIntervalReduction", "SN_CursorAttackSpeed")]);
  s.send({ kind: "tap", position: { x: 100, y: 100 } });
  const refill = BPH_TAP_STRIKE.rechargeSeconds / 1.2000000029802322;
  step(s, refill - 0.001);
  expect(bphTapStrikeView(s.ctx).charges).toBe(BPH_TAP_STRIKE.charges - 1);
  step(s, 0.002);
  expect(bphTapStrikeView(s.ctx).charges).toBe(BPH_TAP_STRIKE.charges);
});

test("CursorDpsEveryNthApplyStatus stuns the hit target for the raw authored duration on the third volley", () => {
  const s = cursor([original("CursorDpsEveryNthApplyStatus")]);
  s.ctx.state.counters["status:cursor-hits"] = 2;
  volley(s);
  expect(s.enemy.stun).toBe(0.800000011920929);
});

test("CursorHealsHeroesInsteadOfMonsterDamage heals the actual unit in the circle and leaves the enemy untouched", () => {
  const s = cursor([original("CursorHealsHeroesInsteadOfMonsterDamage")]);
  s.unit.x = 100; s.unit.y = 100; s.unit.hp = 10;
  volley(s);
  expect([s.unit.hp, s.enemy.hp]).toEqual([10 + D, 1000]);
});

test("CursorDamagePerFoilMonsterInCollection counts original enemy IDs rather than foil heroes", () => {
  const s = cursor([original("CursorDamagePerFoilMonsterInCollection")]);
  s.ctx.save.foils = [Object.keys(BPH_ENEMY_MAP)[0], "Hero1_Squire"];
  volley(s);
  expect(s.enemy.hp).toBe(1000 - D * 1.5);
});

test("CursorDamagePerHeroDeath uses the raw count step and fractional bonus against actual HP", () => {
  const s = cursor([original("CursorDamagePerHeroDeath")]);
  s.ctx.save.questProgress["status:hero-deaths"] = 6;
  volley(s);
  expect(s.enemy.hp).toBeCloseTo(1000 - D * 1.019999999552965);
});

test("CursorDamagePerPurchasedUpgrade counts repeated placements once each and preserves the fractional multiplier", () => {
  const effect = original("CursorDamagePerPurchasedUpgrade");
  const s = cursor([
    { ...effect, targets: { ...effect.targets, placementId: "grid:0:0" } },
    { ...effect, targets: { ...effect.targets, placementId: "grid:1:0" } },
  ]);
  volley(s);
  expect(s.enemy.hp).toBeCloseTo(1000 - D * 1.0120000001043081);
});

test.each([
  ["HeroDeathCursorDpsDamageBonus", 0, 1.1000000014901161],
  ["HeroDeathCursorDpsRadiusBonus", R * 1.0125, 1],
] as const)("%s survives a real ally death event and affects the next volley", (kind, distance, multiplier) => {
  const s = cursor([original(kind)], distance);
  s.unit.hp = 0;
  s.send({ kind: "unitKilled", side: "ally", unit: s.unit, source: null, critical: false, position: s.unit, origin: "attack" });
  volley(s);
  expect(s.enemy.hp).toBeCloseTo(1000 - D * multiplier);
});

test("BonfireStartShieldPercent grants the original half-max-HP shield", () => {
  const s = scenario([original("BonfireStartShieldPercent", "SN_Tower_StartShield")]);
  expect(s.ctx.state.castleShield).toEqual({ hp: s.ctx.run.maxBase * 0.5, maxHp: s.ctx.run.maxBase * 0.5 });
});

test("BonfireShieldBreakCastSpell executes Shockwave after actual native shield damage exhaustion", () => {
  const s = scenario([original("BonfireShieldBreakCastSpell")]), run = s.ctx.run;
  run.squads = []; run.enemies = [s.enemy]; run.walls = { 위: 0, 좌: 0, 우: 0, 아래: 0 }; run.wall = 0;
  Object.assign(s.enemy, { x: CENTER.x, y: CENTER.y, hp: 1000, maxHp: 1000, breach: "위", kind: "yari", clock: 0, shielded: false });
  s.ctx.state.castleShield = { hp: 1, maxHp: 1 };
  advance(run, 1 / 30); advance(run, 1 / 30);
  expect([s.ctx.state.castleShield.hp, s.enemy.hp]).toEqual([0, 998]);
});

test("TowerAttackedCastSpellChance queues the original Rain of Arrows after real HQ damage", () => {
  const s = scenario([original("TowerAttackedCastSpellChance")]), run = s.ctx.run;
  run.squads = []; run.enemies = [s.enemy]; run.walls = { 위: 0, 좌: 0, 우: 0, 아래: 0 }; run.wall = 0;
  Object.assign(s.enemy, { x: CENTER.x, y: CENTER.y, breach: "위", kind: "yari", clock: 0 });
  advance(run, 1 / 30);
  expect(s.ctx.state.spells.map(spell => spell.id)).toEqual(["Spell_BladeRain"]);
});

test("CritKillCastSpellAtMonster uses the actual native critical kill boundary", () => {
  const s = cursor([original("CritKillCastSpellAtMonster")], 0, "Hero3_DemonSlayer");
  s.ctx.applyDamage({ target: s.enemy, amount: 1000, critical: true, source: s.unit });
  expect(s.ctx.state.spells.map(spell => spell.id)).toEqual(["Spell_BladeRain"]);
});

test("the former cursor Rain of Arrows node turns volleys into fire arrows that set struck enemies burning", () => {
  const s = cursor([original("CursorCritKillCastSpellAtMonster")]);
  volley(s);
  expect([s.enemy.hp, s.enemy.burn, s.ctx.state.spells.length]).toEqual([1000 - D, BPH_TAP_STRIKE.fireSeconds, 0]);
  expect(s.output.find(effect => effect.kind === "strike")?.label).toBe("fire");
});

test("ThunderboltDamageBonus increases actual lightning damage by the original 100 percent", () => {
  const s = cursor([original("ThunderboltDamageBonus", "SN_ThunderboltDamage 1")]);
  s.ctx.state.spells.push({ id: "Spell_Thunderbolt", x: s.enemy.x, y: s.enemy.y, targetId: s.enemy.id, power: 1 });
  step(s, 0);
  expect(s.enemy.hp).toBe(997);
});

test("HeroAttackedCastSpellChance lays the actual Mine that only a tap-strike volley detonates", () => {
  const s = cursor([original("HeroAttackedCastSpellChance")], 50);
  const detonations: number[] = [];
  bindBphConsumers(s.ctx, [...BPH_STATUS_CONSUMERS, { id: "profiles", kinds: [],
    onEvent: (_ctx, event) => { if (event.kind === "mine-chain" && event.actor.data.exploded === 1)
      detonations.push(event.actor.id); },
    consume: () => { throw new RangeError("No profile effects in this mine observer"); },
  }], false);
  s.ctx.pointer.x = 100; s.ctx.pointer.y = 100; s.unit.x = 100; s.unit.y = 100;
  s.send({ kind: "damage-dealt", side: "ally", target: s.unit, source: s.enemy,
    attempted: 10, blocked: 0, dealt: 10, overkill: 0, critical: false });
  step(s, 0);
  // Native ColossusMine: an enemy standing inside the blast radius never detonates it.
  step(s, 1);
  expect(s.enemy.hp).toBe(1000);
  expect(detonations.length).toBe(0);
  // A volley landing over the mine (the former cursor DPS hit area) lights its 0.2s fuse,
  // then the caster's effective attack damage (30) inside radius .6.
  volley(s);
  expect(s.enemy.hp).toBe(1000 - D);
  step(s, 0.2);
  expect(s.enemy.hp).toBe(1000 - D - 30);
  expect(detonations.length).toBe(1);
});

test("SpellAoeRadius expands the actual Fireball explosion using the shared world conversion", () => {
  const s = cursor([original("SpellAoeRadius", "SN_FireMageFireballAOE")], 49, "Hero2_Pyromancer");
  s.unit.x = 100; s.unit.y = 100;
  s.ctx.state.spells.push({ id: "Spell_Fireball", x: 100, y: 100, sourceId: s.unit.id, power: 1 });
  step(s, 0); step(s, 0);
  // Pyromancer casts from her effective attack damage (3), not definition 4 * power.
  expect(s.enemy.hp).toBe(997);
});

test.each([
  ["TargetSpellDamageBonus", "SN_BushPackPoisonCloudDamage", 0, 0.5, 999.25],
  ["TargetSpellRadius", "SN_BushPackPoisonCloudArea", 100, 0.5, 999.5],
  ["SpellDuration", "SN_BushPackPoisonCloudDuration", 0, 4.5, 995.5],
] as const)("%s changes real Poison Cloud hits", (kind, node, distance, dt, hp) => {
  const s = cursor([original(kind, node)], distance);
  s.ctx.pointer.x = 0; s.ctx.pointer.y = 0;
  s.ctx.state.spells.push({ id: "Spell_PoisonCloud", x: 100, y: 100, power: 1 });
  step(s, 0); step(s, dt);
  expect(s.enemy.hp).toBe(hp);
});

test("TargetSpellHitStunSeconds adds the authored quarter second to the actual Earthquake stun", () => {
  const s = cursor([original("TargetSpellHitStunSeconds")]);
  s.enemy.x = CENTER.x; s.enemy.y = CENTER.y;
  s.send(openedTome("Tome_Earthquake"));
  s.send({ kind: "aim", position: CENTER });
  step(s, BPH_CURSOR_TACTICS.Tome_Earthquake.every);
  expect(s.enemy.stun).toBe(1.75);
});

test("TomeEffectPower applies the foil Raise Dead bonus only to actual new summons", () => {
  const s = cursor([original("TomeEffectPower", "FOIL_RaiseDead")]);
  s.ctx.pointer.x = 0; s.ctx.pointer.y = 0;
  s.send(openedTome("Tome_RaiseDead", true));
  step(s, 3);
  const summons = s.ctx.run.squads[0].soldiers.filter(unit => unit !== s.unit);
  expect(summons.map(unit => bphArms(unit, s.ctx.run)?.power)).toEqual([3, 3, 3]);
});

test("one Thunderstorm cast damages each of five enemies inside the visible ring once and misses two outside", () => {
  const s = cursor([]);
  const position = { x: 200, y: 300 };
  s.send(openedTome("Tome_Thunderstorm"));
  const aim = bphTacticCursorView(s.ctx);
  if (!aim) throw new Error("Thunderstorm did not activate");
  const r = aim.radius;
  const enemies = [[0, 0], [r / 2, 0], [0, -r], [-r / 2, r / 2], [0, r / 2],
    [r + 1, 0], [r, r]].map(([dx, dy]) => ({
    ...s.enemy, id: s.ctx.run.nextId++, x: position.x + dx, y: position.y + dy,
  }));
  s.ctx.run.enemies = enemies;
  s.send({ kind: "aim", position });
  step(s, BPH_CURSOR_TACTICS.Tome_Thunderstorm.every);

  const hpAfterOneCast = 1000 - BPH_TOMES.Tome_Thunderstorm.casts * 1.5;
  expect(enemies.map(enemy => enemy.hp)).toEqual([...Array(5).fill(hpAfterOneCast), 1000, 1000]);
  expect(s.output.filter(effect => effect.label === "bolt").map(effect => [effect.target, effect.value]))
    .toEqual(enemies.slice(0, 5).map(enemy => [enemy.id, r]));
});

test("TomePowerPerFoilTomeInCollection multiplies actual lightning damage using foil tomes only", () => {
  const s = cursor([original("TomePowerPerFoilTomeInCollection")]);
  s.ctx.pointer.x = 0; s.ctx.pointer.y = 0;
  s.ctx.save.foils = ["Tome_RaiseDead", "Hero1_Squire"];
  s.send(openedTome("Tome_Thunderstorm"));
  s.send({ kind: "aim", position: { x: s.enemy.x, y: s.enemy.y } });
  step(s, BPH_CURSOR_TACTICS.Tome_Thunderstorm.every);
  expect(s.enemy.hp).toBe(995.5);
});

test("TomeCursorDpsAreaBonus widens every volley by half without a Frenzy book", () => {
  const s = cursor([original("TomeCursorDpsAreaBonus")], R * 1.4);
  volley(s);
  expect(s.enemy.hp).toBe(1000 - D);
});

test.each(["TomeCursorDpsAttackSpeedBonus", "TomeCursorDpsCritChance"])("the former Frenzy node %s adds one volley charge", kind => {
  const s = cursor([original(kind)]);
  expect(bphTapStrikeView(s.ctx).max).toBe(BPH_TAP_STRIKE.charges + 1);
  for (let i = 0; i < BPH_TAP_STRIKE.charges + 1; i++) s.send({ kind: "tap", position: { x: 100, y: 100 } });
  expect(s.ctx.state.strikes).toHaveLength(BPH_TAP_STRIKE.charges + 1);
});

test("a second Frenzy reports the unconfirmed cumulative rule instead of inventing linear damage stacking", () => {
  const s = cursor([]);
  s.send(openedTome("Tome_CursorDPS")); s.send(openedTome("Tome_CursorDPS"));
  volley(s);
  expect(s.enemy.hp).toBeCloseTo(1000 - D * 4.199999952316284);
  expect(s.ctx.state.counters["status:unconfirmed:tome:Tome_CursorDPS:stacks"]).toBe(1);
});

test("OpenPackCastSpell executes Poison Cloud at the actual native pack opening position", () => {
  const s = cursor([original("OpenPackCastSpell", "SN_Chaos_PackPoisonCloud")]);
  s.ctx.pointer.x = 0; s.ctx.pointer.y = 0;
  openPack(s);
  step(s, 0); step(s, 0.5);
  expect(s.enemy.hp).toBe(999.5);
});

test("OpenBoosterBoxCastSpell launches five bones once per actual box rather than once per contained pack", () => {
  const s = scenario([original("OpenBoosterBoxCastSpell")]);
  openPack(s, "Pack5_Skeleton", true);
  expect(s.ctx.state.spells.map(spell => spell.id)).toEqual(Array(5).fill("Spell_SkeletonBone"));
});

const rapier = ["OpenPackCursorTimedAttackSpeedDurationSeconds", "OpenPackCursorTimedAttackSpeedMaxStacks",
  "OpenPackCursorTimedAttackSpeedPercent"].map(kind => original(kind));

// 3.6 s refills a volley only at the Rapier rate (4 s / 1.15 = 3.48 s), never at the base 4 s.
test.each([[7, BPH_TAP_STRIKE.charges], [9, BPH_TAP_STRIKE.charges - 1]] as const)(
  "OpenPackCursorTimedAttackSpeedDurationSeconds expires the recharge bonus after eight seconds (time %s)", (time, charges) => {
    const s = cursor(rapier);
    openPack(s);
    s.ctx.run.time = time;
    s.send({ kind: "tap", position: { x: 100, y: 100 } });
    s.send({ kind: "step", dt: 3.6 });
    expect(bphTapStrikeView(s.ctx).charges).toBe(charges);
  });

test("OpenPackCursorTimedAttackSpeedMaxStacks caps four real openings at three speed stacks", () => {
  const s = cursor(rapier);
  for (let i = 0; i < 4; i++) openPack(s);
  step(s, 0.65);
  expect(Object.keys(s.ctx.state.timers).filter(key => key.startsWith("status:rapier:")).length).toBe(3);
  expect(s.enemy.hp).toBe(1000);
});

test("OpenPackCursorTimedAttackSpeedPercent applies the raw fifteen percent rate to the volley recharge", () => {
  const s = cursor(rapier);
  openPack(s);
  s.send({ kind: "tap", position: { x: 100, y: 100 } });
  step(s, 3.6);
  expect(bphTapStrikeView(s.ctx).charges).toBe(BPH_TAP_STRIKE.charges);
});

test("InfectedDeathSpawnTargetHero produces a real Skeleton at the dead infected monster", () => {
  const s = cursor([original("InfectedDeathSpawnTargetHero")], 0, "Hero3_WitchDoctor");
  s.ctx.applyBuff({ target: s.enemy, source: s.unit, side: "enemy", id: "Infected", duration: 5, power: 0.25, stacks: 1 });
  s.ctx.applyDamage({ target: s.enemy, amount: 1000, source: s.unit });
  const skeletons = s.ctx.run.squads[0].soldiers.filter(unit => unit.bph?.profileId === "Hero_Skeleton");
  expect(skeletons.map(unit => [unit.x, unit.y, unit.bph?.parentId])).toEqual([[100, 100, s.unit.id]]);
});

test("InfectedDeathSpreadRadius spreads the actual status only to the nearest living monster within one original unit", () => {
  const s = cursor([original("InfectedDeathSpreadRadius")], 0, "Hero3_WitchDoctor");
  const nearby = { ...s.enemy, id: s.ctx.run.nextId++, x: 100 + BPH_WORLD_TO_PX * 0.9 };
  const outside = { ...s.enemy, id: s.ctx.run.nextId++, x: 100 + BPH_WORLD_TO_PX * 1.1 };
  s.ctx.run.enemies.push(nearby, outside);
  s.ctx.applyBuff({ target: s.enemy, source: s.unit, side: "enemy", id: "Infected", duration: 5, power: 0.25, stacks: 1 });
  s.ctx.applyDamage({ target: s.enemy, amount: 1000, source: s.unit });
  expect(s.ctx.state.statuses.filter(status => status.targetId !== s.enemy.id).map(status => status.targetId)).toEqual([nearby.id]);
});

test("TreantSeedFortifiedCastSpell queues the authored beam only when the real Fortify application finds an existing shield", () => {
  const s = scenario([original("TreantSeedFortifiedCastSpell")], "Hero5_Treant"), target = s.ctx.run.squads[0];
  const buff = { target, source: s.unit, side: "ally" as const, id: "Fortify", duration: Infinity, power: 0, stacks: 1 };
  s.ctx.applyBuff(buff); s.ctx.applyBuff(buff);
  expect(s.ctx.state.spells.map(spell => spell.id)).toEqual(["Spell_BeamOfLight"]);
});

test.each([[100, 1000 - BPH_TAP_STRIKE.damage], [500, 1000]] as const)(
  "the native combat loop lands a tap at x=%s on its own spot, and the pointer alone never deals damage", (x, hp) => {
    const s = cursor([]);
    s.ctx.run.squads = []; s.enemy.stun = 100;
    updateBphPointer(s.ctx.run, { x: 100, y: 100 });
    expect(tapBphStrike(s.ctx.run, { x, y: 100 })).toBe(true);
    for (let i = 0; i < 11; i++) advance(s.ctx.run, 0.1);
    expect(s.enemy.hp).toBe(hp);
  });

test("STATUS executes a directly added lightning book once while retaining its native display slot", () => {
  const s = cursor([]);
  // This one-target spell contract must not split its bolts across incoming waves.
  s.ctx.run.bph!.survival!.cursor = bphSurvivalPlan("WaveChapter1").length;
  s.ctx.pointer.x = 0; s.ctx.pointer.y = 0; s.ctx.run.squads = []; s.enemy.stun = 100;
  addBphProfile(s.ctx.run, { profileId: "Tome_Thunderstorm", copies: 1, foil: false, discovered: false }, { packId: "Pack1_Basic" });
  aimBphTactic(s.ctx.run, s.enemy);
  for (let i = 0; i < 11; i++) advance(s.ctx.run, 0.1);
  expect(s.enemy.hp).toBe(997);
  expect(s.ctx.run.bph?.tomes.map(tome => [tome.id, tome.stacks])).toEqual([["Tome_Thunderstorm", 1]]);
});

test("drawn tactics are the cursor together: each acts only while pointed on its own rate, holds the tap, a redraw lengthens it", () => {
  const s = cursor([]);
  s.ctx.run.squads = []; s.enemy.stun = 0;
  const thunder = Number(BPH_TOMES.Tome_Thunderstorm.raw.buffDuration), quake = Number(BPH_TOMES.Tome_Earthquake.raw.buffDuration);
  s.send(openedTome("Tome_Thunderstorm")); s.send(openedTome("Tome_Earthquake"));
  expect(bphTacticCursorView(s.ctx)).toMatchObject({ ids: ["Tome_Thunderstorm", "Tome_Earthquake"],
    radius: Math.max(BPH_CURSOR_TACTICS.Tome_Thunderstorm.radius(), BPH_CURSOR_TACTICS.Tome_Earthquake.radius()) });
  step(s, 3);
  expect([s.enemy.hp, s.enemy.stun]).toEqual([1000, 0]);
  s.send({ kind: "tap", position: { x: 100, y: 100 } });
  expect(s.ctx.state.strikes).toHaveLength(0);
  // After a rest both are ready: the first pointed step fires the bolts and the shockwave together.
  s.send({ kind: "aim", position: { x: 100, y: 100 } });
  step(s, 0.01);
  const bolt = BPH_TOMES.Tome_Thunderstorm.casts * 1.5;
  expect(s.enemy.hp).toBe(1000 - bolt - 2);
  expect(s.enemy.stun).toBeGreaterThan(1);
  step(s, 1);
  expect(s.enemy.hp).toBe(1000 - 2 * bolt - 2);
  s.send({ kind: "aim", position: null });
  s.send(openedTome("Tome_Thunderstorm"));
  expect(s.ctx.state.timers["status:tome:1:Tome_Thunderstorm:until"]).toBeCloseTo(2 * thunder);
  step(s, quake - s.ctx.run.time + 0.01);
  expect(bphTacticCursorView(s.ctx)?.ids).toEqual(["Tome_Thunderstorm"]);
  step(s, 2 * thunder - s.ctx.run.time + 0.01);
  expect(bphTacticCursorView(s.ctx)).toBeNull();
  s.send({ kind: "tap", position: { x: 100, y: 100 } });
  expect(s.ctx.state.strikes).toHaveLength(1);
});

// These tests protect the visible unresolved-effect contract, not gameplay implementation.
test.each([
  "ChapterFog",
  "FogCursorTowerLightRadius",
  "FogSpectralsEmitLight",
  "FogUnopenedPacksEmitLight",
  "FrozenSlideBossMaxHpDamage",
  "FrozenSlideMaxHpDamage",
  "HeroDamageFreezeIntoIceCubeChance",
  "HeroDeathSummonSpectralChance",
  "HeroSpellCastApplyStatusChance",
  "HeroSpellCastSpeed",
  "IceCubeExtraHits",
  "IceCubeSlideSpeed",
  "PackSpawnFrozen",
  "SpectralHpDrainReduction",
  "SpectralPactHpLossReduction",
  "SpellSurgeMasteryBonusPercent",
  "StatusEffectPowerBonus",
  "TargetSpellBounce",
  "TargetSpellPiercerHitRetainRateBonus",
  "TeleporterAoeHitApplyStatusChance",
  "ThunderboltApplyStatus",
  "TomeExtraStacks",
])("%s reports an unresolved effect through the dispatcher instead of silently doing nothing", kind => {
  const s = scenario([original(kind)]);
  expect(s.ctx.state.counters[`status:unconfirmed:${kind}`]).toBe(1);
  expect(s.output.filter(effect => effect.kind === "event").length).toBe(1);
});

// These effects now have battle regression coverage in bph-relic-status-fix.test.ts.
test.each([
  "CursorDpsApplyStatusChance", "CursorDpsEveryNthFreezeIntoIceCube",
  "ElectrifyChainDamagePercent", "ElectrifyExtraChainJumps", "FirstTargetSpawnAdditionalTome",
])("%s is implemented and does not report an unresolved effect", kind => {
  const s = scenario([original(kind)]);
  expect(s.ctx.state.counters[`status:unconfirmed:${kind}`]).toBeUndefined();
  expect(s.output.filter(effect => effect.kind === "event").length).toBe(0);
});
