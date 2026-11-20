import { expect, test } from "bun:test";
import type { BphFxContext, BphFxEvent } from "./bph-contract";
import { addBphProfile, bphStats, bphUnitInfo, createBphBattle } from "./bph-combat";
import { BPH_TOMES } from "./bph-data";
import { bindBphConsumers, dispatchBphEffects, freshBphFxState } from "./bph-fx-dispatch";
import { BPH_STATUS_CONSUMERS } from "./bph-fx-status";
import { freshBphSave } from "./bph-save";
import { BPH_TAP_STRIKE } from "./bph-tap-strike";
import { BPH_WITHHELD_TOMES } from "./bph-tome-availability";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { activeBphEffects } from "./bph-upgrades";
import { bphEffectCombat, createRun, fit } from "./rules";
import type { Effect } from "./rules";

function battle(relic: string, roll = 0) {
  const save = freshBphSave();
  save.relicState.equipped = [relic];
  const effects = activeBphEffects(save);
  expect(effects.length).toBeGreaterThan(0);
  const run = createRun(144), output: Effect[] = [];
  run.bph = createBphBattle(save, effects, "WaveChapter1");
  const enemy = run.enemies[0];
  Object.assign(enemy, { hp: 1000, maxHp: 1000, x: 100, y: 100, kind: "yari", boss: false, shielded: false, stun: 0 });
  run.enemies = [enemy];
  const ctx: BphFxContext = {
    run, save, effects, state: freshBphFxState(), pointer: { x: 100, y: 100 },
    ...bphEffectCombat(run, output),
    random: () => roll,
    profileId: unit => unit.bph?.profileId ?? null,
    unitInfo: bphUnitInfo,
    spawnProfile: (id, copies, origin) => addBphProfile(run,
      { profileId: id, copies, foil: false, discovered: false },
      origin ?? { packId: "Pack1_Basic", cause: "pack" }),
    grantPack: () => { throw new Error("Unexpected pack grant"); },
  };
  bindBphConsumers(ctx, BPH_STATUS_CONSUMERS);
  const send = (event: BphFxEvent) => dispatchBphEffects(run, event);
  const step = (dt = 0.01) => { run.time += dt; send({ kind: "step", dt }); };
  const spawn = (profile = "Hero9_BlackHole", copies = 1, packId = "Pack1_Basic") => {
    const before = new Set(run.squads.flatMap(squad => squad.soldiers).map(unit => unit.id));
    ctx.spawnProfile(profile, copies, { packId, cause: "pack" });
    return run.squads.flatMap(squad => squad.soldiers).filter(unit => !before.has(unit.id));
  };
  const volley = () => {
    ctx.state.counters["tap:charges"] = 1;
    send({ kind: "tap", position: { x: 100, y: 100 } });
    step(BPH_TAP_STRIKE.travelSeconds);
  };
  return { run, ctx, enemy, send, step, spawn, volley };
}

test("CharmArcanist activates a real tactic with each of the first two monks only", () => {
  const s = battle("Relic1_CharmArcanist", 0.999);
  s.spawn("Hero2_Pyromancer", 1, "Pack2_Advanced");
  expect(s.run.bph?.tomes).toHaveLength(0);
  s.spawn("Hero5_Beastmaster", 3, "Pack6_Forest");
  expect(s.ctx.state.counters["status:tome-serial"]).toBe(2);
  expect(s.run.bph?.tomes.map(tome => tome.id)).toEqual(["Tome_Earthquake"]);
  expect(s.run.bph?.tomes.every(tome => BPH_TOMES[tome.id])).toBe(true);
  s.send({ kind: "aim", position: s.enemy });
  s.step(2);
  expect(s.enemy.hp).toBeLessThan(1000);
});

test("CharmArcanist falls back from withheld Cosmic tactics without spending an empty allowance", () => {
  const s = battle("Relic1_CharmArcanist", 0.999);
  for (let i = 0; i < 3; i++)
    s.spawn("Hero9_BlackHole", 1, "Pack9_Cosmic");
  expect(s.ctx.state.counters["status:tome-serial"]).toBe(2);
  expect(s.run.bph!.tomes.length).toBeGreaterThan(0);
  expect(s.run.bph!.tomes.every(tome => !BPH_WITHHELD_TOMES.has(tome.id))).toBe(true);
  s.send({ kind: "aim", position: s.enemy });
  s.step(1);
  expect(s.enemy.hp).toBeLessThan(1000);
});

