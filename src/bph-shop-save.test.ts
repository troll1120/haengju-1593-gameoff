import { expect, test } from "bun:test";
import { freshBphSave, parseBphSave } from "./bph-save";
import { bphOfferPrice, buyBphOffer, createBphShop, rerollBphShop } from "./bph-shop";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";

test("the first reload preserves frozen shop quotes, purchases, pity and account RNG", () => {
  const save = freshBphSave(13);
  save.coins = 100;
  const effects = [...BPH_UPGRADE_NODES.SN_RoguelikeDiscountChance.effects,
    ...BPH_UPGRADE_NODES.SN_ShopRerollUnlock.effects,
    ...BPH_UPGRADE_NODES.SN_ShopRerollDiscountChanceStack.effects];
  const shop = createBphShop(save, effects);
  expect(rerollBphShop(save, shop, effects)).toBe(true);
  expect(buyBphOffer(save, shop, 0)).toBe(true);
  Object.assign(save, { shop });
  const snapshot = structuredClone(save);

  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));

  expect(restored).toMatchObject({
    shop: snapshot.shop, rng: snapshot.rng, coins: snapshot.coins,
    inventory: snapshot.inventory, nextPackId: snapshot.nextPackId,
  });
  expect(restored.shop?.offers.map(bphOfferPrice)).toEqual(shop.offers.map(bphOfferPrice));
  expect(restored.shop?.offers.map(offer => offer.discounted)).toEqual(shop.offers.map(offer => offer.discounted));
  expect(JSON.stringify(parseBphSave(JSON.parse(JSON.stringify(restored))))).toBe(JSON.stringify(restored));
});

test.each([
  { managementVisit: -1, offers: [], rerolls: 0, discountMisses: 0, purchases: {} },
  { managementVisit: 1, offers: [{ packId: "missing", price: 1, box: false, discounted: false, sold: false }],
    rerolls: 0, discountMisses: 0, purchases: {} },
  { managementVisit: 1, offers: [{ packId: "Pack1_Basic", price: -1, box: false, discounted: false, sold: false }],
    rerolls: 0, discountMisses: 0, purchases: {} },
  { managementVisit: 1, offers: [], rerolls: "invalid", discountMisses: 0, purchases: {} },
])("malformed optional shop state cannot bypass the real save parser: %j", shop => {
  const save = freshBphSave();

  const restored = parseBphSave({ ...save, shop });

  expect(restored).not.toHaveProperty("shop");
  expect(restored.rng).toBe(save.rng);
  expect(restored.coins).toBe(save.coins);
});

test("a legacy save without shop state allocates neither shop data nor random draws", () => {
  const save = freshBphSave(37);

  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));

  expect(restored).not.toHaveProperty("shop");
  expect(restored.rng).toBe(37);
});
