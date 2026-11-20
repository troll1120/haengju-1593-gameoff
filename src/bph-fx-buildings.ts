import type { BphEffect, BphEffectConsumer, BphFxContext, BphFxState } from "./bph-contract";
import { CENTER } from "./geometry";
import { BPH_PROFILES } from "./bph-data";
import { bphRelicClassMatches } from "./bph-relic-classes";
import { grantBphMastery, discoverBphRelic, projectBphSalary } from "./bph-account";
import { bphCastleUnlocks } from "./bph-castle-buildings";
import { bphUnlockedTroopPacks } from "./bph-shop";
import { bphRecruitBasePrice } from "./bph-recruit";
import { bphFxContext } from "./bph-fx-dispatch";
import type { Run } from "./rules";

// buildings.csv, sharedassets1.assets:2634-2642. No display-unit scaling.
const BUILDINGS: Readonly<Record<string, { readonly cooldown: number; readonly pack: string }>> = {
  Building_1Basic: { cooldown: 20, pack: "Pack1_Basic" },
  Building_2Advanced: { cooldown: 25, pack: "Pack2_Advanced" },
  Building_3Magic: { cooldown: 30, pack: "Pack3_Magic" },
  Building_4Royal: { cooldown: 40, pack: "Pack4_Royal" },
  Building_5Nature: { cooldown: 35, pack: "Pack6_Forest" },
  Building_6Death: { cooldown: 45, pack: "Pack5_Skeleton" },
  Building_7Frost: { cooldown: 40, pack: "Pack7_Arctic" },
  Building_8Tome: { cooldown: 80, pack: "Pack_Tomes" },
  Building_XRelics: { cooldown: 120, pack: "Pack_RelicsRandom" },
} as const;
export { BUILDINGS as BPH_BUILDING_RECRUITS };

/**
 * These buildings share the permanent barracks clock. Their activation effects still apply
 * when their pack is drawn, while eligibility for a pack is shared with paid recruitment.
 */
export const BPH_BARRACKS_BUILDINGS: readonly string[] = ["Building_1Basic", "Building_2Advanced", "Building_5Nature", "Building_6Death", "Building_7Frost"];
export const bphBuildingPack = (id: string): string | undefined => BUILDINGS[id]?.pack;
const BARRACKS_CLOCK = "barracks:clock", BARRACKS_READY = "barracks:readyAt";
/** Remaining source-data gap, not an effect-consumer interface gap. */
export const BPH_BUILDING_GAPS: Readonly<Record<string, string>> = {
  Building_XRelics: "activation cooldown increase amount is absent from the source definition",
} as const;

const KINDS = [
  "BuildingActivateApplyStatusToAllHeroes", "BuildingActivateCastSpell",
  "BuildingActivateGainCombatCoins", "BuildingActivateTwiceChance",
  "BuildingActivationSpeedPerUnopenedPack", "BuildingReduceActivationCooldownFlatSeconds",
  "BuildingReduceActivationCooldownPercent", "BuildingSpawnedPackFoilChance",
  "BuildingSpawnedPackGiantChance", "CombatCoinReduceRandomBuildingCooldown",
  "DiscoverTargetRelic", "FoilHeroAliveMasterySurgeBonus", "GainRelicSlot",
  "GlobalChanceEffectMultiplier", "HeroAttackDamageScalesWithMasterySurgeBonus", "DifferentPackBoughtMasterySurgeBonus",
  "MasteryInterest", "MasterySurgeBonus", "OnHeroDeathReduceBuildingActivationSeconds",
  "QuestCompleteBonusCoin", "RecoverDestroyedRelicsWithFoilium", "SalaryFlatBonus",
  "StartingFoilium", "UnlockBuilding",
] as const;
type Building = BphFxState["buildings"][number];
const applies = (effect: BphEffect, id: string): boolean =>
  !effect.targets.targetBuilding || effect.targets.targetBuilding === id;
const sum = (ctx: BphFxContext, kind: string, id: string): number =>
  ctx.effects.reduce((total, effect) =>
    total + (effect.type === kind && applies(effect, id) ? effect.value : 0), 0);
