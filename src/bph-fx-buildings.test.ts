import { expect, test } from "bun:test";
import type { BphEffect, BphFxContext, BphSave } from "./bph-contract";
import { BPH_BUILDING_CONSUMERS, bphTempleReady, collectBphTemple, TEMPLE_AUTO_COLLECT } from "./bph-fx-buildings";
import { BPH_CASTLE_UNLOCK_PLACEMENTS } from "./bph-castle-buildings";
import { bindBphConsumers, bphFxContext, dispatchBphEffects } from "./bph-fx-dispatch";
import { freshBphSave, parseBphSave } from "./bph-save";
import { BPH_PACKS, BPH_PROFILES } from "./bph-data";
import { advance } from "./rules";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { bphArms, hitBphPack } from "./bph-combat";
import { claimBphRelic, enterBphImprovements, equipBphRelic, grantBphMastery, grantBphRelic,
  notifyBphQuestCompletion, recoverBphRelic, startBphCampaignAttempt } from "./bph-account";

const effect = (type: string, value: number, targets: Readonly<Record<string, string>> = {},
  effectPower = 0): BphEffect => ({
  nodeId: type, type, value, effectPower, effectPowerScale: 0, stackCap: 0, countStep: 0, targets,
});
// The barracks absorbed Basic, Advanced, Nature, Death and Frost and the temple took Magic and Tome, so the generic
// building engine is measured on the temple's Magic draw, collected by a temple tap the moment it fills.
const unlock = (targetBuilding = "Building_3Magic"): BphEffect => effect("UnlockBuilding", 1, { targetBuilding });
const temple = effect("BuildingActivateTwiceChance", 0, { placementId: BPH_CASTLE_UNLOCK_PLACEMENTS.temple });
// The Royal timer belongs to the smithy, which its own placement (26:19) raises.
const smithy = effect("BuildingReduceActivationCooldownFlatSeconds", 0,
  { targetBuilding: "Building_1Basic", placementId: "_SkillTreeMain_Demo:26:19" });
function context(effects: readonly BphEffect[], random: () => number = () => .9, save?: BphSave): BphFxContext {
  const meta = freshMeta();
  // This fixture measures building rewards after its setup soldier was already encountered.
  meta.bph = save ?? freshBphSave();
  if (!save) {
    meta.bph.discovered = ["Hero1_Squire"];
    meta.bph.codexRewards = { version: 1, claimed: ["discovery:Hero1_Squire"], pendingGold: 0 };
  }
  // Production creation owns freshBphFxState, bphEffectCombat and real pack/spawn callbacks.
  const run = createBphRun(meta, { seed: 1593, general: "권율", upgrades: effects });
  const native = bphFxContext(run);
  if (!native) throw new Error("Production battle did not bind its consumers");
  const ctx = { ...native, random };
  bindBphConsumers(ctx, BPH_BUILDING_CONSUMERS, false);
  ctx.spawnProfile("Hero1_Squire", 1);
  return ctx;
}
const tick = (ctx: BphFxContext, dt: number): void => dispatchBphEffects(ctx.run, { kind: "step", dt });
function generic(effects: readonly BphEffect[], random?: () => number): BphFxContext {
  const ctx = context([temple, ...effects], random);
  ctx.run.phase = "playing";
  return ctx;
}
const tap = (ctx: BphFxContext, dt: number): void => { tick(ctx, dt); collectBphTemple(ctx.run); };
function fighter(ctx: BphFxContext) {
  const unit = ctx.run.squads.flatMap(s => s.soldiers)[0];
  if (!unit) throw new Error("Production spawn must provide a soldier");
  return unit;
}

