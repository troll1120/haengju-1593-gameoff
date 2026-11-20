import { expect, test } from "bun:test";
import { BPH_PLACEMENTS } from "../src/bph-upgrades";
import { BPH_UPGRADE_NODES } from "../src/bph-upgrade-data";
import { survivalFixture } from "./survival-fixtures";
import { simulateSurvival } from "./survival-sim";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { createBphRun, settleBphRun } from "../src/bph-session";
import { activeBphEffects } from "../src/bph-upgrades";
import { projectBphSalary } from "../src/bph-account";
import { advance, chooseGeneral, generalHandOpen, useSkill } from "../src/rules";
import { restockBphRecruit } from "../src/bph-supply";
import { prepareBphFieldShop } from "../src/bph-shop-session";
import { buyBphRecruit } from "../src/bph-recruit";
import { hitBphPack } from "../src/bph-combat";
import { CENTER, setFieldSize } from "../src/geometry";
import { BPH_PROFILES } from "../src/bph-data";

test("the current cohort excludes every future placement while diagnostic includes all 110", async () => {
  const current = await survivalFixture("full144");
  const diagnostic = await survivalFixture("FULL218");
  const currentIds = new Set(current.purchasedPlacements);
  const future = diagnostic.purchasedPlacements.filter(id => !currentIds.has(id));

  expect(currentIds.size).toBe(63);
  expect(diagnostic.purchasedPlacements.length).toBe(110);
  expect(future.length).toBe(47);
  for (const id of future) {
    const placement = BPH_PLACEMENTS.get(id);
    expect(placement).toBeDefined();
    if (!placement?.nodeId) throw new TypeError("Fixture placement missing node");
    expect(Math.max(placement.prestigeLock, BPH_UPGRADE_NODES[placement.nodeId].values.prestigeLock ?? 0)).toBeGreaterThan(0);
  }
});

test("typical stays inside the current cohort and none grants no placements", async () => {
  const typical = await survivalFixture("typical");
  const current = await survivalFixture("full144");

  expect(typical.purchasedPlacements.length).toBe(4);
  for (const id of typical.purchasedPlacements) expect(current.purchasedPlacements).toContain(id);
  expect((await survivalFixture("none")).purchasedPlacements).toEqual([]);
});

test("short observation cap stays unresolved and uses real 50ms steps and 500ms actions", async () => {
  const row = await simulateSurvival({
    seed: 1, chapter: 1, general: "권율", state: "none", policy: "cursor0", capSeconds: .55,
  });

  expect(row.steps).toBe(11);
  expect(row.survival).toBeCloseTo(.55, 10);
  expect(row.decisions).toBe(2);
  expect(row.phase).toBe("playing");
  expect(row.capped).toBe(true);
  expect(row.cursorHits).toBe(0);
  expect(row.castleFallTime).toBeNull();
  expect(row.mastery.sources.combat).toBeUndefined();
});

test("same seed policy and fixture replay identically across fresh accounts", async () => {
  const options = { seed: 7, chapter: 2, general: "권율", state: "typical", policy: "active2Hz", capSeconds: 1 } as const;
  const first = await simulateSurvival(options);
  const second = await simulateSurvival(options);

  expect(second).toEqual(first);
});

test("barracks-only skips paid recruits and keeps active inputs and recurring free supply", async () => {
  const options = { seed: 7, chapter: 1, general: "권율", state: "typical", capSeconds: 40 } as const;
  const recruiting = await simulateSurvival({ ...options, policy: "active2Hz", trackPackArrivals: true });
  const barracks = await simulateSurvival({ ...options, policy: "barracks-only" });

  expect(recruiting.purchases).toBeGreaterThan(0);
  expect(recruiting.coins.spent).toBeGreaterThan(0);
  expect(recruiting.packArrivals?.some(pack => pack.source === "paid")).toBe(true);
  expect(recruiting.packArrivals?.some(pack => pack.source === "barracks")).toBe(true);
  expect(barracks.purchases).toBe(0);
  expect(barracks.blockedPurchases).toBe(0);
  expect(barracks.coins.spent).toBe(0);
  expect(barracks.packArrivals?.some(pack => pack.source === "paid")).toBe(false);
  const supply = barracks.packArrivals?.filter(pack => pack.source === "barracks") ?? [];
  expect(supply.some(pack => pack.time < 20)).toBe(true);
  expect(supply.some(pack => pack.time > 25)).toBe(true);
  expect(barracks.totalSpawned).toBeGreaterThan(0);
  expect(barracks.decisions).toBe(recruiting.decisions);
  expect(barracks.skillTaps.taps).toBe(recruiting.skillTaps.taps);
  expect(barracks.targetingPolicy).toBe(recruiting.targetingPolicy);
  expect(barracks.cursorHits).toBeGreaterThan(0);
});

