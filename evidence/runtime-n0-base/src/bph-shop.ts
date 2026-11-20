import type { BphEffect, BphSave } from "./bph-contract";
import { BPH_PACKS } from "./bph-data";
import { bphEffectValue, bphRandom } from "./bph";
import { rollBphShopDiscount } from "./effects/shop/discount";

export type BphOffer = {
  readonly packId: string; readonly box: boolean;
  readonly price: number; readonly discounted: boolean; sold: boolean;
};
/** Visit offers and rerolls are saved; discount pity survives visit changes. */
export type BphShop = {
  readonly managementVisit: number; offers: BphOffer[];
  rerolls: number; discountMisses: number; purchases: Record<string, number>;
};
const INITIAL_PACKS = ["Pack1_Basic", "Pack2_Advanced", "Pack3_Magic", "Pack4_Royal"];
export const BPH_PACK_NAMES: Readonly<Record<string, string>> = {
  Pack1_Basic: "기본 병력 모집", Pack2_Advanced: "숙련 병력 모집", Pack3_Magic: "전술 병력 모집",
  Pack4_Royal: "정예 병력 모집", Pack6_Forest: "산림 병력 모집", Pack5_Skeleton: "재기 병력 모집",
  Pack7_Arctic: "설원 병력 모집", Pack9_Cosmic: "천문 병력 모집", Pack_Tomes: "전술 모집",
};
function candidates(save: BphSave, effects: readonly BphEffect[]): BphOffer[] {
  const unlocked = new Set([...INITIAL_PACKS, ...effects.filter(e => e.type === "ShopUnlockTargetPack")
    .map(e => e.targets.targetPack), ...Object.keys(save.packs)]);
  const packs = [...unlocked].filter(id => BPH_PACKS[id] && BPH_PACKS[id].price <= save.income)
    .sort((a, b) => BPH_PACKS[b].price - BPH_PACKS[a].price).slice(0, 3);
  return packs.flatMap(packId => {
    const pack = BPH_PACKS[packId], offers: BphOffer[] = [
      { packId, box: false, price: pack.price, discounted: false, sold: false },
    ];
    if ((save.packs[packId]?.opened ?? 0) >= pack.boxUnlock && pack.boxPrice <= save.income)
      offers.push({ packId, box: true, price: pack.boxPrice, discounted: false, sold: false });
    return offers;
  });
}
function deal(save: BphSave, effects: readonly BphEffect[]): BphOffer[] {
  const pool = candidates(save, effects);
  const slots = 3 + Math.max(0, Math.floor(bphEffectValue(effects, "RoguelikeShopSlotBonus")));
  return Array.from({ length: slots }, () => ({ ...pool[Math.floor(bphRandom(save) * pool.length)] }));
}
function discountOffers(
  save: BphSave, shop: BphShop, effects: readonly BphEffect[], offers: readonly BphOffer[],
): BphOffer[] {
  return offers.map(offer => ({
    ...offer, ...rollBphShopDiscount(save, shop, effects, offer.box ? "box" : "pack", offer.price),
  }));
}
export function createBphShop(
  save: BphSave, effects: readonly BphEffect[], previous?: BphShop,
): BphShop {
  if (previous?.managementVisit === save.lifecycle.managementVisit) return previous;
  const shop: BphShop = {
    managementVisit: save.lifecycle.managementVisit, offers: [], rerolls: 0,
    discountMisses: previous?.discountMisses ?? 0, purchases: {},
  };
  shop.offers = discountOffers(save, shop, effects, deal(save, effects));
  return shop;
}
/** The exact frozen price used by display, affordability and debit. */
export function bphOfferPrice(offer: BphOffer): number {
  return offer.price;
}
export function buyBphOffer(save: BphSave, shop: BphShop, slot: number, asking?: number, scope: "visit" | "battle" = "visit"): boolean {
  if (shop.managementVisit !== save.lifecycle.managementVisit) return false;
  const offer = shop.offers[slot];
  if (!offer || offer.sold) return false;
  const pack = BPH_PACKS[offer.packId], price = asking ?? bphOfferPrice(offer);
  const key = `${offer.packId}:${offer.box}`, purchased = shop.purchases[key] ?? 0;
  if (save.coins < price || (scope === "visit" && purchased >= (offer.box ? pack.maxBoxes : pack.maxPurchases))) return false;
  if (offer.box && (save.packs[pack.id]?.opened ?? 0) < pack.boxUnlock) return false;
  save.coins -= price; offer.sold = true; shop.purchases[key] = purchased + 1;
  save.inventory.push({ id: save.nextPackId++, packId: pack.id, box: offer.box });
  return true;
}
export function bphRerollPrice(shop: BphShop, effects: readonly BphEffect[]): number {
  return Math.max(0, 1 + shop.rerolls - bphEffectValue(effects, "ShopRerollCostReduction"));
}
export function rerollBphShop(save: BphSave, shop: BphShop, effects: readonly BphEffect[]): boolean {
  if (shop.managementVisit !== save.lifecycle.managementVisit) return false;
  if (bphEffectValue(effects, "ShopCanBeRerolled") <= 0) return false;
  const price = bphRerollPrice(shop, effects);
  if (save.coins < price) return false;
  const previous = shop.offers.filter(offer => !offer.sold).map(offer => `${offer.packId}:${offer.box}`);
  save.coins -= price; shop.rerolls++;
  const offers = deal(save, effects), pool = candidates(save, effects);
  // Authored 0.5 guarantee: a different eligible product, when one exists.
  if (bphRandom(save) < .5) {
    const alternate = pool.filter(offer => !previous.includes(`${offer.packId}:${offer.box}`));
    if (alternate.length) offers[0] = { ...alternate[Math.floor(bphRandom(save) * alternate.length)] };
  }
  shop.offers = discountOffers(save, shop, effects, offers);
  return true;
}
