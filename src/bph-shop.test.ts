import { expect, test } from "bun:test";
import type { BphEffect } from "./bph-contract";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { freshBphSave } from "./bph-save";
import { bphOfferPrice, buyBphOffer, createBphShop, rerollBphShop } from "./bph-shop";
import { rollBphShopDiscount } from "./effects/shop/discount";

const chanceIds = [
  "SN_RoguelikeDiscountChance",
  "SN_RoguelikeDiscountChance2",
  "SN_RoguelikeDiscountChance3",
] as const;
const unlock = BPH_UPGRADE_NODES.SN_ShopRerollUnlock.effects;
const stack = BPH_UPGRADE_NODES.SN_ShopRerollDiscountChanceStack.effects;
const effect = (type: string, value: number): BphEffect => ({
  nodeId: "fixture", type, value, effectPower: 0, effectPowerScale: 0,
  stackCap: 0, countStep: 0, targets: {},
});

for (const id of chanceIds) {
  test(`${id} freezes a discounted pack price and charges that price`, () => {
    const save = freshBphSave(13);
    const shop = createBphShop(save, BPH_UPGRADE_NODES[id].effects);

    expect(buyBphOffer(save, shop, 0)).toBe(true);
    expect(save.coins).toBe(2);
    expect(save.inventory).toEqual([{ id: 1, packId: "Pack1_Basic", box: false }]);
  });

  test(`${id} leaves an offer at full price when its chance misses`, () => {
    const save = freshBphSave(91);
    const shop = createBphShop(save, BPH_UPGRADE_NODES[id].effects);

    expect(bphOfferPrice(shop.offers[0])).toBe(2);
    expect(buyBphOffer(save, shop, 0)).toBe(true);
    expect(save.coins).toBe(1);
  });

  test(`${id} supports the original special-offer quote without activating special offers`, () => {
    const save = freshBphSave(7), state = { rerolls: 0, discountMisses: 0 };

    const quote = rollBphShopDiscount(save, state, BPH_UPGRADE_NODES[id].effects, "special", 5);

    expect(quote).toEqual({ price: 4, discounted: true });
    expect(save.inventory).toEqual([]);
  });

  test(`${id} does not apply its pack or special-offer chance to boxes`, () => {
    const save = freshBphSave(7), before = structuredClone(save);
    const state = { rerolls: 0, discountMisses: 3 };

    expect(rollBphShopDiscount(save, state, BPH_UPGRADE_NODES[id].effects, "box", 5))
      .toEqual({ price: 5, discounted: false });
    expect(save).toEqual(before);
    expect(state.discountMisses).toBe(3);
  });
}

test("SN_ShopRerollDiscountChanceStack applies its first stack to the successful reroll", () => {
  const save = freshBphSave(14);
  save.coins = 10;
  const effects = [
    ...unlock, ...stack,
  ];
  const shop = createBphShop(save, effects);

  expect(rerollBphShop(save, shop, effects)).toBe(true);
  expect(buyBphOffer(save, shop, 0)).toBe(true);
  expect(save.coins).toBe(8);
});

test("SN_ShopRerollDiscountChanceStack has no discount before the first reroll", () => {
  const save = freshBphSave(14);

  const shop = createBphShop(save, stack);

  expect(shop.offers.map(bphOfferPrice)).toEqual([2, 2, 2]);
  expect(save.rng).toBe(1199730157);
});

test("SN_ShopRerollDiscountChanceStack also discounts a box after a reroll", () => {
  const save = freshBphSave(7), state = { rerolls: 1, discountMisses: 0 };

  expect(rollBphShopDiscount(save, state, stack, "box", 5))
    .toEqual({ price: 4, discounted: true });
});

for (const [seed, count, price] of [[3, 1, 2], [3, 2, 1], [49, 2, 2], [49, 3, 1]]) {
  test(`the ${count} owned chance nodes add percentage points at seed ${seed}`, () => {
    const save = freshBphSave(seed);
    const effects = chanceIds.slice(0, count).flatMap(id => BPH_UPGRADE_NODES[id].effects);

    const shop = createBphShop(save, effects);

    expect(bphOfferPrice(shop.offers[0])).toBe(price);
  });
}

for (const [base, price] of [[0, 0], [1, 1], [2, 1], [3, 2], [4, 3], [5, 4], [10, 7], [20, 14], [100, 70]]) {
  test(`the original 30 percent discount quotes ${base} coins as ${price}`, () => {
    const save = freshBphSave(13), state = { rerolls: 0, discountMisses: 0 };

    const quote = rollBphShopDiscount(save, state, [effect("RoguelikePackDiscountChance", 100)], "pack", base);

    expect(quote).toEqual({ price, discounted: base >= 2 });
    if (base < 2) expect(save.rng).toBe(13);
  });
}

for (const [chance, discounted] of [[56.63226318359375, false], [56.63227081298828, true], [0, false], [100, true]] as const) {
  test(`discount RNG uses a strict less-than comparison at ${chance} percent`, () => {
    const save = freshBphSave(13), state = { rerolls: 0, discountMisses: 0 };

    expect(rollBphShopDiscount(save, state, [effect("RoguelikePackDiscountChance", chance)], "pack", 2))
      .toEqual({ price: discounted ? 1 : 2, discounted });
    if (chance === 0) expect(save.rng).toBe(13);
  });
}