test("untapped portraits wait full and recorded portrait taps replay the timely run exactly", async () => {
  const options = { seed: 7, chapter: 1, general: "권율", state: "none", policy: "active2Hz", capSeconds: 12 } as const;
  const timely = await simulateSurvival(options);
  const never = await simulateSurvival({ ...options, taps: "never" });
  const replay = await simulateSurvival({ ...options, taps: timely.skillTaps.casts });

  expect(timely.skillTaps.casts.length).toBeGreaterThan(0);
  expect(never.skillTaps).toEqual({ policy: "never", taps: 0, casts: [] });
  expect(replay.skillTaps.casts).toEqual(timely.skillTaps.casts);
  const { skillTaps: _timely, ...timelyRest } = timely, { skillTaps: _replay, ...replayRest } = replay;
  expect(replayRest).toEqual(timelyRest);
  expect(never.kills).not.toBe(timely.kills);
});

test("the scripted tapper replays identically and taps only when a volley is ready", async () => {
  const options = { seed: 3, chapter: 1, general: "권율", state: "none", policy: "tap2Hz", capSeconds: 20 } as const;
  const first = await simulateSurvival(options);
  expect(await simulateSurvival(options)).toEqual(first);
  // Three charges at once, then one per 4 s refill: at most 3 + floor(20 / 4) volleys in 20 s.
  expect(first.strikeTaps).toBeGreaterThan(0);
  expect(first.strikeTaps).toBeLessThanOrEqual(3 + 5);
  expect((await simulateSurvival({ ...options, policy: "cursor0" })).strikeTaps).toBe(0);
});

test("negative observation caps reject instead of reporting a fabricated outcome", async () => {
  await expect(simulateSurvival({
    seed: 1, chapter: 1, general: "권율", state: "none", policy: "cursor0", capSeconds: -1,
  })).rejects.toThrow("cap must be within");
});

test("two carried-account runs match manual create, advance and settle without replacing the account", async () => {
  const account = { meta: freshMeta(), save: freshBphSave(7) };
  const manual = { meta: freshMeta(), save: freshBphSave(7) };
  manual.meta.bph = manual.save;
  for (const seed of [7, 11]) {
    const result = await simulateSurvival({ seed, chapter: Math.min(account.save.chapter + 1, 4),
      general: "권율", state: "none", policy: "cursor0", account });
    expect(result.capped).toBe(false);
    expect(result.account).toBe(account);
    expect(account.meta.bph).toBe(account.save);

    setFieldSize(370, 800);
    const effects = activeBphEffects(manual.save);
    projectBphSalary(manual.save, effects);
    const run = createBphRun(manual.meta, { seed, general: "권율", upgrades: effects });
    prepareBphFieldShop(run);
    const battle = run.bph;
    if (!battle) throw new TypeError("Missing manual battle");
    for (let tick = 0; tick < 12002 && run.phase !== "won" && run.phase !== "lost"; tick++) {
      if (generalHandOpen(run)) chooseGeneral(run, run.generalOffers[0]);
      if (tick % 10 === 0) {
        for (const squad of run.squads) useSkill(run, squad.id);
        const shop = restockBphRecruit(run), slot = shop.offers.findIndex(offer => !offer.sold);
        const pack = slot >= 0 ? buyBphRecruit(run, shop, slot) : null;
        if (pack) battle.packs.push({ ...pack, hp: 2, x: CENTER.x, y: CENTER.y + 70 });
        for (const field of [...battle.packs]) { hitBphPack(run, field.id, "reveal"); hitBphPack(run, field.id, "reveal"); }
      }
      advance(run, .05);
    }
    expect(["won", "lost"]).toContain(run.phase);
    settleBphRun(manual.meta, run);
    expect(account).toEqual(manual);
  }
  expect(account.meta.runs).toBe(2);
  expect(account.save.resources.mastery).toBeGreaterThan(0);
}, 120000);

test("spawned troop identities and peak living troops remain separate after casualties", async () => {
  const account = { meta: freshMeta(), save: freshBphSave(7) };

  // End while the castle is still standing, with enough time for recruits to arrive and take losses.
  const result = await simulateSurvival({ seed: 7, chapter: 1, general: "권율",
    state: "none", policy: "cursor0", capSeconds: 80, sampleEvery: 5, account });

  expect(result.capped).toBe(true);
  const recruited = account.save.pendingResults.reduce((sum, receipt) => sum + receipt.cards.reduce((cards, card) =>
    cards + (BPH_PROFILES[card.profileId] ? card.copies * (receipt.multiplier ?? 1) : 0), 0), 0);
  expect(result.totalSpawned).toBe(recruited);
  expect(result.peakAlive).toBeLessThan(result.totalSpawned);
  expect(result.timeSeries?.every(sample => sample.unitCount <= result.peakAlive)).toBe(true);
  expect("maxTroops" in result).toBe(false);
}, 120000);
