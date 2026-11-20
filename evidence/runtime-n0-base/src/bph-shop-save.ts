import type { BphOffer, BphShop } from "./bph-shop";
import { BPH_PACKS } from "./bph-data";

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Frozen producer shape; rerolls/pity map to the two original GameSaveData stacks. */
export function parseBphShop(value: unknown): BphShop | undefined {
  if (!object(value) || !count(value.managementVisit) || value.managementVisit < 1
    || !count(value.rerolls) || !count(value.discountMisses)
    || !Array.isArray(value.offers) || !object(value.purchases)) return;
  const offers: BphOffer[] = [];
  for (const offer of value.offers) {
    if (!object(offer) || typeof offer.packId !== "string" || !BPH_PACKS[offer.packId]
      || !count(offer.price) || typeof offer.box !== "boolean"
      || typeof offer.discounted !== "boolean" || typeof offer.sold !== "boolean") return;
    offers.push({ packId: offer.packId, box: offer.box, price: offer.price,
      discounted: offer.discounted, sold: offer.sold });
  }
  const purchases: Record<string, number> = {};
  for (const [key, purchased] of Object.entries(value.purchases)) {
    if (!count(purchased)) return;
    purchases[key] = purchased;
  }
  return { managementVisit: value.managementVisit, offers, rerolls: value.rerolls,
    discountMisses: value.discountMisses, purchases };
}
