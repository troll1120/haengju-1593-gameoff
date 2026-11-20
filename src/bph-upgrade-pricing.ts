import type { BphUpgradeNode } from "./bph-upgrade-data";

/** Preserve authored price tiers after currency conversion while compressing the
 * original hundredfold jumps into a curve priced for a few hundred medals per run. */
export function bphMasteryWebPrice(node: BphUpgradeNode): number {
  const price = node.costs.mastery;
  if (price === 0 || node.id === "SN_TowerHP") return price;
  return 5 * Math.round((25 + 18 * Math.log10(1 + price / 4) ** 1.6) / 5);
}
