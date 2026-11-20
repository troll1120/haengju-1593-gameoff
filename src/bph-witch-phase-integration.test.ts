import { expect, test } from "bun:test";
import { BPH_PLACEMENTS } from "./bph-upgrades";
import { createBphRun, ensureBphSave, settleBphRun } from "./bph-session";
import { bphSurvivalPlan } from "./bph-survival";
import { witchLeads } from "./bph-survival-fixture";
import { freshMeta } from "./meta";
import { advance, hitBphEnemy } from "./rules";

test("real Witch deaths award both forms once and settle one completed boss encounter", () => {
  const meta = freshMeta(), save = ensureBphSave(meta);
  save.chapter = 2;
  const quest = [...BPH_PLACEMENTS.values()].find(placement => placement.nodeId === "Q_DefeatWitch");
  if (!quest) throw new TypeError("Missing Witch quest");
  save.questActivatedAt[quest.id] = 0;
  save.questProgress[quest.id] = 0;
  const run = createBphRun(meta, { seed: 7, general: "권율", upgrades: [] });
  const battle = run.bph;
  if (!battle?.survival) throw new TypeError("Missing survival battle");
  run.time = 179.95;
  battle.survival.cursor = bphSurvivalPlan(battle.waveId).findIndex(entry => entry.at >= 180);
  witchLeads(battle.survival, 180);
  advance(run, .05);
  const witch = run.enemies.find(enemy => enemy.bphProfileId === "Boss3_Witch");
  if (!witch) throw new TypeError("Missing Witch");
  battle.survival.cursor = bphSurvivalPlan(battle.waveId).length;
  run.enemies = [witch];
  const gold = run.gold;
  witch.hp = .001;

  hitBphEnemy(run, witch.id);
  hitBphEnemy(run, witch.id);

  expect(run.xp).toBe(3000);
  expect(battle.killMedals).toBe(1);
  expect(battle.pendingMastery).toBe(0);
  expect(save.questProgress[quest.id]).toBe(0);
  expect(run.metrics.bosses[0].fallen).toBeNull();
  expect(run.metrics.bosses[0].phase2).toBe(run.time);
  expect(run.phase).toBe("playing");
  advance(run, .05);
  const second = run.enemies.find(enemy => enemy.bphProfileId === "Boss3_Witch2");
  if (!second) throw new TypeError("Death hook did not queue Witch2");
  expect(run.metrics.bosses).toHaveLength(1);
  second.hp = .001;

  hitBphEnemy(run, second.id);
  hitBphEnemy(run, second.id);

  expect(run.xp).toBe(8000);
  expect(battle.killMedals).toBe(2);
  expect(battle.pendingMastery).toBe(0);
  expect(save.questProgress[quest.id]).toBe(1);
  expect(save.totalKills).toBe(2);
  // Both authored coin values are zero; the normal foe minimum awards one each.
  expect(run.gold - gold).toBe(2);
  expect(run.metrics.bosses[0].fallen).toBe(run.time);
  expect(run.phase).toBe("playing");
  run.time = 899.95;
  advance(run, .05);
  expect(run.phase).toBe("won");
  settleBphRun(meta, run);
  expect(meta.bossesKilled).toBe(1);
});
