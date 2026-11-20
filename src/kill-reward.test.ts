import { expect, test } from "bun:test";
import { bphBattleMedals, createBphRun, settleBphRun } from "./bph-session";
import { BPH_KILL_DROP, bphKillDropChance, rollBphKillDrop } from "./bph-kill-drops";
import { bphSurvivalPlan } from "./bph-survival";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { freshMeta } from "./meta";
import { advance, bphEffectCombat, createRun } from "./rules";
import type { Enemy, Run } from "./rules";

function caveling(id: number, extra: Partial<Enemy> = {}): Enemy {
  return { ...createRun(4).enemies[0], id, bphProfileId: "Monster1_Caveling", ...extra };
}

function kill(run: Run, enemy: Enemy) {
  run.enemies = [enemy];
  const effects: Parameters<typeof bphEffectCombat>[1] = [];
  bphEffectCombat(run, effects).applyDamage({ source: run.squads[0], target: enemy, amount: enemy.hp + 1 });
  return effects;
}

test.each(BPH_SURVIVAL_TABLE.infantryFile)("ordinary spear wallet per authored slot at $at seconds", ({ at, multiplier }) => {
  const run = createBphRun(freshMeta(), { seed: 17, general: "권율", upgrades: [] });
  const state = run.bph?.survival;
  if (!state) throw new Error("Expected survival");
  const slots = bphSurvivalPlan("WaveChapter1").filter(s => s.at >= at && s.at < at + 30
    && s.kind === "yari" && !s.boss && !s.elite && !s.rush && !s.ladder && !s.miniboss).slice(0, 40);
  expect(slots).toHaveLength(40);
  state.reinforcements = [...slots];
  advance(run, .01);
  const bodies = run.enemies.flatMap(e => e.cargo ?? [e]);
  expect(bodies).toHaveLength(slots.length * multiplier);
  const { gold, earned } = run; // Discoveries are credited at spawn.
  let wins = 0, pouches = 0, receipts = 0;
  for (const body of bodies) {
    expect(bphKillDropChance(body)).toBe(BPH_KILL_DROP.foe);
    if (rollBphKillDrop(run, body).coins) wins++;
    if (body.goldPouch && !body.goldPouchSpent) pouches++;
    receipts += kill(run, body).reduce((sum, fx) => sum + (fx.kind === "coin" ? fx.value : 0), 0);
  }
  expect(wins).toBeGreaterThan(0);
  expect(wins).toBeLessThan(bodies.length);
  // Below maximum density, keep the original ten-coin file. Maximum-density files pay thirteen.
  const total = wins * (multiplier === 3 ? 13 : 10) * slots.length / bodies.length + pouches * 8;
  expect(run.gold - gold).toBe(Math.floor(total));
  expect(run.earned - earned).toBe(receipts);
  expect(receipts).toBe(Math.floor(total));
  expect(run.coinRemainder).toBeCloseTo(total - Math.floor(total), 8);
});

test("special spear slots retain their own bounties at maximum file density", () => {
  const run = createBphRun(freshMeta(), { seed: 17, general: "권율", upgrades: [] });
  const state = run.bph?.survival;
  if (!state) throw new Error("Expected survival");
  const slot = { ...bphSurvivalPlan("WaveChapter1")[0], at: 180, side: "위" as const };
  state.reinforcements = Array.from({ length: 12 }, () => [
    { ...slot, rush: true }, { ...slot, ladder: true }, { ...slot, elite: true },
    { ...slot, miniboss: "spin-slash" as const }, { ...slot, boss: true },
  ]).flat();
  advance(run, .01);
  const bodies = [...run.enemies];
  expect(bodies).toHaveLength(60);
  const { gold } = run;
  let expected = 0;
  for (const body of bodies) {
    if (rollBphKillDrop(run, body).coins) expected += body.miniboss ? 6 : 1;
    kill(run, body);
  }
  expect(run.gold - gold).toBe(expected);
});

test.each([false, true])("ordinary loot channels pay independently with an empty bank (elite=%p)", elite => {
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [] });
  const battle = run.bph;
  if (!battle?.survival) throw new Error("Expected survival battle");
  battle.survival.killCoins = { at: run.time, tokens: 0 };
  // Stale data from the old kill-pity contract cannot turn a miss into loot.
  Object.assign(battle, { dropMisses: { foe: [99, 99], elite: [99, 99] } });
  // Seed 7 draws: the first id of each pair hits this pattern at the foe chance, the second at the elite chance.
  for (const [foeId, eliteId, coins, mastery] of [
    [3, 0, false, false], [16, 16, false, true], [2, 47, true, true], [17, 57, true, false],
  ] as const) {
    const id = elite ? eliteId : foeId;
    const { gold, earned, coinRemainder, xp } = run;
    const medals = bphBattleMedals(run);
    const enemy = caveling(id, { elite });
    expect(rollBphKillDrop(run, enemy)).toEqual({ coins, mastery });

    const effects = kill(run, enemy);

    expect(run.gold - gold).toBe(Number(coins));
    expect(run.earned - earned).toBe(Number(coins));
    expect(run.coinRemainder).toBe(coinRemainder);
    expect(bphBattleMedals(run) - medals).toBe(Number(mastery));
    expect(run.xp - xp).toBe(1);
    expect(effects.some(effect => effect.kind === "coin")).toBe(coins);
  }
});

