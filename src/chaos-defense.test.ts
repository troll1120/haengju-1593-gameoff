import { expect, test } from "bun:test";
import { chaosArena, chaosEnemy, chaosTicks } from "./chaos-test-fixture";
import { CENTER, fortRect } from "./geometry";
import { bphEffectCombat, useSkill } from "./rules";
import { BPH_MONSTERS } from "./bph-data";
import type { Effect } from "./rules";
import { bphConsumers, bindBphConsumers, bphFxContext } from "./bph-fx-dispatch";
import { subscribeDefensePressure } from "./defense-pressure";
import type { DefensePressure } from "./defense-pressure";
import { chaosState } from "./chaos-state";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { addBphProfile } from "./bph-combat";

test.each([[0, 1], [10, 1], [20, 1]])("Kim N%i leaves an actual castle strike unreduced and accounts for it once", (level, factor) => {
  const run = chaosArena("김시민", level), wall = fortRect(run.fort);
  const squad = run.squads[0];
  squad.x = squad.targetX = 20; squad.y = squad.targetY = 500;
  const enemy = chaosEnemy(run, CENTER.x, wall.top - 8);
  enemy.clock = 0; enemy.bphProfileId = "Monster1_Caveling";
  const raw = BPH_MONSTERS.Monster1_Caveling.towerDamage;
  // The palisade side holds 100 scaled spearman hits, less than this unscaled strike; keep the strike whole.
  run.walls.위 = raw * 2;
  const before = run.walls.위;
  const events: DefensePressure[] = [];
  const unsubscribe = subscribeDefensePressure(run, event => events.push(event));
  chaosTicks(run, 1);
  expect(before - run.walls.위).toBeCloseTo(raw * factor);
  expect(events).toEqual([{ kind: "castle", incoming: raw, prevented: expect.closeTo(raw * (1 - factor)) }]);
  unsubscribe();
  expect(run.chaos?.level).toBe(Math.max(1, level));
  expect(run.chaos?.defense).toEqual({
    unitIncoming: 0, unitPrevented: 0, castleIncoming: raw, castlePrevented: raw * (1 - factor),
  });
});

test("Kim's manual cannon cast neither shields allies nor blocks incoming damage", () => {
  const run = chaosArena("김시민", 20), squad = run.squads[0], effects: Effect[] = [];
  squad.hp = 100; squad.maxHp = 100;
  useSkill(run, 0);
  expect(run.shieldUntil).toBe(0);
  expect(run.chaosSkills?.events[0].kind).toBe("cannon");
  bphEffectCombat(run, effects).applyUnitDamage({ target: squad, amount: 10 });
  expect(squad.hp).toBe(90);
  expect(run.chaos?.defense?.unitIncoming).toBe(10);
  expect(run.chaos?.defense?.unitPrevented).toBe(0);
  expect(run.metrics.blocked).toBe(0);
});

test("Kim's cannon growth grants no castle protection while the commander is down", () => {
  const run = chaosArena("김시민", 20), wall = fortRect(run.fort), squad = run.squads[0];
  squad.hp = 0; squad.state = "down"; squad.downUntil = run.time + 100;
  const enemy = chaosEnemy(run, CENTER.x, wall.top - 8);
  enemy.clock = 0; enemy.bphProfileId = "Monster1_Caveling";
  const raw = BPH_MONSTERS.Monster1_Caveling.towerDamage;
  run.walls.위 = raw * 2; // Room for the whole unscaled strike above the palisade side's HP.
  const before = run.walls.위;
  chaosTicks(run, 1);
  expect(before - run.walls.위).toBeCloseTo(raw);
  expect(run.chaos?.defense?.castlePrevented).toBe(0);
});

test("Kim preserves upgrade damage reduction hooks while adding no skill protection", () => {
  const run = chaosArena("김시민", 20), squad = run.squads[0], effects: Effect[] = [];
  const context = bphFxContext(run);
  if (!context) throw new Error("Missing native effects context");
  bindBphConsumers(context, [...bphConsumers(), {
    id: "quests", kinds: [],
    onEvent: (_ctx, event) => {
      if (event.kind === "before-unit-damage") event.hit.amount *= .5;
    },
    consume: () => { throw new Error("Observer cannot consume effects"); },
  }], false);
  squad.maxHp = 100; squad.hp = 100;
  useSkill(run, 0);
  bphEffectCombat(run, effects).applyUnitDamage({ target: squad, amount: 10 });
  expect(squad.hp).toBe(95);
  expect(run.chaos?.defense?.unitIncoming).toBe(5);
  expect(run.chaos?.defense?.unitPrevented).toBe(0);
  expect(run.metrics.blocked).toBe(0);
});

test("a purchased HeroDamageReduction still reduces real soldier damage after Kim fires cannons", () => {
  const run = createBphRun(freshMeta(), { seed: 144, general: "김시민", startBattle: false, upgrades: [{
    nodeId: "_SN_AllHeroes_DamageReduction", type: "HeroDamageReduction", value: .25,
    effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0,
    targets: { placementId: "defense:1", nodeType: "0", targetClass: "0" },
  }] });
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 1, foil: false, discovered: false }, { packId: "DeliveryBox" });
  const squad = run.squads[0], unit = squad.soldiers[0];
  unit.hp = unit.maxHp = 100; squad.skillClock = 0;
  useSkill(run, 0);
  bphEffectCombat(run, []).applyUnitDamage({ target: unit, amount: 10 });
  expect(unit.hp).toBeCloseTo(92.5);
  expect(run.shieldUntil).toBe(0);
  expect(run.chaos?.defense?.unitPrevented).toBe(0);
});

test.each([0, 10, 20])("Kim N%i reports unblocked pressure consistently before and after casting", level => {
  const run = chaosArena("김시민", level), squad = run.squads[0];
  Object.assign(squad, CENTER, { maxHp: 100, hp: 100 });
  chaosState(run);
  const events: DefensePressure[] = [];
  const unsubscribe = subscribeDefensePressure(run, event => events.push(event));
  bphEffectCombat(run, []).applyUnitDamage({ target: squad, amount: 10 });
  const reduction = 0;
  expect(squad.hp).toBeCloseTo(100 - 10 * (1 - reduction));
  expect(events).toEqual([{ kind: "unit", incoming: 10, prevented: expect.closeTo(10 * reduction) }]);
  expect(run.chaos?.level).toBe(Math.max(1, level));
  expect(run.chaos?.defense?.unitPrevented).toBeCloseTo(10 * reduction);
  useSkill(run, 0);
  bphEffectCombat(run, []).applyUnitDamage({ target: squad, amount: 10 });
  expect(events[1]).toEqual({ kind: "unit", incoming: 10, prevented: 0 });
  unsubscribe();
  bphEffectCombat(run, []).applyUnitDamage({ target: squad, amount: 10 });
  expect(events).toHaveLength(2);
});

test.each([[0, 1], [2, 1], [0, 1.077], [2, 1.077 ** 8]])(
  "Kim N20 awakening %i with charge %f never creates shield time at any awakening or charge speed",
  (awakened, charge) => {
    const run = chaosArena("김시민", 20), squad = run.squads[0];
    run.meta.skillCharge = charge;
    Object.assign(squad, CENTER, { awakened, hp: 100, maxHp: 100 });
    useSkill(run, 0);
    expect(run.shieldUntil).toBe(0);
    chaosTicks(run, 1);
    expect(squad.skillClock).toBeGreaterThan(0);
    const before = squad.hp;
    bphEffectCombat(run, []).applyUnitDamage({ target: squad, amount: 10 });
    expect(before - squad.hp).toBeCloseTo(10);
  },
);
