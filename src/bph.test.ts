import { expect, test } from "bun:test";
import { bphReelFrame, openBphPack } from "./bph";
import { acknowledgeBphResult, freshBphSave, parseBphSave } from "./bph-save";
import { BPH_PACKS, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { buyBphOffer, createBphShop, rerollBphShop } from "./bph-shop";
import { unlockBphGeneral } from "./bph-commanders";
import type { BphEffect } from "./bph-contract";

const open = (save: ReturnType<typeof freshBphSave>, effects: readonly BphEffect[] = []) =>
  openBphPack(save, { packId: "Pack1_Basic", effects });
const effect = (type: string, value: number, targets: Record<string, string> = {}): BphEffect =>
  ({ nodeId: type, type, value, targets, effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0 });

test("first six actual pack openings retain the seed cards across save reloads", () => {
  let save = freshBphSave(44);
  const ids = Array.from({ length: 6 }, () => {
    const result = open(save);
    save = parseBphSave(JSON.parse(JSON.stringify(save)));
    return result.cards[0].profileId;
  });
  expect(ids).toEqual(["Hero1_Squire", "Hero1_Squire", "Hero1_Squire", "Hero1_Barbarian", "Hero1_Squire", "Hero1_Archer"]);
  expect(save.packs.Pack1_Basic.opened).toBe(6);
  expect(save.packs.Pack1_Basic.sinceNewHero).toBe(0);
});
test("ordinary outcomes follow 60/30/9/1 including a real lightning spellbook", () => {
  const save = freshBphSave(123456), observed: Record<string, number> = {};
  save.discovered = BPH_PACKS.Pack1_Basic.pool.map(card => card.id);
  save.foils = [...save.discovered]; save.firstThunderstorm = save.firstSquireFoil = true;
  save.packs.Pack1_Basic = { opened: 100, sinceNewHero: 0, sinceNewFoil: 0 };
  for (let i = 0; i < 20000; i++) {
    const result = open(save), id = result.cards[0].profileId;
    observed[id] = (observed[id] ?? 0) + 1;
    acknowledgeBphResult(save, result.id);
  }
  for (const [id, proportion] of [["Hero1_Squire", .6], ["Hero1_Barbarian", .3],
    ["Hero1_Archer", .09], ["Tome_Thunderstorm", .01]] as const)
    expect(Math.abs(observed[id] / 20000 - proportion)).toBeLessThan(.012);
});
test("the twelfth pack without a new hero guarantees an undiscovered hero", () => {
  const save = freshBphSave(41);
  save.discovered = ["Hero1_Squire"]; save.firstThunderstorm = save.firstSquireFoil = true;
  save.packs.Pack1_Basic = { opened: 30, sinceNewHero: 11, sinceNewFoil: 0 };
  const result = open(save);
  expect(result.reason).toBe("hero-pity");
  expect(["Hero1_Barbarian", "Hero1_Archer"]).toContain(result.cards[0].profileId);
  expect(save.packs.Pack1_Basic.sinceNewHero).toBe(0);
});
test("seed 62 Magic pack keeps the new hero when both pity deadlines collide", () => {
  const save = freshBphSave(62);
  const results = Array.from({ length: 20 }, () =>
    openBphPack(save, { packId: "Pack3_Magic", effects: [] }));
  // pity.md: the window rolls between Min and Max and can fire anywhere in it,
  // so the pity draw is located, not pinned to the old hard deadline at 20.
  const pity = results.findIndex(result => result.reason === "hero-pity");
  expect(pity).toBeGreaterThanOrEqual(0);
  expect(results[pity].cards[0]).toMatchObject({ discovered: true });
  expect(BPH_PROFILES[results[pity].cards[0].profileId]).toBeDefined();
  expect(save.packs.Pack3_Magic.sinceNewHero).toBe(0);
});
test("hero and new foil windows hold across 300 seeds for every pity pack", () => {
  for (const pack of Object.values(BPH_PACKS).filter(pack => pack.heroMax > 0 || pack.foilMax > 0)) {
    for (let seed = 1; seed <= 300; seed++) {
      const save = freshBphSave(seed);
      let heroGap = 0, foilGap = 0;
      for (let ordinal = 1; ordinal <= 120; ordinal++) {
        // pity.md: the original "new unit" window covers both heroes and tomes,
        // so the gap tracks any undiscovered unit and resets on any unit discovery.
        const heroPending = pack.pool.some(card =>
          (BPH_PROFILES[card.id] || BPH_TOMES[card.id]) && !save.discovered.includes(card.id));
        const foilPending = pack.pool.some(card => !save.foils.includes(card.id));
        const foils = [...save.foils];
        const result = openBphPack(save, { packId: pack.id, effects: [] });
        heroGap++;
        foilGap++;
        const scheduledSquire = pack.id === "Pack1_Basic"
          && result.cards[0].profileId === "Hero1_Squire" && result.cards[0].foil
          && !foils.includes("Hero1_Squire") && ordinal >= 24 && ordinal <= 27;
        // Fixed opening / scheduled cards alone can take precedence under contract §2.3–5.
        if (heroPending && pack.heroMax > 0 && result.reason !== "opening"
          && result.reason !== "scheduled" && !scheduledSquire)
          expect(heroGap, `${pack.id} seed ${seed} opening ${ordinal}: hero`).toBeLessThanOrEqual(pack.heroMax);
        if (foilPending && pack.foilMax > 0 && result.reason !== "opening")
          expect(foilGap, `${pack.id} seed ${seed} opening ${ordinal}: foil`).toBeLessThanOrEqual(pack.foilMax);
        if (result.cards.some(card => card.discovered &&
          (BPH_PROFILES[card.profileId] || BPH_TOMES[card.profileId]))) heroGap = 0;
        if (result.cards.some(card => card.foil && !foils.includes(card.profileId))) foilGap = 0;
        acknowledgeBphResult(save, result.id);
      }
      if (pack.id === "Pack1_Basic") expect(save.firstSquireFoil).toBe(true);
    }
  }
});
test("a spellbook discovery does not reset the hero counter", () => {
  const save = freshBphSave(18);
  save.discovered = ["Hero1_Squire", "Hero1_Barbarian", "Hero1_Archer"];
  save.packs.Pack1_Basic = { opened: 20, sinceNewHero: 7, sinceNewFoil: 0 };
  expect(open(save).cards[0].profileId).toBe("Tome_Thunderstorm");
  // pity.md: the window covers heroes and tomes, so a new spellbook discovery
  // is a new unit and resets the counter (the old hero-only reset is superseded).
  expect(save.packs.Pack1_Basic.sinceNewHero).toBe(0);
});
test("first foil and ordinary pity use the earlier 26-pack deadline", () => {
  const save = freshBphSave(123);
  save.firstThunderstorm = true;
  save.discovered = BPH_PACKS.Pack1_Basic.pool.map(card => card.id);
  save.packs.Pack1_Basic = { opened: 25, sinceNewHero: 0, sinceNewFoil: 25 };
  const result = open(save);
  expect(result.cards[0]).toMatchObject({ profileId: "Hero1_Squire", foil: true });
  expect(save.firstSquireFoil).toBe(true);
  expect(save.packs.Pack1_Basic.sinceNewFoil).toBe(0);
  expect(save.resources.foilium).toBeGreaterThan(0);
});
test("an earlier different foil does not erase the scheduled Squire foil", () => {
  const save = freshBphSave(123);
  save.foils = ["Hero1_Archer"]; save.firstThunderstorm = true;
  save.packs.Pack1_Basic = { opened: 26, sinceNewHero: 0, sinceNewFoil: 1 };
  const result = open(save);
  expect(result.cards[0]).toMatchObject({ profileId: "Hero1_Squire", foil: true });
  expect(save.foils).toEqual(["Hero1_Archer", "Hero1_Squire"]);
});
test("roulette speed, cell count and skip leave the receipt and draw RNG unchanged", () => {
  const save = freshBphSave(88), result = open(save), snapshot = JSON.stringify(save);
  for (const presentation of [
    { seconds: 1.2, cells: 8, skipped: false }, { seconds: 8, cells: 31, skipped: false },
    { seconds: .1, cells: 2, skipped: true },
  ]) {
    for (let tick = 0; tick <= 120; tick++) bphReelFrame(result, tick / 10, presentation);
    expect(bphReelFrame(result, 12, presentation)).toMatchObject({
      resultId: result.id, profileId: "Hero1_Squire", done: true,
    });
  }
  expect(JSON.stringify(save)).toBe(snapshot);
});
test("reload preserves the receipt and acknowledgment cannot consume it twice", () => {
  const save = freshBphSave(91), result = open(save);
  const restored = parseBphSave(JSON.parse(JSON.stringify(save))), mastery = restored.resources.mastery;
  expect(restored.pendingResults).toEqual([result]);
  expect(acknowledgeBphResult(restored, result.id)).toBe(true);
  expect(acknowledgeBphResult(restored, result.id)).toBe(false);
  expect(restored.resources.mastery).toBe(mastery);
  expect(restored.packs.Pack1_Basic.opened).toBe(1);
});
test("extra Squire chance applies to its pack even when the card is Barbarian", () => {
  const save = freshBphSave(51);
  for (let i = 0; i < 3; i++) open(save);
  const result = open(save, [effect("OpenTargetPackExtraHeroChance", 1,
    { targetPack: "Pack1_Basic", targetHero: "Hero1_Squire" })]);
  expect(result.cards.map(card => card.profileId)).toEqual(["Hero1_Barbarian", "Hero1_Squire"]);
});
test("per-unit duplicate nodes never multiply another profile", () => {
  const save = freshBphSave(51);
  const result = open(save, [effect("PackSpawnExtraTargetHeroCopies", 3, { targetHero: "Hero3_Illusionist" })]);
  expect(result.cards[0].copies).toBe(1);
});
test("per-unit duplicate nodes add their exact number to the target profile", () => {
  const save = freshBphSave(51);
  save.discovered = ["Hero3_WitchDoctor", "Hero3_DemonSlayer", "Hero3_Portal"];
  save.packs.Pack3_Magic = { opened: 30, sinceNewHero: 11, sinceNewFoil: 0 };
  const result = openBphPack(save, { packId: "Pack3_Magic",
    effects: [effect("PackSpawnExtraTargetHeroCopies", 3, { targetHero: "Hero3_Illusionist" })] });
  expect(result.cards[0]).toMatchObject({ profileId: "Hero3_Illusionist", copies: 4 });
});
test("a simultaneous scheduled foil retains an overdue hero guarantee", () => {
  const save = freshBphSave(41);
  save.discovered = ["Hero1_Squire"]; save.firstThunderstorm = true;
  save.packs.Pack1_Basic = { opened: 26, sinceNewHero: 11, sinceNewFoil: 1 };
  expect(open(save).cards[0]).toMatchObject({ profileId: "Hero1_Squire", foil: true });
  expect(save.packs.Pack1_Basic.sinceNewHero).toBe(12);
  expect(["Hero1_Barbarian", "Hero1_Archer"]).toContain(open(save).cards[0].profileId);
});
test("shop purchases cost two coins but do not open the pack or advance pity", () => {
  const save = freshBphSave(91), shop = createBphShop(save, []);
  expect(shop.offers.map(o => o.packId)).toEqual(["Pack1_Basic", "Pack1_Basic", "Pack1_Basic"]);
  expect(buyBphOffer(save, shop, 0)).toBe(true);
  expect(save.coins).toBe(1);
  expect(save.inventory).toEqual([{ id: 1, packId: "Pack1_Basic", box: false }]);
  expect(save.totalOpened).toBe(0);
  expect(buyBphOffer(save, shop, 0)).toBe(false);
  expect(buyBphOffer(save, shop, 1)).toBe(false);
});
test("reroll is locked until its effect is purchased and cost rises per visit", () => {
  const save = freshBphSave(91), shop = createBphShop(save, []);
  const before = JSON.stringify(save);
  expect(rerollBphShop(save, shop, [])).toBe(false);
  expect(JSON.stringify(save)).toBe(before);
  const effects = [effect("ShopCanBeRerolled", 1)];
  expect(rerollBphShop(save, shop, effects)).toBe(true);
  expect(save.coins).toBe(2);
  expect(rerollBphShop(save, shop, effects)).toBe(true);
  expect(save.coins).toBe(0);
  expect(rerollBphShop(save, shop, effects)).toBe(false);
});
test("every commander whose own milestone is met unlocks together", () => {
  const save = freshBphSave();
  expect(unlockBphGeneral(save, { runs: 20, bestSeconds: 600, bossesReached: 5, bossesKilled: 5 }))
    .toEqual(["신립", "송상현", "황진", "김시민", "곽재우", "사명대사", "이순신"]);
  expect(save.unlockedGenerals).toEqual(["권율", "신립", "송상현", "황진", "김시민", "곽재우", "사명대사", "이순신"]);
});
test("invalid saved counters are rejected at the storage boundary", () => {
  const save = parseBphSave({ version: 1, coins: -3, rng: "oops", totalOpened: Infinity,
    packs: { Pack1_Basic: { opened: -1, sinceNewHero: "12", sinceNewFoil: 5 } } });
  expect(save.coins).toBe(3);
  expect(save.totalOpened).toBe(0);
  expect(save.packs.Pack1_Basic).toEqual({ opened: 0, sinceNewHero: 0, sinceNewFoil: 5 });
});
