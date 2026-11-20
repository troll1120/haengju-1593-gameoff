import type { Run } from "./rules";
import { bphFieldShop } from "./bph-shop-session";
import type { BphShop } from "./bph-shop";

/** Compatibility accessor for the permanent battle catalog. Paid offers no longer restock. */
export function restockBphRecruit(run: Run): BphShop {
  const battle = run.bph;
  if (!battle) throw new TypeError("Battle recruitment requires a BPH run");
  const shop = bphFieldShop(run);
  if (!shop) throw new RangeError("Field shop must be prepared at field startup");
  return shop;
}
