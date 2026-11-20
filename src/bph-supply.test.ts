import { expect, test } from "bun:test";
import { freshMeta } from "./meta";
import { createBphRun } from "./bph-session";
import { BPH_PACKS } from "./bph-data";
import { freshBphSave } from "./bph-save";
import { buyBphOffer, createBphShop, bphUnlockedTroopPacks } from "./bph-shop";
import { BPH_PLACEMENTS, BPH_UPGRADE_NODES } from "./bph-upgrades";
import { questRewardPack } from "./bph-quests";
import { prepareBphFieldShop } from "./bph-shop-session";
import { bphRecruitAsk, bphRecruitMultiplier, buyBphRecruit, buyBphRecruitPack } from "./bph-recruit";
import { restockBphRecruit } from "./bph-supply";

const owned = { opened: 1, sinceNewHero: 0, sinceNewFoil: 0 };
const scenario = (save = freshBphSave(7)) => {
  const meta = freshMeta();
  meta.bph = save;
  const run = createBphRun(meta, { seed: 7, general: "권율", upgrades: [] });
  const battle = run.bph;
  if (!battle) throw new TypeError("Missing BPH battle");
  prepareBphFieldShop(run);
  return { run, battle, shop: restockBphRecruit(run) };
};

test("fresh candidates include basic only, and claimed or previously owned troops are recognized", () => {
  const save = freshBphSave(7);
  const quest = [...BPH_PLACEMENTS.values()].find(p =>
    p.nodeId && questRewardPack(BPH_UPGRADE_NODES[p.nodeId]) === "Pack2_Advanced");
  if (!quest) throw new TypeError("Missing Advanced pack quest");
  expect(bphUnlockedTroopPacks(save, [])).toEqual(["Pack1_Basic"]);
  save.questProgress[`claims:${quest.id}`] = 1;
  save.packs.Pack_Tomes = owned;
  save.packs.Pack4_Royal = owned;
  save.packs.DeliveryBox = owned;
  expect(new Set(bphUnlockedTroopPacks(save, []))).toEqual(new Set(["Pack1_Basic", "Pack2_Advanced", "Pack4_Royal"]));
});

test("the field has one fixed-price quote per unlocked pack regardless of income or box unlock", () => {
  const save = freshBphSave(7);
  save.packs.Pack1_Basic = { ...owned, opened: BPH_PACKS.Pack1_Basic.boxUnlock };
  for (const id of ["Pack2_Advanced", "Pack6_Forest", "Pack5_Skeleton", "Pack3_Magic", "Pack7_Arctic", "Pack4_Royal", "Pack_Tomes"])
    save.packs[id] = owned;
  const { run, shop } = scenario(save);
  expect(Object.fromEntries(shop.offers.map(offer => [offer.packId, offer.price]))).toEqual({
    Pack1_Basic: 2, Pack2_Advanced: 3, Pack6_Forest: 5, Pack5_Skeleton: 5,
    Pack3_Magic: 7, Pack7_Arctic: 9, Pack4_Royal: 14, Pack_Tomes: 5,
  });
  expect(shop.offers).toHaveLength(8);
  expect(shop.offers.every(offer => !offer.box && !offer.discounted && !offer.sold)).toBe(true);
  run.gold = 3;
  expect(buyBphRecruitPack(run, "Pack2_Advanced")).toMatchObject({ packId: "Pack2_Advanced" });
  expect(run.gold).toBe(0);
});

test("interleaved field purchases share one price step and roulette stream without restocking", () => {
  const save = freshBphSave(7);
  save.packs.Pack2_Advanced = owned;
  const { run, battle, shop } = scenario(save);
  run.gold = 10000;
  const rng = [run.rng, save.rng];
  const multipliers: number[] = [];
  for (const [packId, price] of [
    ["Pack1_Basic", 2], ["Pack2_Advanced", 6], ["Pack1_Basic", 8], ["Pack2_Advanced", 24],
    ["Pack1_Basic", 32], ["Pack2_Advanced", 96], ["Pack1_Basic", 128], ["Pack1_Basic", 256],
    ["Pack1_Basic", 512], ["Pack2_Advanced", 1536],
  ] as const) {
    const quote = shop.offers.find(offer => offer.packId === packId);
    if (!quote) throw new TypeError("Missing eligible quote");
    const before = run.gold;
    expect(bphRecruitAsk(run, quote)).toBe(price);
    const acquired = buyBphRecruitPack(run, packId);
    expect(acquired).toMatchObject({ packId, box: false });
    expect(run.gold).toBe(before - price);
    multipliers.push(acquired?.multiplier ?? 1);
  }
  run.time = 46;
  expect(restockBphRecruit(run)).toBe(shop);
  expect(shop.offers.every(offer => !offer.sold)).toBe(true);
  expect(multipliers).toEqual(multipliers.map((_, ordinal) => bphRecruitMultiplier(7, ordinal)));
  expect(battle.bought).toEqual({ Pack1_Basic: 6, Pack2_Advanced: 4 });
  expect(save.inventory).toHaveLength(10);
  expect([run.rng, save.rng]).toEqual(rng);
});

test("locked, unknown and unaffordable requests leave the battle and account untouched", () => {
  const { run, battle } = scenario();
  run.gold = 100;
  expect(buyBphRecruitPack(run, "Pack4_Royal")).toBeNull();
  expect(buyBphRecruitPack(run, "missing")).toBeNull();
  expect(battle.bought).toEqual({});
  expect(battle.save.inventory).toEqual([]);
  expect(run.gold).toBe(100);
  for (let i = 0; i < 5; i++) expect(buyBphRecruitPack(run, "Pack1_Basic")).not.toBeNull();
  run.gold = 2;
  const before = JSON.stringify(run);
  expect(buyBphRecruitPack(run, "Pack1_Basic")).toBeNull();
  expect(JSON.stringify(run)).toBe(before);
});

test.each([false, true])("ordinary shops retain their visit cap for box=%s", box => {
  const save = freshBphSave(7), shop = createBphShop(save, []);
  const pack = BPH_PACKS.Pack1_Basic, cap = box ? pack.maxBoxes : pack.maxPurchases;
  save.coins = 10000;
  save.packs[pack.id] = { ...owned, opened: pack.boxUnlock };
  shop.offers = Array.from({ length: cap + 1 }, () => ({
    packId: pack.id, box, sold: false, price: box ? pack.boxPrice : pack.price, discounted: false,
  }));
  expect(shop.offers.map((_, slot) => buyBphOffer(save, shop, slot))).toEqual([
    ...Array.from({ length: cap }, () => true), false,
  ]);
  expect(save.inventory).toHaveLength(cap);
  expect(save.coins).toBe(10000 - cap * (box ? pack.boxPrice : pack.price));
});

test("recruiting from a shop outside the field catalog still enforces the visit cap", () => {
  const { run, battle } = scenario(), shop = createBphShop(battle.save, battle.upgrades);
  run.gold = 10000;
  shop.offers = Array.from({ length: 5 }, () => ({
    packId: "Pack1_Basic", box: false, sold: false, price: BPH_PACKS.Pack1_Basic.price, discounted: false,
  }));
  expect(shop.offers.map((_, slot) => buyBphRecruit(run, shop, slot) !== null)).toEqual([true, true, true, true, false]);
  expect(battle.bought).toEqual({ Pack1_Basic: 4 });
});
