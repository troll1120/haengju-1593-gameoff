import { expect, test } from "bun:test";
import { grantBphRelic, equipBphRelic, grantBphMastery } from "./bph-account";
import { bphFxContext } from "./bph-fx-dispatch";
import { BPH_PACKS, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { hitBphPack } from "./bph-combat";
import { freshBphSave } from "./bph-save";
import { createBphRun } from "./bph-session";
import { activeBphEffects } from "./bph-upgrades";
import { buyBphOffer } from "./bph-shop";
import type { BphShop } from "./bph-shop";
import { freshMeta } from "./meta";
import { openBphPack } from "./bph";

function battle(id: string, equipped = true) {
  const meta = freshMeta(), save = freshBphSave(83271);
  grantBphRelic(save, id);
  if (equipped) expect(equipBphRelic(save, id)).toBe(true);
  save.totalOpened = 100;
  save.discovered = [...Object.keys(BPH_PROFILES), ...Object.keys(BPH_TOMES)];
  save.foils = [...save.discovered];
  for (const pack of Object.values(BPH_PACKS))
    save.packs[pack.id] = { opened: 100, sinceNewHero: 0, sinceNewFoil: 0 };
  meta.bph = save;
  const run = createBphRun(meta, { seed: 83271, general: "권율", upgrades: activeBphEffects(save) });
  const ctx = bphFxContext(run)!;
  const open = (packId = "Pack2_Advanced", multiplier = 1) => {
    ctx.grantPack(packId, 1);
    const pack = save.inventory.at(-1)!;
    if (multiplier > 1) pack.multiplier = multiplier;
    hitBphPack(run, pack.id);
    return hitBphPack(run, pack.id)[0];
  };
  return { run, save, ctx, open };
}

test.each([
  ["Relic1_CharmWarrior", "spearman", "Pack2_Advanced"],
  ["Relic1_CharmArcanist", "monk", "Pack2_Advanced"],
  ["Relic1_CharmMystic", "monk", "Pack2_Advanced"],
  ["Relic1_CharmOutcast", "militia", "Pack3_Magic"],
  ["R_ArcanistTomePower", "monk", "Pack2_Advanced"],
  ["R_CharmHunter", "militia", "Pack3_Magic"],
  ["R_HunterPeriodicInvisibility", "archer", "Pack3_Magic"],
  ["R_MysticSpawnFortify", "spearman", "Pack2_Advanced"],
  ["R_WarriorAliveGiant", "spearman", "Pack2_Advanced"],
  ["R_HunterArrowBounce - Demo", "archer", "Pack3_Magic"],
  ["R_WarriorsSpawnFortify - Demo", "monk", "Pack2_Advanced"],
] as const)("%s increases matching troop arrivals from actual battle packs", (id, cls, packId) => {
  const totals = [false, true].map(worn => {
    const f = battle(id, worn);
    let count = 0;
    for (let i = 0; i < 160; i++) {
      const result = f.open(packId);
      count += result.cards.filter(card => BPH_PROFILES[card.profileId]?.classId === cls).length;
    }
    // These cards are spawned synchronously by hitBphPack, not presentation-only draws.
    expect(f.run.squads[0].soldiers.length).toBeGreaterThan(0);
    return count;
  });
  expect(totals[1]).toBeGreaterThan(totals[0]);
});

test("the ring does not share the equipped Coin Purse's recruitment weight with archers", () => {
  const draw = (ringEquipped: boolean, purseEquipped: boolean) => {
    const { save } = battle("Relic1_CharmOutcast", purseEquipped);
    const ring = "Relic_HuntersAreOutcast";
    save.relicState.slots = 1;
    expect(grantBphRelic(save, ring)).toBe(true);
    if (ringEquipped) expect(equipBphRelic(save, ring)).toBe(true);
    const effects = activeBphEffects(save);
    return Array.from({ length: 160 }, () => openBphPack(save, { packId: "Pack3_Magic", effects }))
      .flatMap(result => result.cards.map(card => card.profileId));
  };
  const purse = draw(false, true);
  expect(purse).toContain("Hero3_DemonSlayer");
  expect(purse.filter(id => id === "Hero3_WitchDoctor").length)
    .toBeGreaterThan(draw(false, false).filter(id => id === "Hero3_WitchDoctor").length);
  expect(draw(true, true)).toEqual(purse);
});

test.each(["R_HunterPeriodicInvisibility", "R_HunterArrowBounce - Demo"] as const)(
  "%s leaves weights alone in a pack with a legacy hunter but no archer",
  id => {
    const draw = (worn: boolean) => {
      const { save, ctx } = battle(id, worn);
      return Array.from({ length: 80 }, () => openBphPack(save, { packId: "Pack5_Skeleton", effects: ctx.effects }))
        .flatMap(result => result.cards.map(card => card.profileId));
    };
    const owned = draw(false);
    expect(owned).toContain("Hero6_Shotgun");
    expect(draw(true)).toEqual(owned);
  },
);

test("TomeDuration increases real battle tactic arrivals as well as duration", () => {
  const counts = [false, true].map(worn => {
    const f = battle("Relic1_TomeDuration", worn);
    for (let i = 0; i < 600; i++) f.open("Pack6_Forest");
    // Active copies share one tome entry; completed battle receipts retain every arrival.
    return f.run.bph!.receipts.flatMap(receipt => receipt.cards)
      .filter(card => BPH_TOMES[card.profileId]).length;
  });
  expect(counts[1]).toBeGreaterThan(counts[0]);
});

test("Portal replaces only the first battle pack, gives one support ship, and resets on the next battle", () => {
  const f = battle("R_FirstPackPortal");
  const first = f.open("Pack2_Advanced", 5);
  expect(first.cards.map(card => card.profileId)).toEqual(["Hero3_Portal"]);
  expect(first.multiplier).toBeUndefined();
  expect(f.run.squads[0].soldiers.filter(unit => unit.bph?.profileId === "Hero3_Portal")).toHaveLength(1);
  expect(f.open().cards.every(card => card.profileId !== "Hero3_Portal")).toBe(true);
  const meta = freshMeta(); meta.bph = f.save;
  const next = createBphRun(meta, { seed: 83271, general: "권율", upgrades: activeBphEffects(f.save) });
  const ctx = bphFxContext(next)!;
  ctx.grantPack("Pack2_Advanced", 1);
  const pack = f.save.inventory.at(-1)!;
  hitBphPack(next, pack.id);
  expect(hitBphPack(next, pack.id)[0].cards.map(card => card.profileId)).toEqual(["Hero3_Portal"]);
});

test("WarBanner increases actual mastery grants once per purchased pack/box type", () => {
  const f = battle("_REMOVERelic1_WarBanner");
  const shop: BphShop = { managementVisit: f.save.lifecycle.managementVisit, rerolls: 0,
    discountMisses: 0, purchases: {}, offers: [
      { packId: "Pack2_Advanced", box: false, sold: false, price: 0, discounted: false },
      { packId: "Pack2_Advanced", box: false, sold: false, price: 0, discounted: false },
      { packId: "Pack3_Magic", box: false, sold: false, price: 0, discounted: false },
      { packId: "Pack2_Advanced", box: true, sold: false, price: 0, discounted: false },
      { packId: "Pack1_Basic", box: false, sold: false, price: 2, discounted: false },
    ] };
  const increments = [1.1, 1.1, 1.2, 1.3];
  for (let i = 0; i < increments.length; i++) {
    expect(buyBphOffer(f.save, shop, i, 0, "battle")).toBe(true);
    const before = f.save.resources.mastery;
    grantBphMastery(f.save, { receiptId: `banner-test:${i}`, amount: 100, source: "combat" });
    expect(f.save.resources.mastery - before).toBeCloseTo(100 * increments[i], 4);
  }
  expect(buyBphOffer(f.save, shop, 3, 0, "battle")).toBe(true);
  const beforeRepeatGrant = f.save.resources.mastery;
  grantBphMastery(f.save, { receiptId: "banner-test:repeat", amount: 100, source: "combat" });
  expect(f.save.resources.mastery - beforeRepeatGrant).toBeCloseTo(130, 4);

  f.save.coins = 0;
  const before = f.save.resources.mastery;
  expect(buyBphOffer(f.save, shop, 4, undefined, "battle")).toBe(false);
  grantBphMastery(f.save, { receiptId: "banner-test:failed", amount: 100, source: "combat" });
  expect(f.save.resources.mastery - before).toBeCloseTo(130, 4);
});
