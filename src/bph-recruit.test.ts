import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { freshMeta } from "./meta";
import { createBphRun } from "./bph-session";
import { createBphShop } from "./bph-shop";
import { bphFieldShop, prepareBphFieldShop, prepareBphManagementShop } from "./bph-shop-session";
import { BPH_ARRIVAL, hitBphPack } from "./bph-combat";
import { advance, troopCap, troopCount } from "./rules";
import type { Run } from "./rules";
import { CENTER, setFieldSize } from "./geometry";
import { parseBphSave } from "./bph-save";
import { BPH_PACKS, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { activeBphEffects, BPH_PLACEMENTS, prepareBphUpgrades } from "./bph-upgrades";
import { BPH_RECRUIT_TABLE, bphRecruitMean, bphRecruitMultiplier, bphRecruitOfferPrice, bphRecruitPrice, bphRecruitRoll, bphUnitPack, buyBphRecruit } from "./bph-recruit";
import type { BphRecruitTable } from "./bph-recruit";
import { BPH_REVEAL, bphRevealCount, bphRevealDiscovery, bphRevealReel } from "./bph-view";
import { freshBphSave } from "./bph-save";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { openBphPack } from "./bph";
import { bphRecruitControlHashes as baseline } from "./bph-recruit-control-fixture";

setFieldSize(370, 800);
const only = (count: number): BphRecruitTable => ({ multiplier: [{ count, weight: 1 }], price: BPH_RECRUIT_TABLE.price });
const scenario = (seed: number, table: BphRecruitTable = BPH_RECRUIT_TABLE, upgrades: readonly ReturnType<typeof activeBphEffects>[number][] = [], field = false) => {
  const run = createBphRun(freshMeta(), { seed, general: "권율", upgrades });
  const battle = run.bph!;
  if (field) prepareBphFieldShop(run);
  const shop = field ? bphFieldShop(run) : createBphShop(battle.save, battle.upgrades);
  if (!shop) throw new Error("Expected a prepared field shop");
  for (let t = 0; t < 20; t++) advance(run, .05);
  return { run, battle, shop };
};
const tryPurchase = (run: Run, shop: ReturnType<typeof createBphShop>, table: BphRecruitTable, slot = 0) => {
  const instance = buyBphRecruit(run, shop, slot, table);
  if (!instance) return null;
  run.bph!.packs.push({ ...instance, hp: 1, x: CENTER.x, y: CENTER.y + 70 });
  return hitBphPack(run, instance.id)[0];
};
const purchase = (run: Run, shop: ReturnType<typeof createBphShop>, table: BphRecruitTable, slot = 0) => {
  const receipt = tryPurchase(run, shop, table, slot);
  if (!receipt) throw new Error("purchase refused");
  return receipt;
};
/** Preserve the pinned combat bytes across account-only schema additions. */
const digest = (run: Run, legacyOwnership = false) => createHash("sha256").update(JSON.stringify({ ...run, bph: { ...run.bph, bought: undefined } },
  (key, value) => key === "killTally" || key === "medalScale" || (key === "unitUpgrades" && value && !Object.keys(value).length)
    ? undefined : legacyOwnership && key === "relicState" ? { ...value, owned: ["Relic1_CharmWarrior"] } : value)).digest("hex");

test("the table has mean 1.61 and the battle price doubles after every purchase", () => {
  const total = BPH_RECRUIT_TABLE.multiplier.reduce((sum, entry) => sum + entry.weight, 0);
  expect(BPH_RECRUIT_TABLE.multiplier.map(entry => [entry.count, entry.weight * 100 / total])).toEqual([[1, 60], [2, 25], [3, 10], [4, 4], [5, 1]]);
  expect(bphRecruitMean()).toBeCloseTo(1.61, 10);
  expect([0, 1, 2, 3, 4, 10].map(bought => bphRecruitPrice(2, bought))).toEqual([2, 4, 8, 16, 32, 2048]);
  expect([0, 1, 2, 3, 4, 10].map(bought => bphRecruitPrice(5, bought))).toEqual([5, 10, 20, 40, 80, 5120]);
  for (const pack of Object.values(BPH_PACKS)) expect(bphRecruitPrice(pack.price, 0)).toBe(pack.price);
});
test("the roll is deterministic per seed and ordinal and lands on the table's odds over many draws", () => {
  expect(bphRecruitRoll(7, 0)).toBe(bphRecruitRoll(7, 0));
  expect(bphRecruitRoll(7, 0)).not.toBe(bphRecruitRoll(7, 1));
  const tally = [0, 0, 0, 0, 0, 0];
  for (let seed = 1; seed <= 2000; seed++) for (let ordinal = 0; ordinal < 50; ordinal++) tally[bphRecruitMultiplier(seed, ordinal)]++;
  const share = tally.map(count => count / 100000 * 100);
  expect(share[1]).toBeGreaterThan(59); expect(share[1]).toBeLessThan(61);
  expect(share[2]).toBeGreaterThan(24); expect(share[2]).toBeLessThan(26);
  expect(share[3]).toBeGreaterThan(9); expect(share[3]).toBeLessThan(11);
  expect(share[4]).toBeGreaterThan(3.5); expect(share[4]).toBeLessThan(4.5);
  expect(share[5]).toBeGreaterThan(.8); expect(share[5]).toBeLessThan(1.2);
});
// Survival v2, 33c1176: forced-x1 control, 20 ticks before purchase and 600 after.
// Re-recorded for the native unit-ability restoration (hero spells cast from effective
// attack damage, WitchDoctor/Stormcaller/Quasar executors, martial families, pity windows).
// Round-3 bundle: re-recorded once more for edde03b (orthographic attack reach) combined with 0ef5f66.
// Round-4 bundle: rehashed for ba634d8's 15:00 contract only because the survival state gained its boss
// side stream (bossRng, bossBag, bossGroups); stripping those three fields reproduces the round-4 pre-merge hashes.
// fix/general-jitter-1117: re-recorded because a survival general who has fought or reached his post now holds his
// spot once his side is empty instead of walking back (owner DM 1794892449.075779).
// Re-recorded again because survival fighters keep the nearest target with a short hold and melee walkers no longer
// press into the wall (owner DMs 1794894265.835729, 1794894371.056399, 1794894507.597969); with those rules off the old hashes return.
// Re-recorded for gates in all four walls (owner DM 1794899184.599879); with the survival castle limited to the south gate the old hashes return.
// Round-8 bundle: re-recorded with dataStamp a230e1944a949db5 (c733d9c's tunables.json now carries general growth's six-band cannon row)
// on top of the round-8 battle changes (general growth, kill drops, melee contact, wall battery, ult lag, 격려).
// Round-9: the approved general basic-attack/reach branch 3b12508 changes combat.
// Its forced-x1 control matches all 12 merged-run hashes, including the perf changes; dataStamp is unchanged.
// Round-10: owner-approved march 20bee12 changes soldier paths, followed by split v2
// e35c6de/5186eb2, castle defense 539b760 and prism receipt metadata 17fa22e.
// Re-pin the complete forced-x1 runs; do not strip movement state. dataStamp remains a230e1944a949db5.
// Field-by-field evidence: castle-merge-round10/replay-diagnosis-weather-recruit.ko.md.
// Historical v1 (ef4ea46) and f9a80de remain superseded; approved behavior changes move outcomes.
// Survival v3 uses denser waves, general growth, a 12-HP keep and a shared coin budget.
// For the v3 fixture, all 12 forced-x1 controls diverge from d5ba3b3 on the first tick
// after purchase and match e9673bc through the relic merge. Preserve the full replay bytes.
// The economy update re-records the forced-x1 controls with reduced ordinary coin drops.
test.each([false, true])("an x1 first purchase matches survival v3 control bytes, including field startup=%s", field => {
  let identical = 0;
  const managementHashes: Record<string, string> = {};
  for (const seed of Object.keys(baseline)) {
    const { run, shop } = scenario(Number(seed), BPH_RECRUIT_TABLE, [], field);
    expect(bphRecruitOfferPrice(run, shop)).toBe(BPH_PACKS.Pack1_Basic.price);
    const receipt = purchase(run, shop, BPH_RECRUIT_TABLE);
    for (let t = 0; t < 600; t++) advance(run, .05);
    // Field startup builds a permanent catalog without consuming management shop RNG.
    // Compare roulette to a forced draw on the same startup path, including the catalog.
    const control = scenario(Number(seed), BPH_RECRUIT_TABLE, [], field);
    purchase(control.run, control.shop, only(1));
    for (let t = 0; t < 600; t++) advance(control.run, .05);
    const expected = digest(control.run);
    expect(control.run.bph!.save.relicState.owned).toEqual([]);
    if (!field) managementHashes[seed] = digest(control.run, true);
    else expect(control.run.bph!.recruitShop?.offers.map(offer => offer.packId)).toEqual(["Pack1_Basic"]);
    if (bphRecruitMultiplier(Number(seed), 0) === 1) {
      identical++;
      expect(receipt.multiplier).toBeUndefined(); expect(receipt.spawned).toBeUndefined();
      expect(run.bph!.save.inventory).toEqual([]);
      expect(digest(run)).toBe(expected);
    } else {
      expect(receipt.multiplier).toBeGreaterThan(1);
      expect(digest(run)).not.toBe(expected);
    }
  }
  expect(identical).toBeGreaterThanOrEqual(4);
  // Run all roulette-vs-forced checks before comparing the management replay to the pinned bytes.
  if (!field) expect(managementHashes).toEqual(baseline);
});
test("a forced x3 spawns three units exactly like three normal recruits, counted on the receipt", () => {
  const { run, battle, shop } = scenario(3, only(3));
  const before = troopCount(run), nextId = run.nextId;
  const receipt = purchase(run, shop, only(3));
  expect(receipt).toMatchObject({ multiplier: 3, spawned: 3 });
  const recruits = run.squads[0].soldiers.filter(unit => unit.bph?.resultId === receipt.id && unit.bph.cause === "pack");
  expect(recruits).toHaveLength(3); expect(troopCount(run)).toBe(before + 3);
  expect(recruits.map(unit => unit.id)).toEqual([nextId, nextId + 1, nextId + 2]);
  for (const unit of recruits) expect({ kind: unit.kind, hp: unit.hp, maxHp: unit.maxHp, tier: unit.tier, profile: unit.bph?.profileId })
    .toEqual({ kind: recruits[0].kind, hp: recruits[0].hp, maxHp: recruits[0].maxHp, tier: 1, profile: receipt.cards[0].profileId });
  expect(battle.bought).toEqual({ Pack1_Basic: 1 });
  expect(bphRevealCount(receipt)).toBe("×3");
});
test("the same field pack starts at 2, doubles at every purchase and debits the quoted price", () => {
  const { run, battle, shop } = scenario(5, only(1), [], true);
  run.gold = 130;
  const paid: number[] = [];
  for (let purchaseIndex = 0; purchaseIndex < 6; purchaseIndex++) {
    const price = bphRecruitOfferPrice(run, shop, only(1)), gold = run.gold;
    const instance = buyBphRecruit(run, shop, 0, only(1));
    if (!instance) throw new Error("purchase refused");
    // Observe the purchase debit before opening can pay a new codex discovery.
    paid.push(gold - run.gold);
    expect(paid[purchaseIndex]).toBe(price);
    battle.packs.push({ ...instance, hp: 1, x: CENTER.x, y: CENTER.y + 70 });
    hitBphPack(run, instance.id);
  }
  expect(paid).toEqual([2, 4, 8, 16, 32, 64]); expect(battle.bought).toEqual({ Pack1_Basic: 6 });
  expect(bphRecruitOfferPrice(run, shop, only(1))).toBe(128);
});
test("tome recruits never multiply while unit packs do", () => {
  expect(bphUnitPack("Pack_Tomes")).toBe(false);
  for (const id of ["Pack1_Basic", "Pack2_Advanced", "Pack3_Magic", "Pack4_Royal", "Pack6_Forest"]) expect(bphUnitPack(id)).toBe(true);
  const { run, battle, shop } = scenario(9, only(5));
  run.gold = 20; shop.offers[0] = { packId: "Pack_Tomes", box: false, sold: false,
    price: BPH_PACKS.Pack_Tomes.price, discounted: false };
  const receipt = purchase(run, shop, only(5));
  expect(receipt.packId).toBe("Pack_Tomes"); expect(receipt.multiplier).toBeUndefined();
  expect(battle.save.inventory).toEqual([]); expect(battle.tomes).toHaveLength(1);
  expect(bphRevealCount(receipt)).toBe("×1");
});
test("x5 ignores the legacy troop cap like every pack spawn: a fresh account gets five units from one basic pack", () => {
  const { run, shop } = scenario(11, only(5));
  expect(troopCap(run)).toBeLessThan(5);
  const before = troopCount(run);
  const receipt = purchase(run, shop, only(5));
  expect(receipt).toMatchObject({ multiplier: 5, spawned: 5 });
  expect(troopCount(run)).toBe(before + 5);
  expect(run.squads[0].soldiers.filter(unit => unit.bph?.resultId === receipt.id && unit.bph.cause === "pack")).toHaveLength(5);
  expect(bphRevealCount(receipt)).toBe("×5");
});
test("with the full upgrade tree a forced x5 yields five times the roster gain of x1 and the label shows what spawned", async () => {
  await prepareBphUpgrades();
  const gain = (multiplier: number) => {
    const meta = freshMeta(), probe = createBphRun(meta, { seed: 1, general: "권율", upgrades: [] });
    const save = probe.bph!.save;
    save.purchasedPlacements = [...BPH_PLACEMENTS.keys()];
    // Pity pins the draw to the Illusionist. Its retired tree nodes no longer add copies.
    save.discovered = ["Hero3_WitchDoctor", "Hero3_DemonSlayer", "Hero3_Portal"]; save.income = 20;
    save.packs.Pack3_Magic = { opened: 0, sinceNewHero: 12, sinceNewFoil: 0 };
    const upgrades = activeBphEffects(save);
    expect(upgrades.length).toBeGreaterThan(50);
    const run = createBphRun(meta, { seed: 23, general: "권율", upgrades });
    const battle = run.bph!, shop = createBphShop(battle.save, upgrades);
    run.gold = 999; battle.save.coins = 999;
    shop.offers[0] = { packId: "Pack3_Magic", box: false, sold: false,
      price: BPH_PACKS.Pack3_Magic.price, discounted: false };
    const before = troopCount(run);
    const receipt = purchase(run, shop, only(multiplier));
    const direct = run.squads[0].soldiers.filter(unit => unit.bph?.resultId === receipt.id && unit.bph.cause === "pack").length;
    return { receipt, direct, total: troopCount(run) - before };
  };
  const single = gain(1), five = gain(5);
  expect(single.receipt.cards[0].profileId).toBe("Hero3_Illusionist");
  expect(five.receipt.cards[0].profileId).toBe("Hero3_Illusionist");
  expect(single.receipt.multiplier).toBeUndefined(); expect(five.receipt.multiplier).toBe(5);
  expect(single).toMatchObject({ direct: 1, total: 1 });
  expect(five).toMatchObject({ direct: 5, total: 5 });
  expect(five.receipt.spawned).toBe(5);
  expect(bphRevealCount(five.receipt)).toBe("×5");
});
test("the first draw of a unit carries the discovery badge and its reward; the second draw of the same unit does not", () => {
  const save = freshBphSave(88);
  const first = openBphPack(save, { packId: "Pack1_Basic", effects: [] }), second = openBphPack(save, { packId: "Pack1_Basic", effects: [] });
  expect(first.cards[0].profileId).toBe("Hero1_Squire"); expect(second.cards[0].profileId).toBe("Hero1_Squire");
  expect(bphRevealDiscovery(first)).toEqual({ isNew: true, foil: false, bonus: BPH_PROFILES.Hero1_Squire.discoveryBonus, resource: "mastery" });
  expect(bphRevealDiscovery(second)).toMatchObject({ isNew: false });
  const tome = openBphPack(save, { packId: "Pack_Tomes", effects: [] });
  expect(bphRevealDiscovery(tome)).toMatchObject({ isNew: true, bonus: BPH_TOMES[tome.cards[0].profileId].discoveryBonus });
});
test("a reload keeps the rolled multiplier on the inventory and the spawned count on the receipt", () => {
  const { run, battle, shop } = scenario(4, only(4));
  const instance = buyBphRecruit(run, shop, 0, only(4));
  expect(instance?.multiplier).toBe(4);
  const restored = parseBphSave(JSON.parse(JSON.stringify(battle.save)));
  expect(restored.inventory[0]).toMatchObject({ id: instance!.id, packId: "Pack1_Basic", multiplier: 4 });
  battle.packs.push({ ...instance!, hp: 1, x: CENTER.x, y: CENTER.y });
  const receipt = hitBphPack(run, instance!.id)[0];
  const again = parseBphSave(JSON.parse(JSON.stringify(battle.save)));
  expect(again.pendingResults[0]).toMatchObject({ id: receipt.id, multiplier: 4, spawned: 4 });
});
test("the reel cycles the pack's own pool and its last cell precedes the drawn card and the rolled number", () => {
  for (const pack of Object.values(BPH_PACKS)) {
    if (!pack.pool.length || !pack.pool.some(item => bphUnitPack(pack.id) || item.id.startsWith("Tome_"))) continue;
    for (const item of pack.pool) for (const multiplier of [1, 3, 5]) {
      const result = { id: 1, packId: pack.id, ordinal: 1, frenzy: false, reason: "weighted" as const,
        cards: [{ profileId: item.id, foil: false, copies: 1, discovered: false }], ...(multiplier > 1 ? { multiplier } : {}) };
      const reel = bphRevealReel(result);
      expect(reel.order.every(id => pack.pool.some(entry => entry.id === id))).toBe(true);
      expect(reel.order[(reel.start + BPH_REVEAL.unitCells) % reel.order.length]).toBe(item.id);
      expect(reel.counts[(reel.countStart + BPH_REVEAL.numberCells) % reel.counts.length]).toBe(multiplier);
    }
  }
  // Owner DM 1794884319: about 2-2.5 s in total, the unit reel stopping before the multiplier reel.
  expect(BPH_ARRIVAL.numberStop).toBeGreaterThanOrEqual(2); expect(BPH_ARRIVAL.numberStop).toBeLessThanOrEqual(2.5);
  expect(BPH_ARRIVAL.unitStop).toBeLessThan(BPH_ARRIVAL.numberStop);
});

const discountedVisit = (seed: number) => {
  const meta = freshMeta();
  meta.bph = freshBphSave(seed);
  const upgrades = BPH_UPGRADE_NODES.SN_RoguelikeDiscountChance.effects;
  const run = createBphRun(meta, { seed: 144, general: "권율", upgrades });
  const battle = run.bph, shop = battle && prepareBphManagementShop(battle.save, upgrades);
  if (!battle || !shop) throw new Error("Expected the actual H1 management shop");
  run.gold = battle.save.coins = 10;
  return { meta, run, battle, shop, upgrades };
};

test.each([
  { seed: 13, quotes: [1, 1, 1], charges: [1, 1, 2] },
  { seed: 6, quotes: [2, 2, 1], charges: [2, 2, 2] },
])("seed $seed charges each frozen slot quote with the shared pack purchase count", ({ seed, quotes, charges }) => {
  const { run, battle, shop } = discountedVisit(seed);
  battle.bought.Pack1_Basic = 3;
  expect(shop.offers.map(offer => offer.price)).toEqual([...quotes]);
  const frozen = shop.offers.map(({ price, discounted }) => ({ price, discounted }));
  const misses = shop.discountMisses, saveRng = battle.save.rng, runRng = run.rng;
  const paid: number[] = [];

  for (let slot = 0; slot < 3; slot++) {
    const shown = bphRecruitOfferPrice(run, shop), before = run.gold;
    expect(buyBphRecruit(run, shop, slot)).not.toBeNull();
    paid.push(before - run.gold);
    expect(shown).toBe(charges[slot]);
    expect(paid[slot]).toBe(shown);
  }

  expect(paid).toEqual([...charges]);
  expect(battle.bought).toEqual({ Pack1_Basic: 6 });
  expect(shop.offers.map(({ price, discounted }) => ({ price, discounted }))).toEqual(frozen);
  expect(shop.discountMisses).toBe(misses);
  expect(battle.save.rng).toBe(saveRng);
  expect(run.rng).toBe(runRng);
});

test("a wallet that covers the quote but not escalation cannot buy or mutate the run", () => {
  const { run, battle, shop } = discountedVisit(13);
  battle.bought.Pack1_Basic = 3;
  expect(buyBphRecruit(run, shop, 0)).not.toBeNull();
  expect(buyBphRecruit(run, shop, 1)).not.toBeNull();
  run.gold = battle.save.coins = 1;
  const before = JSON.stringify(run);

  expect(bphRecruitOfferPrice(run, shop)).toBe(2);
  expect(buyBphRecruit(run, shop, 2)).toBeNull();

  expect(JSON.stringify(run)).toBe(before);
});

test("a previous visit cannot debit a battle wallet or increment roulette purchases", () => {
  const { run, battle, shop } = discountedVisit(13);
  battle.save.lifecycle.managementVisit++;
  const before = JSON.stringify(run);

  expect(buyBphRecruit(run, shop, 0)).toBeNull();

  expect(JSON.stringify(run)).toBe(before);
});

test("resuming H1 keeps quotes and wallet while resetting unsaved battle purchase counts", () => {
  const { meta, run, battle, shop, upgrades } = discountedVisit(13);
  battle.bought.Pack1_Basic = 3;
  expect(buyBphRecruit(run, shop, 0)).not.toBeNull();
  expect(buyBphRecruit(run, shop, 1)).not.toBeNull();
  expect(bphRecruitOfferPrice(run, shop)).toBe(2);
  const saved = JSON.stringify(battle.save), beforeShop = JSON.stringify(shop);
  const coins = battle.save.coins, rng = battle.save.rng;

  meta.bph = parseBphSave(JSON.parse(saved));
  const resumed = createBphRun(meta, { seed: 144, general: "권율", upgrades });
  const resumedShop = prepareBphManagementShop(meta.bph, upgrades);
  if (!resumedShop || !resumed.bph) throw new Error("Expected resumed H1 management shop");

  expect(resumed.gold).toBe(coins);
  expect(meta.bph.coins).toBe(coins);
  expect(JSON.stringify(resumedShop)).toBe(beforeShop);
  expect(meta.bph.rng).toBe(rng);
  expect(resumed.bph.bought).toEqual({});
  expect(bphRecruitOfferPrice(resumed, resumedShop)).toBe(1);
  for (const key of ["bought", "supplyAt", "recruitShop"]) {
    expect(JSON.parse(saved)).not.toHaveProperty(key);
    expect(meta.bph).not.toHaveProperty(key);
  }
  const normalized = JSON.stringify(meta.bph);
  expect(JSON.stringify(parseBphSave(JSON.parse(normalized)))).toBe(normalized);
});
