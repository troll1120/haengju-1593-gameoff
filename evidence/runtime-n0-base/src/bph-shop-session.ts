import type { BphEffect, BphSave } from "./bph-contract";
import { createBphShop } from "./bph-shop";
import type { BphShop } from "./bph-shop";
import type { Run } from "./rules";

const fieldShops = new WeakMap<Run, BphShop>();
const H1_IDS = new Set([
  "SN_RoguelikeDiscountChance", "SN_RoguelikeDiscountChance2",
  "SN_RoguelikeDiscountChance3", "SN_ShopRerollDiscountChanceStack",
]);
const H1_KINDS = new Set([
  "RoguelikePackDiscountChance", "RoguelikeSpecialOfferDiscountChance", "ShopRerollDiscountChanceStack",
]);

/** Later shop units cannot become active merely by sharing a discount kind. */
export function bphShopEffects(effects: readonly BphEffect[], enabled = true): readonly BphEffect[] {
  return effects.filter(effect => !H1_KINDS.has(effect.type) || (enabled && H1_IDS.has(effect.nodeId)));
}

export function bphFieldShop(run: Run): BphShop | undefined {
  return fieldShops.get(run);
}

export function hasBphShopEffects(effects: readonly BphEffect[]): boolean {
  return effects.some(effect => effect.value > 0 && H1_IDS.has(effect.nodeId) && H1_KINDS.has(effect.type));
}

/** Called at actual management entry/purchase boundaries, never by rendering. */
export function prepareBphManagementShop(save: BphSave, effects: readonly BphEffect[]) {
  if (!hasBphShopEffects(effects)) return;
  const shop = createBphShop(save, bphShopEffects(effects), save.shop);
  save.shop = shop;
  return shop;
}

/** Explicit combat abandonment ends this visit without granting settlement rewards. */
export function endBphShopVisit(run: Run): boolean {
  const battle = run.bph;
  if (!battle || run.endless || !hasBphShopEffects(battle.upgrades)
    || battle.save.shop?.managementVisit !== battle.save.lifecycle.managementVisit) return false;
  battle.save.lifecycle.managementVisit++;
  return true;
}

/** Keep the no-effect W0 deal at field startup, without adding account state. */
export function prepareBphFieldShop(run: Run): void {
  const battle = run.bph;
  if (!battle || fieldShops.has(run)) return;
  fieldShops.set(run, (!run.endless && prepareBphManagementShop(battle.save, battle.upgrades))
    || createBphShop(battle.save, bphShopEffects(battle.upgrades, !run.endless)));
}
