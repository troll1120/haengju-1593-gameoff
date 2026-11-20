import { afterAll, beforeAll, expect, test } from "bun:test";
import { BPH_GENERALS } from "./bph-commanders";
import type { BphGeneral } from "./bph-commanders";
import type { BphEffect } from "./bph-contract";
import { bphHireSlots } from "./bph-join";
import { freshBphSave, parseBphSave } from "./bph-save";
import { createBphRun } from "./bph-session";
import { bphSurvivalPlan } from "./bph-survival";
import { raiseChaosLevel } from "./chaos-growth";
import { chaosVolley } from "./chaos-projectiles";
import { chaosEnemy } from "./chaos-test-fixture";
import { reachLevel } from "./general-reach";
import { contains, fortGates, fortRect, onGateLine, setFieldSize } from "./geometry";
import { freshMeta } from "./meta";
import { advance, BALANCE, generalHandOpen, hireBphGeneral, useSkill } from "./rules";
import type { Run } from "./rules";
import { growthFor } from "./skill-growth";

beforeAll(() => setFieldSize(370, 800));
afterAll(() => setFieldSize(390, 650));

const purchases = (count: number): BphEffect[] => Array.from({ length: count }, (_, index) => ({
  nodeId: `join:${index}`, type: "HeroAttackPower", value: .02, effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0,
  targets: { placementId: `join:${index}`, nodeType: "0", targetClass: "0" },
}));
function battle(unlocked: readonly BphGeneral[], seed = 7, upgrades: BphEffect[] = []): Run {
  const meta = freshMeta();
  meta.bph = freshBphSave(seed);
  meta.bph.unlockedGenerals = [...unlocked];
  const run = createBphRun(meta, { seed, general: "권율", upgrades });
  if (run.bph?.survival) run.bph.survival.cursor = bphSurvivalPlan(run.bph.waveId).length;
  return run;
}
function hire(run: Run) {
  run.gold = bphHireSlots(run)[0].price;
  return hireBphGeneral(run, 0);
}

test("neither former join time opens a hand or enlists a general without payment", () => {
  const run = battle(BPH_GENERALS);
  run.gold = 10000;
  for (const time of [170, 350]) {
    run.time = time - .04;
    advance(run, .05);
    expect(run.time).toBeGreaterThan(time);
    expect(generalHandOpen(run)).toBe(false);
    expect(run.squads.map(squad => squad.general)).toEqual(["권율"]);
    expect(bphHireSlots(run).map(slot => slot.status)).toEqual(["available", "available"]);
  }
  expect(run.phase).toBe("playing");
  expect(run.metrics.generalTimes).toEqual([]);
});

test("buying the selected slot deducts its price once without consuming battle or account RNG", () => {
  const run = battle(BPH_GENERALS), rng = run.rng, account = run.bph?.save.rng;
  const price = bphHireSlots(run)[1].price;
  run.gold = price - 1;
  expect(hireBphGeneral(run, 1)).toEqual([]);
  expect(run.gold).toBe(price - 1);
  run.gold = price;
  expect(hireBphGeneral(run, 1)).toEqual([expect.objectContaining({ kind: "join", squad: 1 })]);
  expect(run.gold).toBe(0);
  expect(bphHireSlots(run)[1]).toMatchObject({ status: "joined", general: run.squads[1].general });
  expect(bphHireSlots(run)[0].status).toBe("unaffordable");
  run.gold = price;
  expect(hireBphGeneral(run, 1)).toEqual([]);
  expect(run.gold).toBe(price);
  expect(run.rng).toBe(rng);
  expect(run.bph?.save.rng).toBe(account);
});

test("the two purchases sample only unused quest-unlocked generals and the first pick varies with seed", () => {
  const unlocked = ["권율", "신립", "황진"] as const;
  const firstPicks = new Set<BphGeneral>();
  for (let seed = 1; seed <= 20; seed++) {
    const run = battle(unlocked, seed);
    const price = bphHireSlots(run).reduce((sum, slot) => sum + slot.price, 0);
    run.gold = price;
    hireBphGeneral(run, 0);
    const first = bphHireSlots(run)[0].general;
    if (first === undefined) throw new Error("First hire did not join");
    firstPicks.add(first);
    hireBphGeneral(run, 1);
    expect(run.gold).toBe(0);
    expect(run.squads.map(squad => squad.general).sort()).toEqual([...unlocked].sort());
    expect(hireBphGeneral(run, 2)).toEqual([]);
  }
  expect(firstPicks).toEqual(new Set(["신립", "황진"]));
});