test("CharmMystic restores the first two monks to half health once after actual lethal damage", () => {
  const s = battle("Relic1_CharmMystic");
  const units = s.spawn("Hero9_BlackHole", 3, "Pack9_Cosmic");
  for (const unit of units) s.ctx.applyUnitDamage({ target: unit, amount: 10000, source: s.enemy });
  expect(units.every(unit => unit.hp === 0)).toBe(true);
  s.step();
  expect(units.map(unit => unit.hp)).toEqual([units[0].maxHp / 2, units[1].maxHp / 2, 0]);
  expect(units.slice(0, 2).every(unit => fit(unit, s.run.time))).toBe(true);
  s.ctx.applyUnitDamage({ target: units[0], amount: 10000, source: s.enemy });
  s.step();
  expect(units[0].hp).toBe(0);
});

test("FrozenMace freezes targets for five seconds only on the twelfth landed volley", () => {
  const s = battle("Relic4_Arctic_FrozenMace");
  for (let n = 0; n < 11; n++) s.volley();
  expect(s.ctx.state.statuses.some(status => status.id === "Frozen")).toBe(false);
  s.volley();
  expect(s.enemy.stun).toBeCloseTo(5);
  expect(s.ctx.state.statuses.find(status => status.id === "Frozen")?.until).toBe(s.run.time + 5);
});

test("FrozenMace ignores empty volleys and counts a multi-enemy volley once", () => {
  const s = battle("Relic4_Arctic_FrozenMace");
  s.enemy.x = 1000;
  for (let n = 0; n < 11; n++) s.volley();
  s.enemy.x = 100;
  const second = { ...s.enemy, id: s.run.nextId++, x: 101 };
  s.run.enemies.push(second);
  for (let n = 0; n < 11; n++) {
    s.volley();
    expect(s.ctx.state.statuses.some(status => status.id === "Frozen")).toBe(false);
  }
  s.volley();
  expect(s.enemy.stun).toBeCloseTo(5);
  expect(second.stun).toBeCloseTo(5);
});

test("ShockNeedle adds two shock damage and spreads once beyond the volley radius", () => {
  const s = battle("R_ShockNeedle", 0.09);
  const extra = { ...s.enemy, id: s.run.nextId++, x: 100 + BPH_TAP_STRIKE.radius + 10 };
  const far = { ...extra, id: s.run.nextId++, x: extra.x + 200 };
  s.run.enemies.push(extra, far);
  s.volley();
  expect(s.enemy.hp).toBeCloseTo(1000 - BPH_TAP_STRIKE.damage - 2);
  expect(extra.hp).toBe(998);
  expect(extra.stun).toBeCloseTo(0.4);
  expect(far.hp).toBe(1000);
});

test("ShockNeedle does not shock after a failed ten-percent roll", () => {
  const s = battle("R_ShockNeedle", 0.11);
  s.volley();
  expect(s.enemy.hp).toBe(1000 - BPH_TAP_STRIKE.damage);
  expect(s.enemy.stun).toBeLessThan(0.4);
});

test("Rare relic shocks only rare attackers on successful fifty-percent rolls", () => {
  const s = battle("Relic1_Rare", 0.49);
  const [rare] = s.spawn("Hero1_Barbarian");
  const [common] = s.spawn("Hero1_Squire");
  s.send({ kind: "after-attack", unit: common, target: s.enemy });
  expect(s.enemy.hp).toBe(1000);
  s.send({ kind: "after-attack", unit: rare, target: s.enemy });
  expect(s.enemy.hp).toBe(998);
  expect(s.enemy.stun).toBeCloseTo(0.4);
});

test("Rare relic does not shock after a failed fifty-percent roll", () => {
  const s = battle("Relic1_Rare", 0.51);
  const [rare] = s.spawn("Hero1_Barbarian");
  s.send({ kind: "after-attack", unit: rare, target: s.enemy });
  expect(s.enemy.hp).toBe(1000);
});

test("AutomaticBallista deals actual area damage on a castle health loss", () => {
  const s = battle("R_AutomaticBallista");
  const near = { ...s.enemy, id: s.run.nextId++, x: 120 };
  s.run.enemies.push(near);
  s.send({ kind: "towerAttacked", attacker: s.enemy, position: s.enemy, amount: 1, hpLost: 1 });
  s.step();
  expect(s.enemy.hp).toBe(999);
  expect(near.hp).toBe(999);
  s.send({ kind: "towerAttacked", attacker: s.enemy, position: s.enemy, amount: 1, hpLost: 0 });
  s.step();
  expect(s.enemy.hp).toBe(999);
});

test("spawn invisibility retains its implemented doubled attack speed for ten seconds", () => {
  const s = battle("_REMOVER_HeroSpawnInvisibility");
  const [unit] = s.spawn("Hero1_Squire");
  const fast = bphStats(unit, s.run)?.cooldown;
  s.step(10);
  expect(bphStats(unit, s.run)?.cooldown).toBeCloseTo((fast ?? 0) * 2);
});