test("an eligible miss increases original pity and a discounted offer clears it", () => {
  const effects = [effect("RoguelikePackDiscountChance", 50)];
  const state = { rerolls: 0, discountMisses: 0 };

  expect(rollBphShopDiscount(freshBphSave(13), state, effects, "pack", 2).price).toBe(2);
  expect(state.discountMisses).toBe(1);
  expect(rollBphShopDiscount(freshBphSave(13), state, effects, "pack", 2).price).toBe(1);
  expect(state.discountMisses).toBe(0);
});

test("unowned effects preserve the entire W0 account state except its original three deal draws", () => {
  const save = freshBphSave(91), expected = structuredClone(save);
  expected.rng = 1199730234;

  const shop = createBphShop(save, []);

  expect(save).toEqual(expected);
  expect(shop.offers.map(offer => [offer.packId, offer.box, bphOfferPrice(offer)]))
    .toEqual([["Pack1_Basic", false, 2], ["Pack1_Basic", false, 2], ["Pack1_Basic", false, 2]]);
});

test("display reads and a discounted purchase never reroll RNG or pay twice", () => {
  const save = freshBphSave(13);
  save.coins = 1;
  const shop = createBphShop(save, BPH_UPGRADE_NODES.SN_RoguelikeDiscountChance.effects);
  const rng = save.rng;

  expect(bphOfferPrice(shop.offers[0])).toBe(1);
  expect(bphOfferPrice(shop.offers[0])).toBe(1);
  expect(buyBphOffer(save, shop, 0)).toBe(true);
  const settled = structuredClone(save);
  expect(buyBphOffer(save, shop, 0)).toBe(false);
  expect(save.coins).toBe(0);
  expect(save.rng).toBe(rng);
  expect(save).toEqual(settled);
});

test("insufficient funds leave a frozen full-price offer and all account state unchanged", () => {
  const save = freshBphSave(91);
  save.coins = 1;
  const shop = createBphShop(save, BPH_UPGRADE_NODES.SN_RoguelikeDiscountChance.effects);
  const before = structuredClone({ save, shop });

  expect(buyBphOffer(save, shop, 0)).toBe(false);
  expect({ save, shop }).toEqual(before);
});

for (const locked of [true, false]) {
  test(`a ${locked ? "locked" : "unaffordable"} reroll never adds a discount stack or advances RNG`, () => {
    const save = freshBphSave(14);
    const effects = locked ? stack : [...unlock, ...stack];
    const shop = createBphShop(save, effects);
    if (!locked) save.coins = 0;
    const before = structuredClone({ save, shop });

    expect(rerollBphShop(save, shop, effects)).toBe(false);
    expect({ save, shop }).toEqual(before);
  });
}

test("restoring the same visit preserves frozen offers, sold receipts, rerolls and RNG", () => {
  const save = freshBphSave(14);
  save.coins = 10;
  const effects = [...unlock, ...stack];
  const shop = createBphShop(save, effects);
  rerollBphShop(save, shop, effects);
  buyBphOffer(save, shop, 0);
  const restored = structuredClone(shop), before = structuredClone(save);

  expect(createBphShop(save, effects, restored)).toBe(restored);
  expect(save).toEqual(before);
  expect(buyBphOffer(save, restored, 0)).toBe(false);
});

test("a new management visit resets rerolls and purchases but retains account discount pity", () => {
  const save = freshBphSave(91);
  save.coins = 20;
  const effects = [...unlock, ...stack, ...BPH_UPGRADE_NODES.SN_RoguelikeDiscountChance.effects];
  const previous = createBphShop(save, effects);
  rerollBphShop(save, previous, effects);
  buyBphOffer(save, previous, 0);
  const misses = previous.discountMisses;
  expect(misses).toBeGreaterThan(0);
  save.lifecycle.managementVisit++;

  const next = createBphShop(save, stack, previous);

  expect(next.rerolls).toBe(0);
  expect(next.purchases).toEqual({});
  expect(next.discountMisses).toBe(misses);
  expect(next.offers.map(bphOfferPrice)).toEqual([2, 2, 2]);
});

test("a stale visit cannot buy or reroll against a later management wallet", () => {
  const save = freshBphSave(14), effects = [...unlock, ...stack];
  const shop = createBphShop(save, effects);
  save.lifecycle.managementVisit++;
  const before = structuredClone({ save, shop });

  expect(buyBphOffer(save, shop, 0)).toBe(false);
  expect(rerollBphShop(save, shop, effects)).toBe(false);
  expect({ save, shop }).toEqual(before);
});

test("discounts and rerolls preserve the per-visit original purchase cap", () => {
  const save = freshBphSave(13);
  save.coins = 50;
  const effects = [...unlock, effect("RoguelikePackDiscountChance", 100)];
  const shop = createBphShop(save, effects);
  for (let slot = 0; slot < 3; slot++) expect(buyBphOffer(save, shop, slot)).toBe(true);
  expect(rerollBphShop(save, shop, effects)).toBe(true);
  expect(buyBphOffer(save, shop, 0)).toBe(true);
  const before = structuredClone(save);

  expect(buyBphOffer(save, shop, 1)).toBe(false);
  expect(save).toEqual(before);
  expect(save.inventory).toHaveLength(4);
});
