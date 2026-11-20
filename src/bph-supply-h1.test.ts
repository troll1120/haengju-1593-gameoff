import { expect, test } from "bun:test";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { freshMeta } from "./meta";
import { freshBphSave, parseBphSave } from "./bph-save";
import { createBphRun } from "./bph-session";
import { buyBphOffer } from "./bph-shop";
import { bphFieldShop, prepareBphFieldShop, prepareBphManagementShop } from "./bph-shop-session";
import { bphRecruitAsk, buyBphRecruitPack } from "./bph-recruit";
import { restockBphRecruit } from "./bph-supply";
import { enterEndless } from "./rules";

const h1 = BPH_UPGRADE_NODES.SN_RoguelikeDiscountChance.effects;
const scenario = (meta = freshMeta()) => {
  meta.bph ??= freshBphSave(13);
  const run = createBphRun(meta, { seed: 7, general: "권율", upgrades: h1 });
  if (!run.bph) throw new TypeError("Expected BPH battle");
  return { meta, run, battle: run.bph };
};

test("reading the field shop before preparation throws without consuming RNG", () => {
  const { run, battle } = scenario();
  const rng = [battle.save.rng, run.rng];
  expect(() => restockBphRecruit(run)).toThrow(RangeError);
  expect([battle.save.rng, run.rng]).toEqual(rng);
  expect(bphFieldShop(run)).toBeUndefined();
  expect(battle.save).not.toHaveProperty("shop");
});

test("a parsed H1 management visit has no effect on field offers, sold stock or price", () => {
  const { meta, battle } = scenario();
  const management = prepareBphManagementShop(battle.save, h1);
  if (!management) throw new TypeError("Expected an H1 management shop");
  battle.save.coins = 100;
  expect(buyBphOffer(battle.save, management, 0)).toBe(true);
  meta.bph = parseBphSave(JSON.parse(JSON.stringify(battle.save)));
  const { run } = scenario(meta);
  const rng = [meta.bph.rng, run.rng];
  const managementBytes = JSON.stringify(meta.bph.shop);

  prepareBphFieldShop(run);
  const field = restockBphRecruit(run);
  expect(bphFieldShop(run)).toBe(field);
  expect(field).not.toBe(meta.bph.shop);
  expect(field.offers).toEqual([{ packId: "Pack1_Basic", box: false, price: 2, discounted: false, sold: false }]);
  for (let i = 0; i < 5; i++) expect(buyBphRecruitPack(run, "Pack1_Basic")).not.toBeNull();
  expect(bphRecruitAsk(run, field.offers[0])).toBe(64);
  expect(JSON.stringify(meta.bph.shop)).toBe(managementBytes);
  expect([meta.bph.rng, run.rng]).toEqual(rng);
  const saved = JSON.stringify(meta.bph);
  const next = scenario(meta).run;
  prepareBphFieldShop(next);
  expect(bphRecruitAsk(next, restockBphRecruit(next).offers[0])).toBe(2);
  expect(JSON.stringify(meta.bph)).toBe(saved);
});

test("endless buys from its own catalog and leaves the saved H1 shop alone", () => {
  const { meta, battle } = scenario();
  meta.nodes.push("endless");
  const management = prepareBphManagementShop(battle.save, h1);
  if (!management) throw new TypeError("Expected an H1 management shop");
  battle.save.coins = 1;
  const visit = JSON.stringify(management);
  const run = createBphRun(meta, { seed: 7, general: "권율", upgrades: h1, endless: true });
  enterEndless(run);
  const rng = [battle.save.rng, run.rng];
  prepareBphFieldShop(run);
  const field = restockBphRecruit(run);
  expect(run.gold).toBe(Math.min(12, battle.save.income));
  expect(field).not.toBe(management);
  expect(buyBphRecruitPack(run, "Pack1_Basic")).not.toBeNull();
  expect(JSON.stringify(battle.save.shop)).toBe(visit);
  expect([battle.save.rng, run.rng]).toEqual(rng);
});
