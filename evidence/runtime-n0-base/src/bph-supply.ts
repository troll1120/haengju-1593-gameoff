import type { Run } from "./rules";
import { bphFieldShop } from "./bph-shop-session";
import type { BphShop } from "./bph-shop";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";

/** Battle stock keeps its original products; only sold slots return at supply boundaries. */
export function restockBphRecruit(run: Run): BphShop {
  const battle = run.bph;
  if (!battle) throw new TypeError("Battle recruitment requires a BPH run");
  const shop = battle.recruitShop ??= bphFieldShop(run) ?? null;
  if (!shop) throw new RangeError("Field shop must be prepared at field startup");
  if (run.time >= battle.supplyAt) {
    for (const offer of shop.offers) if (offer.sold) offer.sold = false;
    battle.supplyAt = (Math.floor(run.time / BPH_SURVIVAL_TABLE.supplySeconds) + 1) * BPH_SURVIVAL_TABLE.supplySeconds;
  }
  return shop;
}
