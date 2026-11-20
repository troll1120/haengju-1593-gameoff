import { expect, test } from "bun:test";
import { CHAOS_LEVELS } from "./chaos-contract";
import { CHAOS_GROWTH, chaosFeedOffer, chaosHitXp, chaosLevelForXp, chaosLevelXp, feedChaosGeneral } from "./chaos-growth";
import { chaosArena, chaosEnemy, setSurvivalFixtureLevel } from "./chaos-test-fixture";
import { advance, bphEffectCombat, chooseGeneral, generalHp } from "./rules";
import type { Run } from "./rules";
import { BPH_SCALE } from "./bph-combat";

test("thresholds follow 4(L-1)^2 + 8(L-1) and the level never passes 20", () => {
  expect([2, 3, 5, 10, 15, 20].map(chaosLevelXp)).toEqual([12, 32, 96, 396, 896, 1596]);
  expect([0, 11.5, 12, 95.5, 96, 1595, 1e6].map(chaosLevelForXp)).toEqual([1, 1, 2, 4, 5, 19, 20]);
});

test("a survival run starts at Lv1 with the release opening skill strength", () => {
  const run = chaosArena("권율", 0);
  expect([run.chaos?.level, run.chaos?.xp]).toEqual([1, 0]);
  expect(run.chaos?.mods).toBe(CHAOS_LEVELS.권율[5]!);
});

// Every XP source is multiplied by the single tuning knob.
const S = CHAOS_GROWTH.xpScale;

function xpArena() {
  const run = chaosArena("권율", 1);
  if (!run.bph) throw new Error("Expected BPH fixture");
  run.bph = { ...run.bph, survival: null };
  return run;
}

test("outside survival an owned kill and a boss kill pay XP while an unowned ordinary kill does not", () => {
  const run = xpArena(), combat = bphEffectCombat(run, []), state = run.chaos!;
  combat.applyDamage({ target: chaosEnemy(run, 300, 100), amount: 1e6, source: run.squads[0] });
  const killXp = CHAOS_GROWTH.killXp;
  expect(state.xp).toBe(killXp * S);
  const boss = chaosEnemy(run, 300, 140);
  boss.boss = true;
  combat.applyDamage({ target: boss, amount: 1e6 });
  expect(state.xp).toBe((25 + killXp) * S);
  combat.applyDamage({ target: chaosEnemy(run, 300, 180), amount: 1e6 });
  expect(state.xp).toBe((25 + killXp) * S);
});

function joined(run: Run) {
  run.bph!.save.unlockedGenerals = ["권율", "황진"];
  run.phase = "playing"; run.generalOffers = ["황진"];
  chooseGeneral(run, "황진");
  return run.squads[1];
}

test("survival HP growth uses the shared level for the starter and the joined general", () => {
  const run = chaosArena("권율", 1);
  setSurvivalFixtureLevel(run, 7);
  joined(run);
  advance(run, 1 / 30);
  for (const squad of run.squads)
    expect(squad.maxHp).toBe(generalHp(squad.general, 7, squad.tier) * (run.meta.heroHp ?? 1) * BPH_SCALE.generalHp);
  run.time = 700 - 1 / 30;
  advance(run, 1 / 30);
  for (const squad of run.squads)
    expect(squad.maxHp).toBe(generalHp(squad.general, 8, squad.tier) * (run.meta.heroHp ?? 1) * BPH_SCALE.generalHp);
});

test("a joined general's own kill and the starter's pay into the one pool, each split between the two on their feet", () => {
  const run = xpArena(), combat = bphEffectCombat(run, []), state = run.chaos!, ally = joined(run);
  combat.applyDamage({ target: chaosEnemy(run, 300, 100), amount: 1e6, source: ally });
  expect(state.xp).toBe(CHAOS_GROWTH.killXp / 2 * S);
  combat.applyDamage({ target: chaosEnemy(run, 300, 140), amount: 1e6, source: run.squads[0] });
  expect(state.xp).toBe(CHAOS_GROWTH.killXp * S);
});