const unconfirmed = (ctx: BphFxContext, key: string): void => {
  ctx.state.counters[`buildings:unconfirmed:${key}`] = 1;
};
function chance(ctx: BphFxContext, value: number): boolean {
  return value > 0 && ctx.random() < ctx.chance(value);
}
function claim(ctx: BphFxContext, key: string): boolean {
  if (ctx.save.lifecycle.claimed.includes(key)) return false;
  ctx.save.lifecycle.claimed.push(key);
  return true;
}
function gainCoins(ctx: BphFxContext, amount: number, position = CENTER): void {
  ctx.save.coins += amount; ctx.run.gold += amount;
  ctx.emit({ kind: "coin", x: position.x, y: position.y, value: amount });
  if (ctx.run.phase === "playing") {
    ctx.run.earned += amount;
    ctx.emitEvent({ kind: "coins-gained", amount });
  }
}
function reduceRandomCooldown(ctx: BphFxContext, amount: number): void {
  const seconds = sum(ctx, "CombatCoinReduceRandomBuildingCooldown", "");
  if (seconds <= 0 || !ctx.state.buildings.length) return;
  for (let coin = 0; coin < amount; coin++) {
    const building = ctx.state.buildings[Math.floor(ctx.random() * ctx.state.buildings.length)];
    building.clock += seconds;
  }
}
function activate(ctx: BphFxContext, building: Building, grant = true): void {
  const definition = BUILDINGS[building.id];
  if (!definition) { unconfirmed(ctx, `building:${building.id}`); return; }
  building.activations++;
  if (building.id === "Building_4Royal") {
    // The save inventory is the only exposed unopened-pack identity boundary.
    const candidates = ctx.save.inventory.filter(pack => !pack.box);
    if (candidates.length) {
      const pack = candidates[Math.floor(ctx.random() * candidates.length)];
      pack.packId = definition.pack;
    }
  } else if (grant) ctx.grantPack(definition.pack, 1, packMetadata(ctx, building.id));
  for (const effect of ctx.effects) {
    if (!applies(effect, building.id)) continue;
    if (effect.type === "BuildingActivateCastSpell") {
      if (!effect.targets.targetSpell) { unconfirmed(ctx, effect.type); continue; }
      for (let i = 0; i < effect.value; i++) ctx.state.spells.push({
        id: effect.targets.targetSpell, x: building.x, y: building.y, power: 1,
      });
    }
    if (effect.type === "BuildingActivateApplyStatusToAllHeroes") {
      // Only Charge is assigned by the source rows. Its native power is 100%.
      if (effect.targets.targetStatus !== "Charge") { unconfirmed(ctx, effect.type); continue; }
      for (const squad of ctx.run.squads) for (const unit of [squad, ...squad.soldiers]) {
        if (unit.hp <= 0 || !ctx.profileId(unit)) continue;
        const existing = ctx.state.statuses.find(s => s.targetId === unit.id && s.id === "Charge");
        if (existing) existing.until = Math.max(existing.until, ctx.run.time + effect.value);
        else ctx.applyBuff({
          target: unit, side: "ally", id: "Charge", duration: effect.value, power: 100, stacks: 1,
        });
      }
    }
    if (effect.type === "BuildingActivateGainCombatCoins" && chance(ctx, effect.value)) {
      gainCoins(ctx, effect.effectPower, building);
    }
  }
}
const packMetadata = (ctx: BphFxContext, id: string) => ({ sourceBuilding: id,
  foilChanceBonus: sum(ctx, "BuildingSpawnedPackFoilChance", id), giantChance: sum(ctx, "BuildingSpawnedPackGiantChance", id) });
const barracksSum = (ctx: BphFxContext, kind: string): number => ctx.effects.reduce((total, effect) => total
  + (effect.type === kind && (!effect.targets.targetBuilding || BPH_BARRACKS_BUILDINGS.includes(effect.targets.targetBuilding)) ? effect.value : 0), 0);
/** The barracks clock in battle seconds: full at cooldown, then held READY (readyAt) until it is drawn. */
export function bphBarracksClock(ctx: BphFxContext): { readonly cooldown: number; readonly clock: number; readonly readyAt: number | null } | null {
  if (!bphCastleUnlocks(ctx.effects).production) return null;
  const readyAt = ctx.state.counters[BARRACKS_READY] ?? -1;
  return { cooldown: barracksCooldown(ctx), clock: ctx.state.counters[BARRACKS_CLOCK] ?? 0, readyAt: readyAt < 0 ? null : readyAt };
}
const barracksCooldown = (ctx: BphFxContext) =>
  Math.max(1, 8 - barracksSum(ctx, "BuildingReduceActivationCooldownFlatSeconds"));