test.each(["Building_1Basic", "Building_2Advanced", "Building_5Nature", "Building_6Death", "Building_7Frost"])(
  "%s no longer runs its own clock or grants a free pack: the barracks draws for it", id => {
  const ctx = context([unlock(id)]);
  tick(ctx, 60);
  expect([ctx.save.inventory, ctx.state.buildings.map(b => b.activations)]).toEqual([[], [0]]);
});
test.each([
  ["Building_3Magic", 30, "Pack3_Magic"],
  ["Building_8Tome", 80, "Pack_Tomes"],
] as const)("UnlockBuilding %s grants its original pack after %s seconds", (id, seconds, packId) => {
  const ctx = generic([unlock(id), unlock(id)]);
  tap(ctx, seconds - 1);
  expect(ctx.save.inventory).toEqual([]);
  tap(ctx, 1);
  expect(ctx.save.inventory).toEqual([{ id: 1, packId, box: false,
    sourceBuilding: id, foilChanceBonus: 0, giantChance: 0 }]);
});
test.each([
  ["Building_3Magic", 30, "Pack3_Magic"],
  ["Building_8Tome", 80, "Pack_Tomes"],
] as const)("the temple's %s draw fills in %s seconds, waits, then collects itself after the auto delay", (id, seconds, packId) => {
  const ctx = context([temple, unlock(id)]);
  tick(ctx, seconds - 1);
  expect([bphTempleReady(ctx.run), ctx.save.inventory]).toEqual([false, []]);
  tick(ctx, 1);
  expect([bphTempleReady(ctx.run), ctx.save.inventory]).toEqual([true, []]);
  tick(ctx, TEMPLE_AUTO_COLLECT - .5);
  expect(ctx.save.inventory).toEqual([]);
  tick(ctx, .5);
  expect([bphTempleReady(ctx.run), ctx.save.inventory]).toEqual([false, [{ id: 1, packId, box: false,
    sourceBuilding: id, foilChanceBonus: 0, giantChance: 0 }]]);
});
test("a temple tap collects a waiting draw at once and restarts its timer from zero", () => {
  const ctx = context([temple, unlock("Building_3Magic")]);
  ctx.run.phase = "playing";
  expect(collectBphTemple(ctx.run)).toBe(0);
  tick(ctx, 30);
  expect(collectBphTemple(ctx.run)).toBe(1);
  expect([ctx.save.inventory.map(p => p.packId), ctx.state.buildings[0].clock, bphTempleReady(ctx.run)]).toEqual([["Pack3_Magic"], 0, false]);
  tick(ctx, 29);
  expect(ctx.save.inventory).toHaveLength(1);
});
test("Magic and Tome draws never fill before the temple stands", () => {
  const ctx = context([unlock("Building_3Magic"), unlock("Building_8Tome")]);
  tick(ctx, 200);
  expect([ctx.save.inventory, ctx.state.buildings.map(b => b.clock), bphTempleReady(ctx.run)]).toEqual([[], [0, 0], false]);
});
test("Royal activation transforms an existing pack without granting an additional pack", () => {
  const ctx = context([smithy, unlock("Building_4Royal")]);
  ctx.save.inventory.push({ id: 8, packId: "Pack1_Basic", box: false });
  tick(ctx, 40);
  expect(ctx.save.inventory).toEqual([{ id: 8, packId: "Pack4_Royal", box: false }]);
});
test("Royal unlocked without the smithy runs no timer and transforms nothing", () => {
  const ctx = context([unlock("Building_4Royal")]);
  ctx.save.inventory.push({ id: 8, packId: "Pack1_Basic", box: false });
  tick(ctx, 80);
  expect(ctx.state.buildings).toEqual([]);
  expect(ctx.save.inventory).toEqual([{ id: 8, packId: "Pack1_Basic", box: false }]);
});
test("Royal activation with no unopened pack never manufactures a royal pack", () => {
  const ctx = context([smithy, unlock("Building_4Royal")]);
  tick(ctx, 40);
  expect(ctx.save.inventory).toEqual([]);
});
test("BuildingReduceActivationCooldownFlatSeconds combines global 5 and targeted 2 seconds", () => {
  const ctx = generic([unlock(), effect("BuildingReduceActivationCooldownFlatSeconds", 5),
    effect("BuildingReduceActivationCooldownFlatSeconds", 2, { targetBuilding: "Building_3Magic" })]);
  tap(ctx, 22);
  expect(ctx.save.inventory).toHaveLength(0);
  tap(ctx, 1);
  expect(ctx.save.inventory.map(p => p.packId)).toEqual(["Pack3_Magic"]);
});
test("a targeted building cooldown reduction leaves other buildings unchanged", () => {
  const ctx = generic([unlock(), unlock("Building_8Tome"),
    effect("BuildingReduceActivationCooldownFlatSeconds", 2, { targetBuilding: "Building_3Magic" })]);
  tap(ctx, 28);
  expect(ctx.save.inventory.map(p => p.packId)).toEqual(["Pack3_Magic"]);
});
test("BuildingReduceActivationCooldownPercent negative .5 halves activation speed", () => {
  const ctx = generic([unlock(), effect("BuildingReduceActivationCooldownPercent", -.5)]);
  tap(ctx, 59);
  expect(ctx.save.inventory).toHaveLength(0);
  tap(ctx, 1);
  expect(ctx.save.inventory.map(p => p.packId)).toEqual(["Pack3_Magic"]);
});
test("BuildingActivationSpeedPerUnopenedPack keeps the source 50 percent cap", () => {
  const ctx = generic([unlock(),
    effect("BuildingActivationSpeedPerUnopenedPack", .05000000074505806, { targetBuilding: "Building_3Magic" })]);
  for (let i = 0; i < 20; i++) ctx.save.inventory.push({ id: 100 + i, packId: "Pack1_Basic", box: false });
  tap(ctx, 19);
  expect(ctx.save.inventory).toHaveLength(20);
  tap(ctx, 1);
  expect(ctx.save.inventory.filter(p => p.packId === "Pack3_Magic")).toHaveLength(1);
});
test("BuildingActivateTwiceChance activates twice without recursive rolls", () => {
  const ctx = generic([unlock(), effect("BuildingActivateTwiceChance", .10000000149011612,
    { targetBuilding: "Building_3Magic" })], () => .05);
  tap(ctx, 30);
  expect(ctx.save.inventory.map(p => p.packId)).toEqual(["Pack3_Magic", "Pack3_Magic"]);
});
test("a failed double-activation chance grants exactly one pack", () => {
  const ctx = generic([unlock(), effect("BuildingActivateTwiceChance", .10000000149011612)], () => .2);
  tap(ctx, 30);
  expect(ctx.save.inventory).toHaveLength(1);
});
test("GlobalChanceEffectMultiplier raises a building's ten percent chance by 33 percent", () => {
  const ctx = generic([unlock(), effect("BuildingActivateTwiceChance", .10000000149011612),
    effect("GlobalChanceEffectMultiplier", .33000001311302185)], () => .12);
  tap(ctx, 30);
  expect(ctx.save.inventory).toHaveLength(2);
});
test("BuildingActivateCastSpell queues one original Shockwave per activation", () => {
  const ctx = generic([unlock(), effect("BuildingActivateCastSpell", 1, { targetSpell: "Spell_Shockwave" })]);
  tap(ctx, 30); tap(ctx, 30);
  expect(ctx.state.spells).toEqual([
    { id: "Spell_Shockwave", x: ctx.state.buildings[0].x, y: ctx.state.buildings[0].y, power: 1 },
    { id: "Spell_Shockwave", x: ctx.state.buildings[0].x, y: ctx.state.buildings[0].y, power: 1 },
  ]);
});
test("BuildingActivateApplyStatusToAllHeroes applies Charge power 100 for ten seconds to live profiles", () => {
  const ctx = context([smithy, unlock("Building_4Royal"), effect("BuildingActivateApplyStatusToAllHeroes", 10,
    { targetBuilding: "Building_4Royal", targetStatus: "Charge" })]);
  const unit = fighter(ctx);
  ctx.run.time = 40;
  tick(ctx, 40);
  expect(ctx.state.statuses).toEqual([{ targetId: unit.id, id: "Charge", until: 50, power: 100, stacks: 1, side: "ally" }]);
});
test("building Charge refreshes a nonstackable status instead of duplicating it", () => {
  const ctx = context([smithy, unlock("Building_4Royal"), effect("BuildingActivateApplyStatusToAllHeroes", 10,
    { targetBuilding: "Building_4Royal", targetStatus: "Charge" })]);
  const unit = fighter(ctx);
  ctx.state.statuses.push({ targetId: unit.id, id: "Charge", until: 1, power: 100, stacks: 1 });
  ctx.run.time = 40;
  tick(ctx, 40);
  expect(ctx.state.statuses).toEqual([{ targetId: unit.id, id: "Charge", until: 50, power: 100, stacks: 1 }]);
});
test("BuildingActivateGainCombatCoins uses value as chance and effectPower as the one coin reward", () => {
  const ctx = generic([unlock(), effect("BuildingActivateGainCombatCoins", .10000000149011612, {}, 1)], () => .05);
  tap(ctx, 30);
  expect([ctx.save.coins, ctx.run.gold, ctx.run.earned]).toEqual([4, 4, 1]);
});
test("a failed building coin chance does not credit fractional chance as currency", () => {
  const ctx = generic([unlock(), effect("BuildingActivateGainCombatCoins", .10000000149011612, {}, 1)], () => .2);
  tap(ctx, 30);
  expect([ctx.save.coins, ctx.run.gold, ctx.run.earned]).toEqual([3, 3, 0]);
});
test("CombatCoinReduceRandomBuildingCooldown reduces a random building by five seconds per coin", () => {
  const ctx = generic([unlock("Building_8Tome"), unlock(), effect("CombatCoinReduceRandomBuildingCooldown", 5)], () => .9);
  dispatchBphEffects(ctx.run, { kind: "coins-gained", amount: 2 });
  tap(ctx, 20);
  expect(ctx.save.inventory.map(p => p.packId)).toEqual(["Pack3_Magic"]);
});
test("coins granted by a building also reduce building cooldowns", () => {
  const ctx = generic([unlock(), effect("BuildingActivateGainCombatCoins", .10000000149011612, {}, 1),
    effect("CombatCoinReduceRandomBuildingCooldown", 5)], () => .05);
  tap(ctx, 30);
  tap(ctx, 25);
  expect([ctx.save.inventory.length, ctx.save.coins]).toEqual([2, 5]);
});
test("OnHeroDeathReduceBuildingActivationSeconds affects only the graveyard", () => {
  const ctx = context([unlock(), unlock("Building_6Death"),
    effect("OnHeroDeathReduceBuildingActivationSeconds", 2, { targetBuilding: "Building_6Death" })]);
  dispatchBphEffects(ctx.run, { kind: "unit-death", unit: fighter(ctx), killer: null });
  expect(ctx.state.buildings.map(b => b.clock)).toEqual([0, 2]);
});

