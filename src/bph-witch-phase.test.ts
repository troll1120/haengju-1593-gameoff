import { expect, test } from "bun:test";
import { BPH_MONSTERS } from "./bph-data";
import { BPH_SCALE } from "./bph-combat";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { dispatchBphEffects } from "./bph-fx-dispatch";
import { createBphRun, ensureBphSave } from "./bph-session";
import { bphSurvivalPlan, bphSurvivalWon } from "./bph-survival";
import { witchLeads } from "./bph-survival-fixture";
import { spawnBphSurvival } from "./bph-survival-spawn";
import { recordBphWitchDeath, takeBphWitchRespawns } from "./bph-witch-phase";
import { freshMeta } from "./meta";
import { advance } from "./rules";
import type { Effect, Enemy } from "./rules";

function encounter(at: number, e1 = false) {
  const meta = freshMeta();
  ensureBphSave(meta).chapter = 2;
  const run = createBphRun(meta, { seed: 7, general: "권율",
    upgrades: e1 ? BPH_UPGRADE_NODES.Mod_MonsterHpAndDamage125.effects : [] });
  const state = run.bph?.survival;
  if (!state) throw new TypeError("Missing survival battle");
  run.time = at - .05;
  state.cursor = bphSurvivalPlan("WaveChapter3").findIndex(entry => entry.at >= at);
  const bosses = witchLeads(state, at);
  advance(run, .05);
  const witch = run.enemies.find(enemy => enemy.bphProfileId === "Boss3_Witch");
  if (!witch) throw new TypeError("Missing real Witch spawn");
  state.cursor = bphSurvivalPlan("WaveChapter3").length;
  return { run, witch, state, bosses };
}

test.each([180, 360, 540])("Witch encounter at %s queues its second form once after death", at => {
  const { run, witch, bosses } = encounter(at);
  expect(recordBphWitchDeath(run, witch)).toBe(false);
  expect(takeBphWitchRespawns(run)).toEqual([]);
  run.time = at + 25;
  witch.hp = 0;
  expect(recordBphWitchDeath(run, witch)).toBe(true);
  expect(recordBphWitchDeath(run, witch)).toBe(true);
  const pending = takeBphWitchRespawns(run);
  expect(pending.map(phase => phase.entry.profileId)).toEqual(["Boss3_Witch2"]);
  expect(pending[0].entry.at).toBe(at);
  expect(run.metrics.bosses).toHaveLength(bosses);
  expect(run.metrics.bosses[0].phase2).toBe(at + 25);
  expect(run.metrics.bosses[0].fallen).toBeNull();
  expect(takeBphWitchRespawns(run)).toEqual([]);
  expect(bphSurvivalWon(run)).toBe(false);
});

test.each([false, true])("real spawn adapter preserves parent multipliers and identity with E1=%s", e1 => {
  const { run, witch, state } = encounter(180, e1);
  const parentHpFactor = witch.maxHp / BPH_MONSTERS.Boss3_Witch.hp;
  witch.x = 123; witch.y = 234;
  const parentDamage = state.damage[witch.id];
  run.time = 500;
  witch.hp = 0;
  recordBphWitchDeath(run, witch);
  const effects: Effect[] = [];
  let child: Enemy | undefined;

  spawnBphSurvival(run, { dt: .05, effects }, () => {
    // Geometry construction is the adapter's existing caller-owned boundary.
    child = { ...witch, id: run.nextId++, hp: 20, maxHp: 20, x: 10, y: 20 };
    run.enemies.push(child);
    return child;
  });

  if (!child) throw new TypeError("Missing second form");
  expect(child.bphProfileId).toBe("Boss3_Witch2");
  expect(child.bossArt).toBe(witch.bossArt);
  expect([child.x, child.y, child.appearedAt]).toEqual([123, 234, 180]);
  expect(child.maxHp).toBeCloseTo(1000 * parentHpFactor, 8);
  expect(child.speed).toBe(BPH_MONSTERS.Boss3_Witch2.moveSpeed * BPH_SCALE.movement);
  expect(state.damage[child.id]).toEqual(parentDamage);
  const hp = child.hp;
  dispatchBphEffects(run, { kind: "enemy-spawn", enemy: child });
  expect(child.hp).toBe(hp);
  expect(run.metrics.bosses).toHaveLength(1);
  expect(effects.filter(effect => effect.kind === "boss-enter")).toHaveLength(1);
  child.hp = 0;
  recordBphWitchDeath(run, child);
  recordBphWitchDeath(run, child);
  expect(run.metrics.bosses[0].fallen).toBe(500);
  expect(takeBphWitchRespawns(run)).toEqual([]);
  expect(bphSurvivalWon(run)).toBe(false);
});

test("untracked enemies and nonlethal hits never acquire phase state", () => {
  const { run, witch } = encounter(180);
  const unrelated = { ...witch, id: run.nextId++, hp: 0, bphProfileId: "Boss2_Beast" };
  expect(recordBphWitchDeath(run, unrelated)).toBe(false);
  expect(takeBphWitchRespawns(run)).toEqual([]);
});
