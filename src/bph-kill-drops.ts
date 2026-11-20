import type { Enemy, Run } from "./rules";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";

/** Each non-boss kill gets two independent draws, irrespective of preceding kills. */
export const BPH_KILL_DROP = { foe: .7, elite: .10, boss: 1 } as const;
export const BPH_KILL_DROP_AMOUNT = { foe: 3, elite: 3, boss: 1 } as const;
/** Survival changes coins only; mastery keeps the original drop amount. */
export const BPH_GOLD_POUCH_COINS = 8;
/** Keeps the drop stream apart from the join and recruit streams; the battle's run.rng is never read. */
const DROP_SALT = 0x44524f50;

export type BphKillDrop = { readonly coins: boolean; readonly mastery: boolean };
export type BphKillDropTier = keyof typeof BPH_KILL_DROP;

export function bphKillDropTier(enemy: Enemy): BphKillDropTier {
  if (enemy.boss || enemy.kind === "ukita") return "boss";
  return enemy.elite || enemy.aboard === "atakebune" ? "elite" : "foe";
}

export function bphKillCoinMultiplier(run: Run, enemy: Enemy): number {
  const tier = bphKillDropTier(enemy);
  return run.bph?.survival && tier === "foe" ? 2 : BPH_KILL_DROP_AMOUNT[tier];
}

export function bphKillDropChance(enemy: Enemy): number {
  return enemy.miniboss ? 1 : BPH_KILL_DROP[bphKillDropTier(enemy)];
}

/** One uniform draw keyed only by (run.seed, enemy id, channel), so the same seed drops the same loot and no other roll moves. */
function draw(seed: number, enemyId: number, channel: number): number {
  let state = (Math.imul((seed >>> 0 || 1) ^ DROP_SALT, 0x9e3779b1) ^ Math.imul(enemyId + 1, 0x85ebca77) ^ Math.imul(channel + 1, 0xc2b2ae3d)) >>> 0;
  state = (state + 0x6d2b79f5) >>> 0;
  let value = Math.imul(state ^ state >>> 15, state | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}

export function rollBphKillDrop(run: Run, enemy: Enemy): BphKillDrop {
  const chance = bphKillDropChance(enemy);
  return chance === 1 ? { coins: true, mastery: true }
    : { coins: draw(run.seed, enemy.id, 0) < chance, mastery: draw(run.seed, enemy.id, 1) < chance };
}

/** Separate budget for hero coin effects, which can proc alongside kill loot. */
export function bphKillCoins(run: Run, amount: number): number {
  const state = run.bph?.survival;
  if (!state) return amount;
  const budget = BPH_SURVIVAL_TABLE.killCoins;
  const bank = state.killCoins ??= { at: 0, tokens: budget.burst };
  bank.tokens = Math.min(budget.burst, bank.tokens + (run.time - bank.at) * budget.perSecond);
  bank.at = run.time;
  const coins = Math.min(amount, Math.floor(bank.tokens + 1e-9));
  bank.tokens -= coins;
  return coins;
}
