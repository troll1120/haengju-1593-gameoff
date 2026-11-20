import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { grantBphRelic, equipBphRelic } from "./bph-account";
import { freshBphSave } from "./bph-save";
import { activeBphEffects, BPH_PLACEMENTS, prepareBphUpgrades } from "./bph-upgrades";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { BPH_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";
import { bindBphConsumers, bphFxContext, bphTapStrike, dispatchBphEffects } from "./bph-fx-dispatch";
import { BPH_TAP_STRIKE } from "./bph-tap-strike";
import { bphStats, hitBphPack } from "./bph-combat";
import { createBphRun } from "./bph-session";
import { createBphShop } from "./bph-shop";
import { BPH_RECRUIT_TABLE, bphRecruitMultiplier, buyBphRecruit } from "./bph-recruit";
import { freshMeta } from "./meta";
import { advance, createRun } from "./rules";
import type { Run, Unit } from "./rules";
import { CENTER, HEIGHT, setFieldSize, WIDTH } from "./geometry";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { bphRecruitControlHashes as baseline } from "./bph-recruit-control-fixture";
let previousSize: [number, number];
beforeEach(() => { previousSize = [WIDTH, HEIGHT]; });
afterEach(() => setFieldSize(...previousSize));

const relics = ["Relic1_CharmWarrior", "Relic1_Rapier", "Relic1_FourLeafClover",
  "Relic2_Nature_TalkingBeet", "Relic1_GiantsMight", "Relic1_Club",
  "R_HeroMoveSpeed", "Relic1_TomeDuration", "R_AutomaticBallista"] as const;

function fixture(id: string, equipped: boolean, roll = 0.5) {
  const meta = freshMeta(), save = freshBphSave(1593);
  expect(grantBphRelic(save, id)).toBe(true);
  if (equipped) expect(equipBphRelic(save, id)).toBe(true);
  meta.bph = save;
  const effects = activeBphEffects(save);
  const run = createBphRun(meta, { seed: 1593, general: "권율", upgrades: effects });
  const native = bphFxContext(run);
  if (!native || !run.bph) throw new Error("Missing native battle context");
  const ctx = { ...native, random: () => roll };
  bindBphConsumers(ctx, undefined, false);
  return { run, save, ctx };
}
type Fixture = ReturnType<typeof fixture>;
function spawn(f: Fixture, id = "Hero1_Squire") {
  const index = f.run.squads[0].soldiers.length;
  f.ctx.spawnProfile(id, 1, { packId: "Pack1_Basic", cause: "pack" });
  const unit = f.run.squads[0].soldiers[index];
  if (!unit) throw new Error("Missing spawned hero");
  return unit;
}
function stats(f: Fixture, unit: Unit) {
  const result = bphStats(unit, f.run);
  if (!result) throw new Error("Missing hero stats");
  return result;
}
function step(f: Fixture, dt: number) {
  f.run.time += dt;
  dispatchBphEffects(f.run, { kind: "step", dt });
}
function target(f: Fixture) {
  const seed = createRun(4).enemies[0];
  const enemy = { ...seed, id: f.run.nextId++, x: 100, y: 100,
    hp: 1000, maxHp: 1000, shielded: false, boss: false, stun: 0, speed: 0,
    kind: "yari" as const };
  f.run.enemies = [enemy];
  f.ctx.pointer.x = f.ctx.pointer.y = 100;
  return enemy;
}
function open(f: Fixture, packId = "Pack1_Basic") {
  f.ctx.grantPack(packId, 1);
  const pack = f.save.inventory.at(-1);
  if (!pack) throw new Error("Missing granted pack");
  hitBphPack(f.run, pack.id);
  return hitBphPack(f.run, pack.id);
}

test("equipped Swift Boots multiplies native hero move speed by 1.3", () => {
  const plain = fixture("R_HeroMoveSpeed", false), worn = fixture("R_HeroMoveSpeed", true);
  const before = stats(plain, spawn(plain)).moveSpeed, after = stats(worn, spawn(worn)).moveSpeed;
  expect(after).toBeCloseTo(before * 1.300000011920929, 10);
});
test("equipped War Trumpet duplicates only the first two warriors", () => {
  const counts = [false, true].map(equipped => {
    const f = fixture("Relic1_CharmWarrior", equipped);
    spawn(f, "Hero1_Archer");
    const result = [];
    for (let i = 0; i < 3; i++) { spawn(f); result.push(f.run.squads[0].soldiers.length); }
    return result;
  });
  expect(counts).toEqual([[2, 3, 4], [3, 5, 6]]);
});
test("equipped Giants Might uses the 10 percent boundary and adds 40 percent giant damage", () => {
  for (const roll of [0.099999, 0.10000000149011612]) {
    const plain = fixture("Relic1_GiantsMight", false, roll);
    const worn = fixture("Relic1_GiantsMight", true, roll);
    const control = spawn(plain), unit = spawn(worn), giant = roll < 0.1;
    expect(control.bph?.giant).toBe(false);
    expect(unit.bph?.giant).toBe(giant);
    expect(stats(worn, unit).damage).toBeCloseTo(stats(plain, control).damage *
      (giant ? 1.4000000059604645 : 1), 10);
  }
});
test("equipped Clover raises chance thresholds by 33 percent without changing random draws", () => {
  const plain = fixture("Relic1_FourLeafClover", false, 0.12);
  const worn = fixture("Relic1_FourLeafClover", true, 0.12);
  expect(plain.ctx.chance(0.1)).toBe(0.1);
  expect(worn.ctx.chance(0.1)).toBeCloseTo(0.13300000131130219, 12);
  expect([plain.ctx.random() < plain.ctx.chance(0.1), worn.ctx.random() < worn.ctx.chance(0.1)]).toEqual([false, true]);
  expect(worn.ctx.chance(0.9)).toBe(1);
});
test("equipped Talking Beet shares one identical timed buff without recursion", () => {
  for (const equipped of [false, true]) {
    const f = fixture("Relic2_Nature_TalkingBeet", equipped, 0);
    const source = spawn(f), other = spawn(f, "Hero1_Archer");
    f.ctx.applyBuff({ target: source, side: "ally", id: "Haste", duration: 5, power: 50, stacks: 1 });
    expect(f.ctx.state.statuses.map(s => [s.targetId, s.id, s.until, s.power, s.stacks]))
      .toEqual((equipped ? [source, other] : [source]).map(unit => [unit.id, "Haste", 5, 50, 1]));
  }
});
test("equipped Club doubles every third real tap-strike volley and stuns for 0.8 seconds", () => {
  for (const equipped of [false, true]) {
    const f = fixture("Relic1_Club", equipped), enemy = target(f), hp = [], d = BPH_TAP_STRIKE.damage;
    for (let i = 0; i < 3; i++) {
      dispatchBphEffects(f.run, { kind: "tap", position: enemy }); step(f, BPH_TAP_STRIKE.travelSeconds); hp.push(enemy.hp);
    }
    expect(hp).toEqual(equipped ? [1000 - d, 1000 - 2 * d, 1000 - 4 * d] : [1000 - d, 1000 - 2 * d, 1000 - 3 * d]);
    expect(enemy.stun).toBe(equipped ? 0.800000011920929 : 0.08);
  }
});
test("equipped Bag of Books extends a real Raise Dead activation from 12 to 15.6 seconds", () => {
  for (const equipped of [false, true]) {
    const f = fixture("Relic1_TomeDuration", equipped);
    f.ctx.spawnProfile("Tome_RaiseDead", 1, { packId: "Pack_Tomes", cause: "pack" });
    step(f, 0);
    const until = Object.entries(f.ctx.state.timers).find(([key]) => key.endsWith("Tome_RaiseDead:until"))?.[1];
    expect(until).toBeCloseTo(equipped ? 15.600000143051147 : 12, 10);
    f.run.time = 14; dispatchBphEffects(f.run, { kind: "step", dt: 3 });
    expect(f.run.squads[0].soldiers.filter(unit => unit.bph?.profileId === "Hero_Skeleton")).toHaveLength(equipped ? 3 : 0);
  }
});
test.each([1, 3, 4])("equipped Rapier speeds the tap-strike recharge 15 percent per opening with three stack cap (%s opens)", count => {
  for (const equipped of [false, true]) {
    const f = fixture("Relic1_Rapier", equipped), enemy = target(f);
    for (let i = 0; i < count; i++) open(f);
    const stacks = equipped ? Math.min(count, 3) : 0;
    expect(Object.entries(f.ctx.state.timers).filter(([key]) => key.startsWith("status:rapier:")).map(([, until]) => until))
      .toEqual(Array(stacks).fill(8));
    const charges = () => bphTapStrike(f.run)?.charges;
    const recharge = BPH_TAP_STRIKE.rechargeSeconds / (1 + stacks * 0.15000000596046448);
    dispatchBphEffects(f.run, { kind: "tap", position: enemy });
    expect(charges()).toBe(BPH_TAP_STRIKE.charges - 1);
    step(f, recharge - 0.000001); expect(charges()).toBe(BPH_TAP_STRIKE.charges - 1);
    step(f, 0.000002); expect(charges()).toBe(BPH_TAP_STRIKE.charges);
    f.run.time = 8; dispatchBphEffects(f.run, { kind: "tap", position: enemy });
    dispatchBphEffects(f.run, { kind: "step", dt: BPH_TAP_STRIKE.rechargeSeconds - 0.1 });
    expect(charges()).toBe(BPH_TAP_STRIKE.charges - 1);
    dispatchBphEffects(f.run, { kind: "step", dt: 0.100001 });
    expect(charges()).toBe(BPH_TAP_STRIKE.charges);
  }
});
test("equipped Auto Crossbow doubles the keep's HP", () => {
  for (const equipped of [false, true]) expect(fixture("R_AutomaticBallista", equipped).run.maxBase)
    .toBe(BPH_SURVIVAL_TABLE.keepHp * (equipped ? 2 : 1));
});
test("zero equipped relics retain exactly purchased-placement effects for fresh and owned saves", async () => {
  await prepareBphUpgrades();
  const save = freshBphSave();
  expect(activeBphEffects(save)).toEqual([]);
  for (const id of relics) grantBphRelic(save, id);
  expect(activeBphEffects(save)).toEqual([]);
  const placements = [...BPH_PLACEMENTS.values()].filter(p => p.nodeId &&
    BPH_UPGRADE_NODES[p.nodeId]?.type === 0 && !BPH_HIDDEN_UPGRADES.has(p.nodeId)).slice(0, 3);
  expect(placements).toHaveLength(3);
  save.purchasedPlacements = placements.map(p => p.id);
  const expected = placements.flatMap(p => {
    if (!p.nodeId) throw new Error("Purchased placement lacks a node");
    return BPH_UPGRADE_NODES[p.nodeId].effects.map(effect =>
      ({ ...effect, targets: { ...effect.targets, placementId: p.id } }));
  });
  expect(activeBphEffects(save)).toEqual(expected);
});

const hash = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
/** The recorded hashes predate the account kill tally, so it is left out of the pinned bytes. */
function serialize(run: Run, combatOnly = false, legacyOwnership = false) {
  return JSON.stringify({ ...run, bph: { ...run.bph, bought: undefined } },
    (key, value) => key === "killTally" || key === "medalScale" || key === "unitUpgrades" || combatOnly && key === "relicState" ? undefined
      : legacyOwnership && key === "relicState" ? { ...value, owned: ["Relic1_CharmWarrior"] } : value);
}
function seeded(owned: readonly string[], equipped: readonly string[], seed = 1, zeroStages = false) {
  setFieldSize(370, 800);
  const meta = freshMeta(), save = freshBphSave();
  if (zeroStages) save.unitUpgrades.Hero1_Squire = { attack: 0, attackSpeed: 0, health: 0, special: 0 };
  for (const id of owned) grantBphRelic(save, id);
  for (const id of equipped) expect(equipBphRelic(save, id)).toBe(true);
  meta.bph = save;
  const upgrades = activeBphEffects(save), run = createBphRun(meta, { seed, general: "권율", upgrades });
  const shop = createBphShop(save, upgrades);
  for (let i = 0; i < 20; i++) advance(run, 0.05);
  const pack = buyBphRecruit(run, shop, 0, BPH_RECRUIT_TABLE);
  if (!pack || !run.bph) throw new Error("Missing native recruit purchase");
  run.bph.packs.push({ ...pack, hp: 1, x: CENTER.x, y: CENTER.y + 70 });
  hitBphPack(run, pack.id);
  for (let i = 0; i < 600; i++) advance(run, 0.05);
  return run;
}
test("owned but unworn relics leave seeded combat bytes identical while a worn one changes them", () => {
  const plain = seeded([], []), owned = seeded(relics, []), worn = seeded(relics, ["R_AutomaticBallista"]);
  expect(hash(serialize(owned, true))).toBe(hash(serialize(plain, true)));
  expect(hash(serialize(worn, true))).not.toBe(hash(serialize(plain, true)));
});
test("a run with no relic worn matches the survival v3 recruit control hashes", () => {
  const seeds = Object.entries(baseline).filter(([seed]) => bphRecruitMultiplier(Number(seed), 0) === 1);
  expect(seeds.length).toBeGreaterThan(0);
  for (const [seed, expected] of seeds) {
    const run = seeded([], [], Number(seed));
    expect(run.bph?.save.relicState.owned).toEqual([]);
    // Restore only the old auto-grant field to check the original byte pin.
    expect(hash(serialize(run, false, true))).toBe(expected);
  }
});
test("explicit zero unit stages preserve seeded combat hashes", () => {
  for (const seed of [1, 3, 9]) {
    expect(hash(serialize(seeded([], [], seed, true)))).toBe(hash(serialize(seeded([], [], seed))));
  }
});
