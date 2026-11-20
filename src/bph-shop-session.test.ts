import { expect, test } from "bun:test";
import { enterBphImprovements } from "./bph-account";
import { freshBphSave, parseBphSave } from "./bph-save";
import { createBphRun, settleBphRun } from "./bph-session";
import { bphFieldShop, endBphShopVisit, prepareBphFieldShop, prepareBphManagementShop } from "./bph-shop-session";
import { buyBphOffer, rerollBphShop } from "./bph-shop";
import { enterEndless } from "./rules";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { freshMeta } from "./meta";

const effects = [...BPH_UPGRADE_NODES.SN_RoguelikeDiscountChance.effects,
  ...BPH_UPGRADE_NODES.SN_ShopRerollUnlock.effects,
  ...BPH_UPGRADE_NODES.SN_ShopRerollDiscountChanceStack.effects];

test("a management retry and first reload keep quotes, rerolls, purchases, wallet and RNG", () => {
  const meta = freshMeta();
  meta.bph = freshBphSave(13);
  meta.bph.income = 12;
  createBphRun(meta, { seed: 144, general: "권율", upgrades: effects, startBattle: false });
  const save = meta.bph;
  expect(enterBphImprovements(save)).toBe(true);
  const shop = prepareBphManagementShop(save, effects);
  if (!shop) throw new Error("Active H1 must prepare a real shop");
  expect(rerollBphShop(save, shop, effects)).toBe(true);
  expect(buyBphOffer(save, shop, 0)).toBe(true);
  const before = structuredClone(save);

  meta.bph = parseBphSave(JSON.parse(JSON.stringify(save)));
  const run = createBphRun(meta, { seed: 144, general: "권율", upgrades: effects, startBattle: false });
  expect(enterBphImprovements(meta.bph)).toBe(false);
  prepareBphManagementShop(meta.bph, effects);
  prepareBphFieldShop(run);
  prepareBphFieldShop(run);

  expect(meta.bph.shop).toEqual(before.shop);
  expect(meta.bph.rng).toBe(before.rng);
  expect(meta.bph.coins).toBe(before.coins);
  expect(run.gold).toBe(before.coins);
  expect(meta.bph.inventory).toEqual(before.inventory);
  expect(JSON.stringify(parseBphSave(JSON.parse(JSON.stringify(meta.bph))))).toBe(JSON.stringify(meta.bph));
});

test("a genuine settled visit resets rerolls and purchases but retains original account pity", () => {
  const meta = freshMeta();
  const stackOnly = [...BPH_UPGRADE_NODES.SN_ShopRerollUnlock.effects,
    ...BPH_UPGRADE_NODES.SN_ShopRerollDiscountChanceStack.effects];
  const run = createBphRun(meta, { seed: 144, general: "권율", upgrades: stackOnly, startBattle: false });
  const save = run.bph?.save, shop = save && prepareBphManagementShop(save, stackOnly);
  if (!save || !shop) throw new Error("Active shop is required");
  shop.rerolls = 2; shop.purchases["Pack1_Basic:false"] = 1; shop.discountMisses = 7;
  const visit = shop.managementVisit;

  run.phase = "lost";
  settleBphRun(meta, run);
  settleBphRun(meta, run);
  createBphRun(meta, { seed: 145, general: "권율", upgrades: stackOnly, startBattle: false });
  const next = prepareBphManagementShop(save, stackOnly);

  expect(next).toMatchObject({ managementVisit: visit + 1, rerolls: 0, purchases: {}, discountMisses: 7 });
  const snapshot = JSON.stringify(save);
  expect(prepareBphManagementShop(save, stackOnly)).toBe(next);
  expect(JSON.stringify(save)).toBe(snapshot);
});

test("without applicable shop effects management is a no-op and field setup deals only once", () => {
  const run = createBphRun(freshMeta(), { seed: 144, general: "권율", upgrades: [] });
  const save = run.bph?.save;
  if (!save) throw new Error("Expected a real survival save");
  const before = JSON.stringify(run);

  expect(prepareBphManagementShop(save, [])).toBeUndefined();
  expect(JSON.stringify(run)).toBe(before);
  prepareBphFieldShop(run);
  const dealt = JSON.stringify(run);
  prepareBphFieldShop(run);

  expect(JSON.stringify(run)).toBe(dealt);
  expect(save).not.toHaveProperty("shop");
  expect(bphFieldShop(run)?.offers.map(offer => offer.packId)).toEqual(["Pack1_Basic"]);
});

test.each(["SN_ShopRerollUnlock", "SN_RoguelikeDiscountChance4"])(
  "%s alone retains W0 save bytes and RNG without activating H1",
  id => {
    const save = freshBphSave(13), before = JSON.stringify(save);
    const unrelated = BPH_UPGRADE_NODES[id].effects;

    expect(prepareBphManagementShop(save, unrelated)).toBeUndefined();

    expect(JSON.stringify(save)).toBe(before);
    expect(save.rng).toBe(13);
    const meta = freshMeta();
    meta.bph = save;
    const run = createBphRun(meta, { seed: 144, general: "권율", upgrades: unrelated });
    const control = freshBphSave(13);
    const controlMeta = freshMeta();
    controlMeta.bph = control;
    createBphRun(controlMeta, { seed: 144, general: "권율", upgrades: [] });
    prepareBphFieldShop(run);
    expect(JSON.stringify(save)).toBe(JSON.stringify(control));
  },
);

test("an endless entry uses its own wallet and catalog without touching a saved H1 visit", () => {
  const meta = freshMeta();
  meta.nodes.push("endless");
  meta.bph = freshBphSave(13);
  meta.bph.income = 12;
  const shop = prepareBphManagementShop(meta.bph, effects);
  if (!shop) throw new Error("Expected active campaign shop");
  meta.bph.coins = 1;
  const previous = structuredClone(shop), rng = meta.bph.rng;

  const run = createBphRun(meta, { seed: 144, general: "권율", upgrades: effects, endless: true });
  enterEndless(run);
  prepareBphFieldShop(run);

  expect(run.gold).toBe(12);
  expect(meta.bph.shop).toEqual(previous);
  expect(bphFieldShop(run)?.offers.every(offer => !offer.discounted)).toBe(true);
  expect(meta.bph.rng).toBe(rng);
});

test("explicit abandonment ends an H1 visit once without paying combat or quest rewards", () => {
  const meta = freshMeta();
  const run = createBphRun(meta, { seed: 144, general: "권율", upgrades: effects });
  const save = run.bph?.save, shop = save && prepareBphManagementShop(save, effects);
  prepareBphFieldShop(run);
  if (!save || !shop) throw new Error("Expected an active field visit");
  const visit = shop.managementVisit, resources = structuredClone(save.resources);
  const claimed = [...save.lifecycle.claimed], rng = save.rng;

  expect(endBphShopVisit(run)).toBe(true);
  expect(endBphShopVisit(run)).toBe(false);

  expect(save.lifecycle.managementVisit).toBe(visit + 1);
  expect(save.resources).toEqual(resources);
  expect(save.lifecycle.claimed).toEqual(claimed);
  expect(save.rng).toBe(rng);
  const next = createBphRun(meta, { seed: 145, general: "권율", upgrades: effects });
  expect(next.gold).toBe(Math.min(12, save.income));
});