test("no remaining eligible general locks the empty slots even with ample gold", () => {
  const alone = battle(["권율"]), one = battle(["권율", "신립"]);
  alone.gold = 10000;
  expect(bphHireSlots(alone).map(slot => slot.status)).toEqual(["locked", "locked"]);
  expect(hireBphGeneral(alone, 0)).toEqual([]);
  expect(alone.gold).toBe(10000);
  expect(alone.squads).toHaveLength(1);
  hire(one);
  one.gold = 10000;
  expect(bphHireSlots(one).map(slot => slot.status)).toEqual(["joined", "locked"]);
  expect(hireBphGeneral(one, 1)).toEqual([]);
  expect(one.gold).toBe(10000);
  expect(one.squads.map(squad => squad.general)).toEqual(["권율", "신립"]);
});

test("a hired general comes alone, ready to cast, and walks out through a gate", () => {
  const run = battle(["권율", "황진"]), wall = fortRect(run.fort);
  const [entry] = hire(run), squad = run.squads[1];
  expect(entry).toMatchObject({ kind: "join", squad: 1 });
  expect(squad.general).toBe("황진");
  expect(squad.soldiers).toEqual([]);
  expect(squad.skillClock).toBe(0);
  expect(run.metrics.generalTimes).toEqual([run.time]);
  expect(contains(wall, squad)).toBe(true);
  const meta = freshMeta();
  expect(squad.maxHp).toBe(createBphRun(meta, { seed: 7, general: "황진", upgrades: [] }).squads[0].maxHp);
  let exit: { x: number; y: number } | null = null;
  for (let tick = 0; tick < 180 && !exit; tick++) {
    advance(run, 1 / 30);
    if (!contains(wall, squad)) exit = { x: squad.x, y: squad.y };
  }
  if (!exit) throw new Error("Hired general did not leave the fort");
  expect(fortGates(true).some(side => onGateLine(run.fort, side, exit))).toBe(true);
});

test("a hired general's skill button fires his own skill with his own purchase tier", () => {
  const run = battle(["권율", "황진"], 7, purchases(3));
  hire(run);
  const squad = run.squads[1];
  chaosEnemy(run, squad.x + 20, squad.y);
  const tier = growthFor("황진", run);
  expect(tier.tier).toBe(2);
  const cast = useSkill(run, 1);
  expect(cast.find(effect => effect.kind === "skill")).toMatchObject({ squad: 1, value: 95 + tier.mods.radiusBonus });
  expect(squad.skillClock).toBe(BALANCE.cooldown.황진);
  expect(run.metrics.skills[1]).toBe(1);
});

test("a hired general casts and reaches at the level the run has earned", () => {
  const run = battle(["권율", "이순신"], 7, purchases(20));
  advance(run, .05);
  const chaos = run.chaos;
  if (!chaos) throw new Error("Missing run growth state");
  raiseChaosLevel(chaos, 3);
  hire(run);
  const squad = run.squads[1];
  expect(growthFor("이순신", run).level).toBe(20);
  expect(reachLevel(run)).toBe(3);
  chaosEnemy(run, squad.x + 20, squad.y);
  useSkill(run, 1);
  const cast = run.chaosSkills?.events.filter(event => event.squad === 1) ?? [];
  expect(cast.length).toBeGreaterThan(0);
  expect(cast.map(event => event.level)).toEqual(cast.map(() => 3));
});

test("only the starter grows an army and fires the starter's volley", () => {
  const run = battle(["권율", "황진"], 7, purchases(5));
  advance(run, .05);
  hire(run);
  expect(run.chaos?.general).toBe("권율");
  expect(Object.keys(run).filter(key => key.startsWith("chaos"))).toEqual(["chaos"]);
  const enemy = chaosEnemy(run, run.squads[1].x + 20, run.squads[1].y), shots = run.shots.length;
  chaosVolley(run, { squad: run.squads[1], unit: run.squads[1], index: -1, target: enemy, amount: 10, critical: false, reach: 60 });
  expect(run.shots).toHaveLength(shots);
  run.squads[0].x = enemy.x - 20; run.squads[0].y = enemy.y;
  chaosVolley(run, { squad: run.squads[0], unit: run.squads[0], index: -1, target: enemy, amount: 10, critical: false, reach: 60 });
  expect(run.shots.length).toBeGreaterThan(shots);
});

test("reloading keeps codex discovery but resets the slot, reproducing the same seeded hire", () => {
  const meta = freshMeta(), save = meta.bph = freshBphSave(9);
  save.unlockedGenerals = [...BPH_GENERALS];
  save.discovered = ["general:권율"];
  const run = createBphRun(meta, { seed: 9, general: "권율", upgrades: [] });
  hire(run);
  const general = run.squads[1].general;
  const reloaded = freshMeta();
  reloaded.bph = parseBphSave(JSON.parse(JSON.stringify(save)));
  expect(reloaded.bph.discovered).toContain(`general:${general}`);
  const again = createBphRun(reloaded, { seed: 9, general: "권율", upgrades: [] });
  expect(again.squads).toHaveLength(1);
  expect(bphHireSlots(again)[0].general).toBeUndefined();
  hire(again);
  expect(again.squads[1].general).toBe(general);
});
