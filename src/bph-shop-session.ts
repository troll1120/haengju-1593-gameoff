import type { BphEffect, BphSave } from "./bph-contract";
import { createBphShop, bphUnlockedPacks, bphUnlockedTroopPacks } from "./bph-shop";
import { bphRecruitBasePrice } from "./bph-recruit";
import type { BphShop } from "./bph-shop";
import type { Run } from "./rules";

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
  return run.bph?.recruitShop ?? undefined;
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

/** One permanent field offer per unlocked troop pack, plus the tactic pack when unlocked. */
export function prepareBphFieldShop(run: Run): void {
  const battle = run.bph;
  if (!battle || battle.recruitShop) return;
  const { save, upgrades } = battle;
  const packs = [...bphUnlockedTroopPacks(save, upgrades)];
  if (bphUnlockedPacks(save, upgrades).has("Pack_Tomes")) packs.push("Pack_Tomes");
  battle.recruitShop = {
    managementVisit: save.lifecycle.managementVisit, rerolls: 0, discountMisses: 0, purchases: {},
    offers: packs.map(packId => ({
      packId, price: bphRecruitBasePrice(packId), box: false, discounted: false, sold: false,
    })),
  };
}