function stepBarracks(ctx: BphFxContext, dt: number): void {
  if (ctx.run.bph?.supplyAt === Infinity || !bphCastleUnlocks(ctx.effects).production) return;
  if ((ctx.state.counters[BARRACKS_READY] ?? -1) >= 0) return;
  const clock = (ctx.state.counters[BARRACKS_CLOCK] ?? 0) + dt * (1 + barracksSum(ctx, "BuildingReduceActivationCooldownPercent"));
  if (clock < barracksCooldown(ctx)) { ctx.state.counters[BARRACKS_CLOCK] = clock; return; }
  ctx.state.counters[BARRACKS_CLOCK] = 0; ctx.state.counters[BARRACKS_READY] = ctx.run.time;
}
/**
 * Draw without using combat RNG for a forced or single-candidate pick. Supply weights use
 * base prices, independent of the player's purchases this battle.
 */
export function takeBphBarracksDraw(ctx: BphFxContext): readonly { readonly packId: string; readonly metadata?: ReturnType<typeof packMetadata> }[] {
  if ((ctx.state.counters[BARRACKS_READY] ?? -1) < 0) return [];
  ctx.state.counters[BARRACKS_READY] = -1;
  const candidates = [...bphUnlockedTroopPacks(ctx.save, ctx.effects)].sort();
  const pick = () => {
    if (candidates.length === 1) return candidates[0];
    let point = ctx.random() * candidates.reduce((sum, id) => sum + 1 / bphRecruitBasePrice(id), 0);
    for (const id of candidates) if ((point -= 1 / bphRecruitBasePrice(id)) < 0) return id;
    return candidates[candidates.length - 1];
  };
  let guaranteed = ctx.save.pendingSupplyPacks?.shift();
  while (guaranteed && !candidates.includes(guaranteed)) guaranteed = ctx.save.pendingSupplyPacks?.shift();
  const fired = [guaranteed ?? pick()];
  if (chance(ctx, barracksSum(ctx, "BuildingActivateTwiceChance"))) fired.push(pick());
  return fired.map(packId => {
    const building = ctx.state.buildings.find(b => BPH_BARRACKS_BUILDINGS.includes(b.id) && bphBuildingPack(b.id) === packId);
    if (!building) return { packId };
    activate(ctx, building, false);
    return { packId, metadata: packMetadata(ctx, building.id) };
  });
}
/**
 * The source Magic and Tome buildings are the castle temple's tactic draws: they fill only while the temple stands,
 * then wait for a tap on the temple and collect themselves after TEMPLE_AUTO_COLLECT seconds.
 * Each collected draw goes through the one ctx.grantPack, so in a survival battle it drops as a field crate like every building pack.
 */
