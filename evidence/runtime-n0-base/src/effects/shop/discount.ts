import type { BphEffect, BphSave } from "../../bph-contract";
import { bphEffectValue, bphRandom } from "../../bph";

export type BphDiscountCategory = "pack" | "special" | "box";
/** Pity is saved across visits; rerolls reset when Improvements ends. */
export type BphDiscountState = { rerolls: number; discountMisses: number };

/**
 * Called once for a committed offer, never by rendering or purchasing.
 * Original GameManager: 0x78aa9c, 0x792cbc, 0x78c834 and 0x78afe8.
 * Special offers remain dormant until their original producer is available.
 */
export function rollBphShopDiscount(
  save: BphSave,
  state: BphDiscountState,
  effects: readonly BphEffect[],
  category: BphDiscountCategory,
  basePrice: number,
): { readonly price: number; readonly discounted: boolean } {
  const type = category === "pack" ? "RoguelikePackDiscountChance"
    : category === "special" ? "RoguelikeSpecialOfferDiscountChance" : null;
  // Direct box-discount upgrades belong to later units, not this increment.
  const chance = Math.max(0, Math.min(100, Math.fround(
    (type === null ? 0 : bphEffectValue(effects, type))
    + Math.max(0, bphEffectValue(effects, "ShopRerollDiscountChanceStack")) * state.rerolls,
  )));
  if (basePrice < 2 || chance === 0) return { price: basePrice, discounted: false };
  const effective = Math.fround(chance * Math.fround(
    1 + Math.fround(Math.fround(35 / 100) * state.discountMisses),
  ));
  const discounted = Math.fround(bphRandom(save) * 100) < effective;
  state.discountMisses = discounted ? 0 : state.discountMisses + 1;
  if (!discounted) return { price: basePrice, discounted };
  const factor = Math.fround(1 - Math.fround(30 / 100));
  return {
    price: Math.min(basePrice - 1, Math.ceil(Math.fround(Math.fround(basePrice) * factor))),
    discounted,
  };
}
