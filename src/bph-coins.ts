import type { BphFxContext } from "./bph-contract";
import type { Unit } from "./rules";
import { bphKillCoins } from "./bph-kill-drops";

/** KillCoinPityConfig tooltips: base-relative stacks and a per-hero cap. */
export function rollBphKillCoin(context: BphFxContext, unit: Unit, base: number): void {
  if (base <= 0) return;
  const key = `coin:${unit.id}:${unit.bph?.lifeId ?? 0}`;
  const coins = context.state.counters[`${key}:coins`] ?? 0;
  if (coins >= 5) return;
  const stacks = context.state.counters[`${key}:stacks`] ?? 0;
  const chance = context.chance(Math.max(0, base * (1 + stacks)));
  const gained = chance > 0 && context.random() < chance;
  context.state.counters[`${key}:stacks`] = gained ? -(2 ** coins) : stacks + 1;
  if (!gained || !bphKillCoins(context.run, 1)) return;
  context.state.counters[`${key}:coins`] = coins + 1;
  context.save.coins++;
  context.run.gold++; context.run.earned++;
  context.emitEvent({ kind: "coins-gained", amount: 1 });
  context.emit({ kind: "coin", x: unit.x, y: unit.y, value: 1 });
}
