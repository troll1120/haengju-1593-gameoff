import { expect, test } from "bun:test";
import { BPH_GENERALS } from "./bph-commanders";
import type { BphEffect } from "./bph-contract";
import { freshBphSave, parseBphSave } from "./bph-save";
import { createBphRun } from "./bph-session";
import { advanceSurvivalGeneralLevel, chaosHitXp, chaosLevelXp, feedChaosGeneral } from "./chaos-growth";
import { chaosState } from "./chaos-state";
import { chaosEnemy } from "./chaos-test-fixture";
import { reachLevel } from "./general-reach";
import { freshMeta } from "./meta";
import { bphEffectCombat, chooseGeneral, useSkill } from "./rules";
import type { Run } from "./rules";

function join(run: Run, general: "황진" | "이순신") {
  run.phase = "playing";
  run.generalOffers = [general];
  chooseGeneral(run, general);
  return run.squads.at(-1)!;
}

function battle() {
  const meta = freshMeta();
  meta.bph = freshBphSave(7);
  meta.bph.unlockedGenerals = [...BPH_GENERALS];
  const upgrades: BphEffect[] = Array.from({ length: 20 }, (_, index) => ({
    nodeId: `join:${index}`, type: "HeroAttackPower", value: .02,
    effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0,
    targets: { placementId: `join:${index}`, nodeType: "0", targetClass: "0" },
  }));
  return createBphRun(meta, { seed: 7, general: "권율", upgrades });
}

function castLevel(run: Run, index: number) {
  const squad = run.squads[index];
  chaosEnemy(run, squad.x + 20, squad.y);
  squad.skillClock = 0;
  useSkill(run, index);
  const events = run.chaosSkills!.events.filter(event => event.squad === squad.id);
  expect(events.length).toBeGreaterThan(0);
  return events.at(-1)!.level;
}

test("joins inherit exact shared progress instead of Lv1 or twenty purchased upgrades and keep sharing", () => {
  const run = battle(), state = chaosState(run)!;
  run.time = 600;
  advanceSurvivalGeneralLevel(run);
  const before = state.xp;
  join(run, "황진");
  join(run, "이순신");
  expect(run.chaos).toBe(state);
  expect(state.xp).toBe(before);
  expect(run.squads.map((_, index) => castLevel(run, index))).toEqual([7, 7, 7]);
  expect(reachLevel(run)).toBe(7);
  run.gold = 100;
  expect(feedChaosGeneral(run)).toBe(false);
  expect(run.gold).toBe(100);
  run.time = 700;
  advanceSurvivalGeneralLevel(run);
  expect(state.xp).toBe(chaosLevelXp(8));
  expect(run.squads.map((_, index) => castLevel(run, index))).toEqual([8, 8, 8]);
  expect(reachLevel(run)).toBe(8);
});

test("a joined general's kills and skill hits leave the battle clock's shared level intact", () => {
  const run = battle(), state = chaosState(run)!;
  const ally = join(run, "황진");
  const combat = bphEffectCombat(run, []);
  combat.applyDamage({ target: chaosEnemy(run, 300, 100), amount: 1e6, source: ally });
  expect(state.xp).toBe(0);
  for (let hit = 0; hit < 30; hit++) chaosHitXp(run, 999, ally);
  expect(state.xp).toBe(0);
  run.squads[0].state = "down";
  run.squads[0].downUntil = run.time + 10;
  combat.applyDamage({ target: chaosEnemy(run, 300, 140), amount: 1e6, source: ally });
  expect(state.xp).toBe(0);
  run.time = 200;
  advanceSurvivalGeneralLevel(run);
  expect(state.level).toBe(3);
});

test("a version 1 account round trip preserves purchases and currency while every arrival uses the new run's shared progress", () => {
  const old = freshBphSave(71);
  old.unlockedGenerals = [...BPH_GENERALS];
  old.resources.mastery = 1234;
  old.coins = 41;
  old.purchasedPlacements = ["legacy-placement"];
  old.purchasedNodes = ["legacy-node"];
  const parsed = parseBphSave(JSON.parse(JSON.stringify(old)));
  expect(parsed.resources).toEqual(old.resources);
  expect(parsed.coins).toBe(41);
  expect(parsed.purchasedPlacements).toEqual(old.purchasedPlacements);
  expect(parsed.purchasedNodes).toEqual(old.purchasedNodes);
  expect(parsed.unlockedGenerals).toEqual(old.unlockedGenerals);
  const meta = freshMeta();
  meta.bph = parsed;
  const run = createBphRun(meta, { seed: 71, general: "권율", upgrades: [] });
  const state = chaosState(run)!;
  expect([state.level, state.xp]).toEqual([1, 0]);
  run.time = 800;
  advanceSurvivalGeneralLevel(run);
  join(run, "황진");
  expect([castLevel(run, 0), castLevel(run, 1), state.xp]).toEqual([9, 9, chaosLevelXp(9)]);
  const savedAgain = parseBphSave(JSON.parse(JSON.stringify(parsed)));
  expect(savedAgain.purchasedPlacements).toEqual(old.purchasedPlacements);
  expect(savedAgain.resources).toEqual(old.resources);
});