const TEMPLE_DRAWS: ReadonlySet<string> = new Set(["Building_3Magic", "Building_8Tome"]);
export const TEMPLE_AUTO_COLLECT = 4;
function collect(ctx: BphFxContext, building: Building, cooldown: number): void {
  building.clock -= cooldown; delete building.waiting;
  activate(ctx, building);
  if (chance(ctx, sum(ctx, "BuildingActivateTwiceChance", building.id))) activate(ctx, building);
}
function templeCooldown(ctx: BphFxContext, building: Building): number {
  return BUILDINGS[building.id].cooldown - sum(ctx, "BuildingReduceActivationCooldownFlatSeconds", building.id);
}
function stepTemple(ctx: BphFxContext, building: Building, dt: number, speed: number, cooldown: number): void {
  if (building.waiting === undefined) {
    building.clock = Math.min(cooldown, building.clock + dt * speed);
    if (building.clock >= cooldown) building.waiting = 0;
    return;
  }
  building.waiting += dt;
  if (building.waiting >= TEMPLE_AUTO_COLLECT) collect(ctx, building, cooldown);
}
/** Whether a full tactic draw waits at the temple for its tap. */
export function bphTempleReady(run: Run): boolean {
  return bphFxContext(run)?.state.buildings.some(building => TEMPLE_DRAWS.has(building.id) && building.waiting !== undefined) ?? false;
}
/** A temple tap collects every waiting tactic draw through the one pack grant; returns how many it collected. */
export function collectBphTemple(run: Run): number {
  const ctx = bphFxContext(run);
  if (!ctx || run.phase !== "playing") return 0;
  const ready = ctx.state.buildings.filter(building => TEMPLE_DRAWS.has(building.id) && building.waiting !== undefined);
  for (const building of ready) collect(ctx, building, templeCooldown(ctx, building));
  return ready.length;
}
function stepBuildings(ctx: BphFxContext, dt: number): void {
  stepBarracks(ctx, dt);
  const temple = bphCastleUnlocks(ctx.effects).temple;
  for (const building of ctx.state.buildings) {
    if (BPH_BARRACKS_BUILDINGS.includes(building.id)) continue;
    if (TEMPLE_DRAWS.has(building.id) && !temple) continue;
    const definition = BUILDINGS[building.id];
    if (!definition) { unconfirmed(ctx, `building:${building.id}`); continue; }
    // The wave boundary exists now, but the original increment is still unknown.
    if (building.id === "Building_XRelics") {
      unconfirmed(ctx, "Building_XRelics"); continue;
    }
    const cooldown = definition.cooldown - sum(ctx, "BuildingReduceActivationCooldownFlatSeconds", building.id);
    const speed = 1 + sum(ctx, "BuildingReduceActivationCooldownPercent", building.id)
      + Math.min(.5, sum(ctx, "BuildingActivationSpeedPerUnopenedPack", building.id) * ctx.save.inventory.length);
    if (cooldown <= 0 || speed <= 0) {
      unconfirmed(ctx, `cooldown:${building.id}`); continue;
    }
    if (TEMPLE_DRAWS.has(building.id)) { stepTemple(ctx, building, dt, speed, cooldown); continue; }
    building.clock += dt * speed;
    while (building.clock >= cooldown) {
      building.clock -= cooldown;
      activate(ctx, building);
      if (chance(ctx, sum(ctx, "BuildingActivateTwiceChance", building.id))) activate(ctx, building);
    }
  }
}

// The two surge sums depend only on the bound effect list, which is swapped whole and never edited in place.
const surgeSums = new WeakMap<readonly BphEffect[], { readonly base: number; readonly foil: number }>();
function surgeSum(ctx: BphFxContext): { readonly base: number; readonly foil: number } {
  let sums = surgeSums.get(ctx.effects);
  if (!sums) surgeSums.set(ctx.effects, sums = { base: sum(ctx, "MasterySurgeBonus", ""), foil: sum(ctx, "FoilHeroAliveMasterySurgeBonus", "") });
  return sums;
}
/** Living foil units, recounted per event because hp crosses zero mid-step with no event (revive, hurt before unit-death).
 *  unitInfo(unit).foil is unit.bph.foil (bphUnitInfo), read directly so the scan allocates nothing. */
function foilAlive(ctx: BphFxContext): number {
  let count = 0;
  for (const squad of ctx.run.squads) {
    if (squad.hp > 0 && squad.bph?.foil) count++;
    for (const unit of squad.soldiers) if (unit.hp > 0 && unit.bph?.foil) count++;
  }
  return count;
}

