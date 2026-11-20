import { expect, test } from "bun:test";
import type { BphEffect } from "./bph-contract";
import { BPH_BARRACKS, bphBarracksView, collectBphBarracks } from "./bph-barracks";
import { BPH_ARRIVAL, bphCrates } from "./bph-combat";
import { BPH_CASTLE_UNLOCK_PLACEMENTS } from "./bph-castle-buildings";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { advance } from "./rules";
import type { Run } from "./rules";
import { bphFxContext, dispatchBphEffects } from "./bph-fx-dispatch";
import { takeBphBarracksDraw } from "./bph-fx-buildings";
import { freshBphSave, parseBphSave } from "./bph-save";
import { bphUnlockedTroopPacks } from "./bph-shop";
import { activeBphEffects, buyBphNode, BPH_PLACEMENTS, recordBphProgress } from "./bph-upgrades";

const unlock = (building: string, placementId: string): BphEffect => ({ nodeId: "SN_Building_Basic_Unlock", type: "UnlockBuilding",
  value: 1, effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0, targets: { targetBuilding: building, placementId } });
const PRODUCTION = unlock("Building_1Basic", BPH_CASTLE_UNLOCK_PLACEMENTS.production);
function play(run: Run, seconds: number): void {
  for (let step = 0; step < Math.round(seconds / .05); step++) advance(run, .05);
}
const recruits = (run: Run) => run.squads[0].soldiers.filter(unit => unit.bph?.cause === "pack").length;

test("a new account's first battle gets no barracks troops until barracks production is bought", () => {
  const meta = freshMeta();
  meta.bph = freshBphSave(5);
  const run = createBphRun(meta, { seed: 5, general: "권율", upgrades: activeBphEffects(meta.bph) });
  for (let second = 0; second < 30; second++) {
    // An idle first battle loses its keep once breachers strike it (ten opening spear hits); the keep is held up every
    // step so the whole 30 s still exercises the barracks gate.
    for (let step = 0; step < 20; step++) {
      run.base = run.maxBase;
      advance(run, .05);
    }
    expect([bphBarracksView(run), collectBphBarracks(run)]).toEqual([null, false]);
  }
  expect([run.phase, run.bph?.barracksReceipts, run.bph?.receipts.length, recruits(run)]).toEqual(["playing", undefined, 0, 0]);
});
test("an account that bought only barracks production receives only Basic supply", () => {
  const run = createBphRun(freshMeta(), { seed: 5, general: "권율", upgrades: [PRODUCTION] });
  play(run, 12.1);
  expect(run.bph?.receipts.map(receipt => receipt.packId)).toEqual(["Pack1_Basic"]);
});
test("the clock fills to READY at 8 s and holds; a tap draws at the barracks and the troops land at the reel stop", () => {
  const run = createBphRun(freshMeta(), { seed: 5, general: "권율", upgrades: [PRODUCTION] });
  play(run, 4);
  expect(bphBarracksView(run)?.share).toBeCloseTo(.5, 1);
  expect(collectBphBarracks(run)).toBe(false);
  play(run, 3.95);
  expect(bphBarracksView(run)?.ready).toBe(false);
  play(run, .1);
  expect(bphBarracksView(run)).toEqual({ share: 1, ready: true });
  expect(collectBphBarracks(run)).toBe(true);
  expect(run.bph?.barracksReceipts).toHaveLength(1);
  expect([bphBarracksView(run)?.ready, bphCrates(run).length, recruits(run)]).toEqual([false, 0, 0]);
  play(run, BPH_ARRIVAL.numberStop + .05);
  expect(recruits(run)).toBeGreaterThan(0);
});
test("an untapped READY barracks draws by itself exactly when the grace runs out", () => {
  const run = createBphRun(freshMeta(), { seed: 5, general: "권율", upgrades: [PRODUCTION] });
  play(run, 8.05);
  expect(bphBarracksView(run)?.ready).toBe(true);
  play(run, BPH_BARRACKS.grace - .1);
  expect(run.bph?.barracksReceipts).toBeUndefined();
  play(run, .15);
  expect(run.bph?.barracksReceipts).toHaveLength(1);
  expect(run.bph?.receipts[0].multiplier ?? 1).toBe(1);
});
test("the same seed draws the same barracks receipts", () => {
  const draw = () => {
    const meta = freshMeta(), save = meta.bph = freshBphSave(9);
    save.packs.Pack3_Magic = { opened: 2, sinceNewHero: 0, sinceNewFoil: 0 };
    const run = createBphRun(meta, { seed: 9, general: "권율", upgrades: [PRODUCTION] });
    for (let i = 0; i < 16; i++) {
      dispatchBphEffects(run, { kind: "step", dt: 25 });
      expect(collectBphBarracks(run)).toBe(true);
    }
    const receipts = run.bph!.receipts;
    expect(new Set(receipts.map(r => r.packId))).toEqual(new Set(["Pack1_Basic", "Pack3_Magic"]));
    expect(receipts.some(r => (r.multiplier ?? 1) > 1)).toBe(true);
    return receipts.map(result => [result.packId, result.cards[0].profileId, result.multiplier]);
  };
  expect(draw()).toEqual(draw());
});