test.each([
  ["BuildingSpawnedPackFoilChance", "Building_3Magic", 30, "foil"],
  ["BuildingSpawnedPackGiantChance", "Building_3Magic", 30, "giant"],
] as const)("%s survives an actual building grant, pack opening and unit spawn", (kind, id, seconds, flag) => {
  const ctx = context([temple, unlock(id), effect(kind, .10000000149011612, { targetBuilding: id })]);
  tick(ctx, seconds); tick(ctx, TEMPLE_AUTO_COLLECT);
  const pack = ctx.save.inventory[0];
  // pity.md: natural foil rolls pass FoilManager's copiesBeforeFoilByRarity gate,
  // so every Pack3_Magic hero is pre-discovered with 8 copies before the roll.
  for (const card of BPH_PACKS.Pack3_Magic.pool.filter(card => BPH_PROFILES[card.id])) {
    if (!ctx.save.discovered.includes(card.id)) ctx.save.discovered.push(card.id);
    ctx.save.questProgress["draw:foil-copies:" + card.id] = 8;
  }
  ctx.save.rng = 27; // Weighted card, foil=.026339..., giant=.021178...; both within the source bonus.
  hitBphPack(ctx.run, pack.id);
  const results = hitBphPack(ctx.run, pack.id);
  const unit = ctx.run.squads[0].soldiers.at(-1);
  if (!unit) throw new Error("Actual opening did not spawn a unit");
  expect([pack.sourceBuilding, results[0].cards[0][flag], ctx.unitInfo(unit)?.[flag]]).toEqual([id, true, true]);
});
test("DiscoverTargetRelic keeps a single unclaimed discovery across repeated battles", () => {
  const effects = [effect("DiscoverTargetRelic", 1, { targetRelic: "R_ShockNeedle" })];
  const ctx = context(effects);
  const restored = context(effects, undefined, parseBphSave(JSON.parse(JSON.stringify(ctx.save))));
  // The setup soldier also completes the fresh account's spearman roster.
  expect(restored.save.relicState.owned).toEqual([]);
  expect([...restored.save.relicState.discovered].sort()).toEqual(["R_ShockNeedle", "Relic1_CharmWarrior"]);
  expect(claimBphRelic(restored.save, "R_ShockNeedle")).toBe(true);
  expect(claimBphRelic(restored.save, "R_ShockNeedle")).toBe(false);
  expect(restored.save.relicState.owned).toEqual(["R_ShockNeedle"]);
});
test("GainRelicSlot increases real equip capacity once per purchased placement after reload", () => {
  const effects = [effect("GainRelicSlot", 1, { placementId: "grid:0:0" })];
  const ctx = context(effects);
  for (const id of ["R_ShockNeedle", "R_EchoingBones", "R_FirstPackPortal"]) grantBphRelic(ctx.save, id);
  expect(equipBphRelic(ctx.save, "R_ShockNeedle")).toBe(true);
  expect(equipBphRelic(ctx.save, "R_EchoingBones")).toBe(true);
  expect(equipBphRelic(ctx.save, "R_FirstPackPortal")).toBe(false);
  const restored = context(effects, undefined, parseBphSave(JSON.parse(JSON.stringify(ctx.save))));
  expect(restored.save.relicState.slots).toBe(1);
});
test("FoilHeroAliveMasterySurgeBonus uses live foil instances and stops when that instance dies", () => {
  const ctx = context([effect("FoilHeroAliveMasterySurgeBonus", .25)]);
  ctx.save.foils.push("Hero1_Squire"); // A discovered foil must not make the ordinary soldier foil.
  expect(grantBphMastery(ctx.save, { receiptId: "ordinary", amount: 4, source: "combat" })).toBe(4);
  ctx.spawnProfile("Hero1_Squire", 1, { packId: "Pack1_Basic", foil: true });
  expect(grantBphMastery(ctx.save, { receiptId: "foil", amount: 4, source: "combat" })).toBe(5);
  const foil = ctx.run.squads[0].soldiers[1]; foil.hp = 0;
  dispatchBphEffects(ctx.run, { kind: "unit-death", unit: foil, killer: null });
  expect(grantBphMastery(ctx.save, { receiptId: "dead", amount: 4, source: "combat" })).toBe(4);
});
test("MasterySurgeBonus scales a real pre-grant amount once without multiplying the saved balance", () => {
  const ctx = context([effect("MasterySurgeBonus", 1)]); ctx.save.resources.mastery = 10;
  expect(grantBphMastery(ctx.save, { receiptId: "combat", amount: 2.5, source: "combat" })).toBe(5);
  expect(grantBphMastery(ctx.save, { receiptId: "combat", amount: 2.5, source: "combat" })).toBe(0);
  expect(ctx.save.resources.mastery).toBe(15);
});
test("survival pack and discovery payouts have separate per-run limits after surge", () => {
  const ctx = context([effect("MasterySurgeBonus", 1)]);
  const grant = (source: "pack" | "discovery", receiptId: string, amount: number) =>
    grantBphMastery(ctx.save, { source, receiptId, amount });
  expect(grant("pack", "pack:first", 20)).toBe(40);
  expect(grant("pack", "pack:second", 1000)).toBe(20);
  expect(grant("discovery", "discovery:first", 1000)).toBe(80);
  expect(grant("pack", "pack:third", 1)).toBe(0);
  expect(grant("discovery", "discovery:second", 1000)).toBe(0);
  expect(ctx.save.resources.mastery).toBe(140);
});
test("HeroAttackDamageScalesWithMasterySurgeBonus changes fresh Arcanist damage, not other classes", () => {
  const ctx = context([effect("MasterySurgeBonus", 1), effect("HeroAttackDamageScalesWithMasterySurgeBonus", .5),
    effect("FoilHeroAliveMasterySurgeBonus", .25)]);
  ctx.spawnProfile("Hero2_Pyromancer", 1);
  const arcanist = ctx.run.squads[0].soldiers[1];
  expect([bphArms(arcanist, ctx.run)?.power, bphArms(fighter(ctx), ctx.run)?.power]).toEqual([4.5, 1]);
  ctx.spawnProfile("Hero1_Squire", 1, { packId: "Pack1_Basic", foil: true });
  expect([bphArms(arcanist, ctx.run)?.power, bphArms(arcanist, ctx.run)?.power]).toEqual([4.875, 4.875]);
});
test("MasteryInterest adds original rates on the same unspent principal once per management visit", () => {
  const effects = [effect("MasteryInterest", .10000000149011612), effect("MasteryInterest", .25)];
  const ctx = context(effects); ctx.save.resources.mastery = 10;
  expect(enterBphImprovements(ctx.save)).toBe(true);
  expect(ctx.save.resources.mastery).toBe(13.500000014901161);
  const restored = context(effects, undefined, parseBphSave(JSON.parse(JSON.stringify(ctx.save))));
  expect(enterBphImprovements(restored.save)).toBe(false);
  expect(restored.save.resources.mastery).toBe(13.500000014901161);
});
test("QuestCompleteBonusCoin pays exactly one coin for each actual new completion claim", () => {
  const ctx = context([effect("QuestCompleteBonusCoin", 1)]);
  ctx.save.questProgress["claims:grid:0:0"] = 1;
  expect(notifyBphQuestCompletion(ctx.save, "grid:0:0")).toBe(true);
  expect(notifyBphQuestCompletion(ctx.save, "grid:0:0")).toBe(false);
  ctx.save.questProgress["claims:grid:0:0"] = 2;
  expect(notifyBphQuestCompletion(ctx.save, "grid:0:0")).toBe(true);
  expect([ctx.save.coins, ctx.run.gold]).toEqual([5, 5]);
});
test("RecoverDestroyedRelicsWithFoilium restores actual destroyed relics for 5 then 10 foilium", () => {
  const ctx = context([effect("RecoverDestroyedRelicsWithFoilium", 1)]);
  grantBphRelic(ctx.save, "R_ShockNeedle"); ctx.save.relicState.destroyed.push("R_ShockNeedle");
  ctx.save.resources.foilium = 15;
  expect(recoverBphRelic(ctx.save, { relicId: "R_ShockNeedle", effects: ctx.effects })).toBe(true);
  expect([ctx.save.resources.foilium, ctx.save.relicState.destroyed]).toEqual([10, []]);
  ctx.save.relicState.destroyed.push("R_ShockNeedle");
  expect(recoverBphRelic(ctx.save, { relicId: "R_ShockNeedle", effects: ctx.effects })).toBe(true);
  expect([ctx.save.resources.foilium, ctx.save.relicState.recoveries]).toEqual([0, 2]);
});
test("SalaryFlatBonus projects income without repeating the grant or losing quest income", () => {
  const effects = [effect("SalaryFlatBonus", 2)], ctx = context(effects);
  expect(ctx.save.income).toBe(5); ctx.save.income++;
  const restored = context(effects, undefined, parseBphSave(JSON.parse(JSON.stringify(ctx.save))));
  enterBphImprovements(restored.save);
  expect([restored.save.income, restored.save.salaryApplied]).toEqual([6, 2]);
});
test("StartingFoilium grants three only on a new campaign attempt, never on combat rebind or reload", () => {
  const effects = [effect("StartingFoilium", 3)], ctx = context(effects);
  expect(ctx.save.resources.foilium).toBe(0);
  expect(startBphCampaignAttempt(ctx.save)).toBe(true);
  const restored = context(effects, undefined, parseBphSave(JSON.parse(JSON.stringify(ctx.save))));
  expect(startBphCampaignAttempt(restored.save)).toBe(false);
  expect(restored.save.resources.foilium).toBe(3);
  restored.save.lifecycle.campaignAttempt++;
  expect(startBphCampaignAttempt(restored.save)).toBe(true);
  expect(restored.save.resources.foilium).toBe(6);
});
test("GlobalChanceEffectMultiplier uses the shared threshold exactly once for a real building proc", () => {
  const ctx = generic([unlock(), effect("GlobalChanceEffectMultiplier", .33000001311302185),
    effect("BuildingActivateTwiceChance", .10000000149011612)], () => .15);
  tap(ctx, 30);
  expect(ctx.chance(.1)).toBeCloseTo(.13300000131130219, 12);
  expect(ctx.save.inventory).toHaveLength(1);
});
test("relic building stays explicitly unconfirmed rather than inventing its increasing cooldown", () => {
  const ctx = context([unlock("Building_XRelics")]);
  tick(ctx, 240);
  expect(ctx.state.counters["buildings:unconfirmed:Building_XRelics"]).toBe(1);
  expect(ctx.save.inventory).toEqual([]);
});
test("nonpositive stacked cooldown is diagnosed instead of a fabricated minimum or infinite loop", () => {
  const ctx = generic([unlock(), effect("BuildingReduceActivationCooldownFlatSeconds", 30)]);
  tap(ctx, 1);
  expect(ctx.state.counters["buildings:unconfirmed:cooldown:Building_3Magic"]).toBe(1);
});
test("a real combat tick reaches building activation through the native dispatcher", () => {
  const ctx = generic([unlock()]);
  ctx.state.buildings[0].clock = 29.99;
  advance(ctx.run, 1 / 30);
  expect(collectBphTemple(ctx.run)).toBe(1);
  expect(ctx.save.inventory.map(p => p.packId)).toEqual(["Pack3_Magic"]);
});
test("separate battles never share building clocks or activations", () => {
  const first = generic([unlock()]);
  const second = generic([unlock()]);
  tap(first, 30);
  expect([first.save.inventory.length, second.save.inventory.length, second.state.buildings[0].clock]).toEqual([1, 0, 0]);
});
test("granted pack identity survives the real save parser", () => {
  const ctx = generic([unlock()]);
  tap(ctx, 30);
  expect(parseBphSave(JSON.parse(JSON.stringify(ctx.save))).inventory).toEqual([{ id: 1, packId: "Pack3_Magic", box: false,
    sourceBuilding: "Building_3Magic", foilChanceBonus: 0, giantChance: 0 }]);
});