export const BPH_BUILDING_CONSUMERS: readonly BphEffectConsumer[] = [{
  id: "buildings", kinds: KINDS,
  onEvent: (ctx, event) => {
    const sums = surgeSum(ctx);
    const banner = sum(ctx, "DifferentPackBoughtMasterySurgeBonus", "");
    if (banner > 0 && event.kind === "pack-bought")
      ctx.state.counters[`buildings:bought:${event.packId}:${event.box}`] = 1;
    const bought = banner > 0 ? Object.keys(ctx.state.counters).filter(key => key.startsWith("buildings:bought:")).length : 0;
    const surge = sums.base + (sums.foil === 0 ? 0 : foilAlive(ctx)) * sums.foil + banner * bought;
    ctx.state.resourceSurge += surge - (ctx.state.counters["buildings:surge"] ?? 0);
    ctx.state.counters["buildings:surge"] = surge;
    ctx.state.relics = [...ctx.save.relicState.equipped];
    if (event.kind === "mastery-gained") {
      event.grant.amount *= 1 + ctx.state.resourceSurge;
      if (ctx.run.bph?.survival && !ctx.run.bph.settled &&
          (event.source === "pack" || event.source === "discovery")) {
        const key = `buildings:field-mastery:${event.source}`;
        const paid = ctx.state.counters[key] ?? 0;
        const limit = event.source === "pack" ? 60 : 80;
        event.grant.amount = Math.min(event.grant.amount, Math.max(0, limit - paid));
        if (event.grant.amount > 0) ctx.state.counters[key] = paid + event.grant.amount;
      }
    }
    if (event.kind === "run-start" || event.kind === "improvements-start" || event.kind === "campaign-start")
      projectBphSalary(ctx.save, ctx.effects);
    if (event.kind === "improvements-start") {
      const interest = sum(ctx, "MasteryInterest", "");
      if (interest > 0) grantBphMastery(ctx.save, {
        receiptId: `buildings:interest:${event.visitId}`, amount: ctx.save.resources.mastery * interest, source: "interest",
      });
    }
    if (event.kind === "step" && ctx.run.phase === "playing") stepBuildings(ctx, event.dt);
    if (event.kind === "coins-gained") reduceRandomCooldown(ctx, event.amount);
  },
  consume: (ctx, event, effect) => {
    const placement = effect.targets.placementId ?? effect.nodeId;
    if (event.kind === "run-start" || event.kind === "improvements-start" || event.kind === "campaign-start") {
      if (effect.type === "DiscoverTargetRelic") {
        if (effect.targets.targetRelic) discoverBphRelic(ctx.save, effect.targets.targetRelic);
        else unconfirmed(ctx, effect.type);
      }
      if (effect.type === "GainRelicSlot" && claim(ctx, `buildings:slots:${placement}`))
        ctx.save.relicState.slots += effect.value;
    }
    if (event.kind === "campaign-start" && effect.type === "StartingFoilium"
      && claim(ctx, `buildings:foilium:${placement}:${event.attemptId}`)) ctx.save.resources.foilium += effect.value;
    if (event.kind === "quest-completed" && effect.type === "QuestCompleteBonusCoin"
      && claim(ctx, `buildings:quest:${placement}:${event.placementId}:${event.claim}`)) gainCoins(ctx, effect.value);
    // RecoverDestroyedRelicsWithFoilium executes in recoverBphRelic: it checks these
    // active effects, atomically charges 5+5n and emits relic-recovered back here.
    // GlobalChanceEffectMultiplier executes in the shared ctx.chance threshold.
    if (event.kind === "unit-stats" && effect.type === "HeroAttackDamageScalesWithMasterySurgeBonus") {
      const target = effect.targets.targetHaengjuClass, profile = BPH_PROFILES[event.profileId];
      if (target ? profile && bphRelicClassMatches(ctx.effects, profile.classId, target)
        : ctx.originalClasses(event.unit).includes(Number(effect.targets.targetClass ?? 4)))
        event.stats.damage *= 1 + effect.value * ctx.state.resourceSurge;
    }
    if (event.kind === "run-start") {
      if (effect.type === "UnlockBuilding") {
        const id = effect.targets.targetBuilding;
        if (!id || !BUILDINGS[id]) { unconfirmed(ctx, "UnlockBuilding"); return; }
        // The Royal pack timer is the smithy's own work (the source calls it the Blacksmith): no smithy, no timer.
        if (id === "Building_4Royal" && !bphCastleUnlocks(ctx.effects).smithy) return;
        if (!ctx.state.buildings.some(building => building.id === id)) ctx.state.buildings.push({
          id, x: CENTER.x, y: CENTER.y, clock: 0, activations: 0,
        });
      }
    }
    if (event.kind === "unit-death" && effect.type === "OnHeroDeathReduceBuildingActivationSeconds"
      && ctx.profileId(event.unit)) {
      for (const building of ctx.state.buildings)
        if (applies(effect, building.id)) building.clock += effect.value;
    }
  },
}];