test.each([
  { tier: "miniboss", flags: { miniboss: "spin-slash" } as const, coins: 6, xp: 3 },
  { tier: "boss", flags: { boss: true }, coins: 1, xp: 1 },
])("$tier pays guaranteed gold and a medal with an empty bank", ({ flags, coins, xp }) => {
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [] });
  const battle = run.bph;
  if (!battle?.survival) throw new Error("Expected survival battle");
  battle.survival.killCoins = { at: run.time, tokens: 0 };
  const before = { gold: run.gold, earned: run.earned, xp: run.xp, medals: bphBattleMedals(run) };
  const enemy = caveling(3, flags); // Both channels would miss for an ordinary enemy.
  expect(rollBphKillDrop(run, enemy)).toEqual({ coins: true, mastery: true });

  const effects = kill(run, enemy);

  expect(run.gold - before.gold).toBe(coins);
  expect(run.earned - before.earned).toBe(coins);
  expect(run.xp - before.xp).toBe(xp);
  expect(bphBattleMedals(run) - before.medals).toBe(1);
  expect(effects.filter(effect => effect.kind === "coin").map(effect => effect.value)).toEqual([coins]);
});

test.each([[3840, 40], [386000, BPH_SURVIVAL_TABLE.meritCap]])("survival adds kill medals above %i raw merit (%i converted medals) exactly once", (raw, medals) => {
  const meta = freshMeta();
  const run = createBphRun(meta, { seed: 7, general: "권율", upgrades: [] });
  if (!run.bph) throw new TypeError("Expected a survival battle");
  run.bph.pendingMastery = raw;
  expect(bphBattleMedals(run)).toBe(medals);
  const before = run.bph.save.resources.mastery;
  kill(run, caveling(0, { boss: true }));
  expect(bphBattleMedals(run)).toBe(medals + 1);
  expect(run.bph.save.resources.mastery).toBe(before);
  run.phase = "lost";
  settleBphRun(meta, run);
  settleBphRun(meta, run);
  expect(run.bph.save.resources.mastery - before).toBe(medals + 1);
});

test("maxed gold ranks increase earned pouch gold while keeping integer coin accounting", () => {
  const goldUpgrade = { nodeId: "HJ_GoldGain", type: "BattleGoldGainBonus", value: 0.2, effectPower: 0,
    effectPowerScale: 0, stackCap: 0, countStep: 0, targets: {} };
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [goldUpgrade, goldUpgrade, goldUpgrade] });
  const { gold, earned, coinRemainder } = run;
  // These IDs miss both ordinary drops, isolating the upgrade's effect on pouches.
  for (const id of [3, 22]) kill(run, caveling(id, { goldPouch: true }));
  const total = coinRemainder + 25.6;
  expect(run.gold - gold).toBe(Math.floor(total));
  expect(run.earned - earned).toBe(Math.floor(total));
  expect(run.coinRemainder).toBeCloseTo(total - Math.floor(total));
});

test.each([
  [3, false, 8], [3, true, 0], [57, false, 9], [57, true, 1],
])("pouch and ordinary loot pay separately (id=%i, spent=%p)", (id, spent, reward) => {
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [] });
  const { gold, earned } = run;
  const effects = kill(run, caveling(id, { goldPouch: true, goldPouchSpent: spent ? true : undefined }));
  expect(run.gold - gold).toBe(reward);
  expect(run.earned - earned).toBe(reward);
  expect(effects.filter(effect => effect.kind === "coin").map(effect => effect.value))
    .toEqual(reward ? [reward] : []);
});

test.each([-1, 9])("both channels keep their tier's drop cutoff with a luck modifier of %p", value => {
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [{
    nodeId: "luck", type: "GlobalChanceEffectMultiplier", value, effectPower: 0,
    effectPowerScale: 0, stackCap: 0, countStep: 0, targets: {},
  }] });
  // The 32-bit draws cannot equal a tier's chance. The foe fixtures straddle .7 at 3006477102 / 2**32 and
  // 3006477110 / 2**32, the elite fixtures straddle .1 at 429496728 / 2**32 and 429496733 / 2**32, in each channel.
  for (const [elite, ids] of [
    [false, [964345149, 1877537274, 1170684754, 89543653]],
    [true, [1872948394, 2664425624, 2728299285, 2753178983]],
  ] as const) {
    expect(bphKillDropChance(caveling(ids[0], { elite }))).toBe(elite ? BPH_KILL_DROP.elite : BPH_KILL_DROP.foe);
    expect(rollBphKillDrop(run, caveling(ids[0], { elite }))).toEqual({ coins: true, mastery: false });
    expect(rollBphKillDrop(run, caveling(ids[1], { elite }))).toEqual({ coins: false, mastery: false });
    expect(rollBphKillDrop(run, caveling(ids[2], { elite }))).toEqual({ coins: false, mastery: true });
    expect(rollBphKillDrop(run, caveling(ids[3], { elite }))).toEqual({ coins: false, mastery: false });
  }
});