test("a fallen general earns nothing while the one left standing earns whole, and a boss pays 25 while any general stands", () => {
  const run = xpArena(), combat = bphEffectCombat(run, []), state = run.chaos!, ally = joined(run), starter = run.squads[0];
  starter.state = "down"; starter.downUntil = run.time + 10;
  combat.applyDamage({ target: chaosEnemy(run, 300, 100), amount: 1e6, source: starter });
  expect(state.xp).toBe(0);
  combat.applyDamage({ target: chaosEnemy(run, 300, 140), amount: 1e6, source: ally });
  expect(state.xp).toBe(CHAOS_GROWTH.killXp * S);
  const boss = chaosEnemy(run, 300, 180);
  boss.boss = true;
  combat.applyDamage({ target: boss, amount: 1e6 });
  expect(state.xp).toBe((25 + CHAOS_GROWTH.killXp) * S);
  ally.state = "down"; ally.downUntil = run.time + 10;
  const late = chaosEnemy(run, 300, 220);
  late.boss = true;
  combat.applyDamage({ target: late, amount: 1e6 });
  expect(state.xp).toBe((25 + CHAOS_GROWTH.killXp) * S);
});

test("a joined general's skill hits pay into the pool, split between the two standing and capped per cast", () => {
  const run = xpArena(), state = run.chaos!, ally = joined(run);
  for (let hit = 0; hit < 30; hit++) chaosHitXp(run, 7, ally);
  expect(state.xp).toBe(CHAOS_GROWTH.hitXpPerCast / 2 * S);
});

test("skill hits pay .5 each up to 3 per cast, and crossing a band edge swaps the band row", () => {
  const run = xpArena(), state = run.chaos!, caster = run.squads[0];
  for (let hit = 0; hit < 30; hit++) chaosHitXp(run, 7, caster);
  expect(state.xp).toBe(CHAOS_GROWTH.hitXpPerCast * S);
  for (let cast = 8; cast < 28; cast++) for (let hit = 0; hit < 20; hit++) chaosHitXp(run, cast, caster);
  const xp = 21 * CHAOS_GROWTH.hitXpPerCast * S;
  expect([state.xp, state.level]).toEqual([xp, chaosLevelForXp(xp)]);
  expect(state.level).toBeGreaterThanOrEqual(5);
  expect(state.mods).toBe(CHAOS_LEVELS.권율[state.level]!);
});

test("feeding spends battle coins at 4 + 2(L-1) for +1 level, twice per supply window", () => {
  const run = xpArena(), state = run.chaos!;
  run.phase = "playing"; run.gold = 20;
  expect(chaosFeedOffer(run)).toEqual({ price: 4, left: 2 });
  expect(feedChaosGeneral(run)).toBe(true);
  expect(feedChaosGeneral(run)).toBe(true);
  expect([state.level, state.xp, run.gold, run.bph?.save.coins]).toEqual([3, 32, 10, 10]);
  expect(feedChaosGeneral(run)).toBe(false);
  run.time += 15;
  expect(chaosFeedOffer(run)).toEqual({ price: 8, left: 2 });
  expect(feedChaosGeneral(run)).toBe(true);
  expect(feedChaosGeneral(run)).toBe(false);
  expect([state.level, run.gold]).toEqual([4, 2]);
});

test("survival kills, skill hits and feeding cannot buy time on the growth clock", () => {
  const run = chaosArena("권율", 1), state = run.chaos!, ally = joined(run);
  const combat = bphEffectCombat(run, []);
  const boss = chaosEnemy(run, 300, 100);
  boss.boss = true;
  combat.applyDamage({ target: boss, amount: 1e6, source: ally });
  combat.applyDamage({ target: chaosEnemy(run, 300, 140), amount: 1e6, source: run.squads[0] });
  chaosHitXp(run, 7, ally);
  run.gold = 20;
  expect([state.xp, state.level, state.hitXp]).toEqual([0, 1, {}]);
  expect(chaosFeedOffer(run)).toBeUndefined();
  expect(feedChaosGeneral(run)).toBe(false);
  expect(run.gold).toBe(20);
  run.time = 100 - 1 / 30;
  advance(run, 1 / 30);
  expect(state.level).toBe(2);
  expect(state.mods).toBe(CHAOS_LEVELS.권율[5]!);
});