test("the first supply after claiming a troop quest survives a reload and is consumed once", () => {
  const save = freshBphSave(), id = "_SkillTreeMain_Demo:23:23";
  save.purchasedPlacements = [...BPH_PLACEMENTS.values()].filter(p => p.gridId === "_SkillTreeMain_Demo" && p.id !== id).map(p => p.id);
  recordBphProgress(save, { kind: "chapter-entered", chapter: 0, dimension: 0 });
  recordBphProgress(save, { kind: "enemy-killed", enemyId: "Boss1_Apogre", count: 1 });
  expect(buyBphNode(save, id)).toBe(true);
  expect(save.pendingSupplyPacks).toEqual(["Pack2_Advanced"]);
  // A pack whose unlock was refunded must not displace the next valid guarantee. (Forest no longer fits: the
  // bought nature rift now opens it, so a still-locked troop pack stands in.)
  save.pendingSupplyPacks?.unshift("Pack9_Cosmic");
  const meta = freshMeta(), restored = meta.bph = parseBphSave(JSON.parse(JSON.stringify(save)));
  const run = createBphRun(meta, { seed: 9, general: "권율", upgrades: [PRODUCTION] });
  const context = bphFxContext(run)!;
  const supply = () => {
    dispatchBphEffects(run, { kind: "step", dt: 25 });
    return takeBphBarracksDraw({ ...context, random: () => 0 })[0].packId;
  };
  expect(supply()).toBe("Pack2_Advanced");
  expect(restored.pendingSupplyPacks).toEqual([]);
  expect(supply()).toBe("Pack1_Basic");
});

test("forest building joins the pool and base prices set the basic/forest boundary at 5/7", () => {
  const save = freshBphSave();
  const forest = [...BPH_PLACEMENTS.values()].find(p => p.nodeId === "SN_Building_Nature_Unlock")!;
  save.purchasedPlacements.push(forest.id);
  const effects = activeBphEffects(save);
  expect(bphUnlockedTroopPacks(save, effects)).toEqual(["Pack1_Basic", "Pack6_Forest"]);
  const meta = freshMeta(); meta.bph = save;
  const run = createBphRun(meta, { seed: 2, general: "권율", upgrades: [...effects, PRODUCTION] });
  const context = bphFxContext(run)!;
  for (const [point, expected] of [[5 / 7 - .001, "Pack1_Basic"], [5 / 7 + .001, "Pack6_Forest"]] as const) {
    dispatchBphEffects(run, { kind: "step", dt: 25 });
    expect(takeBphBarracksDraw({ ...context, random: () => point })[0].packId).toBe(expected);
  }
});
