import { expect, test } from "bun:test";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { bphSurvivalMonster, BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { bphSurvivalPlan } from "./bph-survival";
import { advance } from "./rules";

test("E1 enemy HP is projected before the survival boss HP factor", () => {
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율",
    upgrades: BPH_UPGRADE_NODES.Mod_MonsterHpAndDamage125.effects });
  const state = run.bph?.survival;
  if (!state) throw new TypeError("Missing survival state");
  run.time = 179.95;
  state.cursor = bphSurvivalPlan("WaveChapter1").findIndex(entry => entry.at >= 180);

  advance(run, .1);

  const boss = run.enemies.find(enemy => enemy.boss);
  expect(boss?.maxHp).toBeCloseTo(bphSurvivalMonster(boss?.bphProfileId ?? "").hp
    * 2.25 * BPH_SURVIVAL_TABLE.bosses[0].hp, 8);
  expect(boss?.hp).toBe(boss?.maxHp);
  expect(state).not.toHaveProperty("projection");
});

test("accelerated and multiplied regular waves retain wall-clock transport departures", () => {
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [
    ...BPH_UPGRADE_NODES.Mod_Accelerate.effects, ...BPH_UPGRADE_NODES.Mod_Infestation.effects,
  ] });
  run.squads = []; run.shieldUntil = Infinity;
  for (let tick = 0; tick < 400 && !run.enemies.some(enemy => enemy.cargo?.length && !enemy.sailing); tick++)
    advance(run, .05);
  const ship = run.enemies.find(enemy => enemy.cargo?.length && !enemy.sailing), state = run.bph?.survival;
  if (!ship || !state) throw new TypeError("Missing partially filled transport");
  run.enemies = [ship];
  run.time = 14.99;
  state.cursor = bphSurvivalPlan("WaveChapter1").findIndex(entry => entry.at >= 15);
  state.projection = { after: 29.88, through: 29.98, tick: 14.99, countMultiplier: 2 };

  advance(run, .05);
  const atFifteen = ship.sailing === true;
  run.time = 29.99;
  state.cursor = bphSurvivalPlan("WaveChapter1").findIndex(entry => entry.at >= 30);
  state.projection = { after: 59.88, through: 59.98, tick: 29.99, countMultiplier: 2 };
  advance(run, .05);

  expect([atFifteen, ship.sailing]).toEqual([false, true]);
});
