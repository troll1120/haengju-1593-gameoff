import { expect, test } from "bun:test";
import type { BphEffect } from "./bph-contract";
import { BPH_CASTLE_UNLOCK_PLACEMENTS, BPH_TEMPLE_PLACEMENTS, BPH_TENT_TAP_LIFT, bphCastleBuildingAt, bphCastleStanding, bphCastleUnlocks,
  bphReviveSeconds } from "./bph-castle-buildings";
import { buildings } from "./fortification";
import { freshMeta } from "./meta";
import { createBphRun } from "./bph-session";
import { advance, downSeconds } from "./rules";
import { bphFxContext } from "./bph-fx-dispatch";
import { bphSurvivalPlan } from "./bph-survival";

const bought = (placementId: string): BphEffect => ({ nodeId: "SN_Building_Basic_Unlock", type: "UnlockBuilding", value: 1,
  effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0, targets: { placementId } });

test("a fresh account's central tent answers no tap, and nothing produces on its own", () => {
  expect(bphCastleUnlocks([])).toEqual({ production: false, smithy: false, temple: false });
  expect(bphCastleStanding([])).toEqual({ barracks: false, smithy: false, temple: false });
  const places = buildings(), canvas = { x: places.base.x, y: places.base.y - BPH_TENT_TAP_LIFT };
  expect([bphCastleBuildingAt([], canvas), bphCastleBuildingAt([], places.forge), bphCastleBuildingAt([], places.infirmary)])
    .toEqual([null, null, null]);
});
test("the barracks is the central command tent: production makes a tap on the tent a barracks tap", () => {
  const places = buildings(), production = [bought(BPH_CASTLE_UNLOCK_PLACEMENTS.production)];
  expect(places.barracks).toEqual(places.base);
  expect([bphCastleBuildingAt(production, { x: places.base.x, y: places.base.y - BPH_TENT_TAP_LIFT }),
    bphCastleBuildingAt(production, { x: places.base.x, y: places.base.y - 50 }),
    bphCastleBuildingAt(production, { x: places.base.x, y: places.base.y - 100 })]).toEqual(["barracks", "barracks", null]);
});
test("each unlock placement raises its own part, read from the placement and not the shared node id", () => {
  const effects = Object.values(BPH_CASTLE_UNLOCK_PLACEMENTS).map(bought);
  expect(bphCastleUnlocks(effects)).toEqual({ production: true, smithy: true, temple: true });
  expect(bphCastleUnlocks([bought("_SkillTreeMain_Demo:27:20")])).toEqual({ production: false, smithy: false, temple: false });
  const places = buildings();
  expect([bphCastleBuildingAt(effects, places.forge), bphCastleBuildingAt(effects, places.infirmary),
    bphCastleBuildingAt(effects, { x: places.forge.x + 40, y: places.forge.y })]).toEqual(["smithy", "temple", null]);
});

test("a fallen general never rises before the temple, and each temple node shortens it", () => {
  expect(bphReviveSeconds([])).toBe(Infinity);
  expect(bphReviveSeconds([bought(BPH_CASTLE_UNLOCK_PLACEMENTS.temple)])).toBe(20);
  expect(bphReviveSeconds(Object.values(BPH_TEMPLE_PLACEMENTS).map(bought))).toBe(Infinity);
  expect(bphReviveSeconds([BPH_CASTLE_UNLOCK_PLACEMENTS.temple, ...Object.values(BPH_TEMPLE_PLACEMENTS)].map(bought))).toBe(10);
});
test("without the temple a fallen survival general never rises: a fresh account's general stays down", () => {
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [] });
  run.bph!.survival!.cursor = bphSurvivalPlan(run.bph!.waveId).length;
  const squad = run.squads[0];
  bphFxContext(run)?.applyUnitDamage({ target: squad, amount: squad.hp * 10 });
  expect(squad.state).toBe("down");
  const fell = { x: squad.x, y: squad.y };
  for (let tick = 0; tick < 120 / .05; tick++) advance(run, .05);
  expect(squad.state).toBe("down");
  expect(squad.hp).toBe(0);
  expect(squad.downUntil).toBe(Infinity);
  // With no temple to carry the general to, the body stays where it fell.
  expect({ x: squad.x, y: squad.y }).toEqual(fell);
});
test.each([[[BPH_CASTLE_UNLOCK_PLACEMENTS.temple], 20], [[BPH_CASTLE_UNLOCK_PLACEMENTS.temple, ...Object.values(BPH_TEMPLE_PLACEMENTS)], 10]] as const)(
  "a survival general struck down rises after the temple's revive time (%#) in real combat", (placements, seconds) => {
    const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: placements.map(bought) });
    // The revive clock is the subject; incoming hordes can end the battle while the general is down.
    run.bph!.survival!.cursor = bphSurvivalPlan(run.bph!.waveId).length;
    expect(downSeconds(run)).toBe(seconds);
    const squad = run.squads[0];
    bphFxContext(run)?.applyUnitDamage({ target: squad, amount: squad.hp * 10 });
    expect(squad.state).toBe("down");
    const fell = run.time;
    for (let tick = 0; tick < (seconds - .5) / .05; tick++) advance(run, .05);
    expect(squad.state).toBe("down");
    for (let tick = 0; tick < 1 / .05; tick++) advance(run, .05);
    expect(run.time).toBeCloseTo(fell + seconds + .5, 8);
    expect(squad.state).not.toBe("down");
  });
