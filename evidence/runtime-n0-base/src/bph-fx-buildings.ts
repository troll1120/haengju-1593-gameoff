import type { BphEffect, BphEffectConsumer, BphFxContext, BphFxState } from "./bph-contract";
import { CENTER } from "./geometry";
import { grantBphMastery, grantBphRelic, projectBphSalary } from "./bph-account";

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
  "GlobalChanceEffectMultiplier", "HeroAttackDamageScalesWithMasterySurgeBonus",
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
function activate(ctx: BphFxContext, building: Building): void {
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
  } else {
    ctx.grantPack(definition.pack, 1, {
      sourceBuilding: building.id,
      foilChanceBonus: sum(ctx, "BuildingSpawnedPackFoilChance", building.id),
      giantChance: sum(ctx, "BuildingSpawnedPackGiantChance", building.id),
    });
  }
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
function stepBuildings(ctx: BphFxContext, dt: number): void {
  for (const building of ctx.state.buildings) {
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
    building.clock += dt * speed;
    while (building.clock >= cooldown) {
      building.clock -= cooldown;
      activate(ctx, building);
      if (chance(ctx, sum(ctx, "BuildingActivateTwiceChance", building.id))) activate(ctx, building);
    }
  }
}

export const BPH_BUILDING_CONSUMERS: readonly BphEffectConsumer[] = [{
  id: "buildings", kinds: KINDS,
  onEvent: (ctx, event) => {
    const foilBonus = sum(ctx, "FoilHeroAliveMasterySurgeBonus", "");
    const foilAlive = foilBonus === 0 ? 0 : ctx.run.squads.reduce((count, squad) => count
      + [squad, ...squad.soldiers].filter(unit => unit.hp > 0 && ctx.unitInfo(unit)?.foil).length, 0);
    const surge = sum(ctx, "MasterySurgeBonus", "") + foilAlive * foilBonus;
    ctx.state.resourceSurge += surge - (ctx.state.counters["buildings:surge"] ?? 0);
    ctx.state.counters["buildings:surge"] = surge;
    ctx.state.relics = [...ctx.save.relicState.equipped];
    if (event.kind === "mastery-gained") event.grant.amount *= 1 + ctx.state.resourceSurge;
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
        if (effect.targets.targetRelic) grantBphRelic(ctx.save, effect.targets.targetRelic);
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
    if (event.kind === "unit-stats" && effect.type === "HeroAttackDamageScalesWithMasterySurgeBonus"
      && ctx.originalClasses(event.unit).includes(4)) event.stats.damage *= 1 + effect.value * ctx.state.resourceSurge;
    if (event.kind === "run-start") {
      if (effect.type === "UnlockBuilding") {
        const id = effect.targets.targetBuilding;
        if (!id || !BUILDINGS[id]) { unconfirmed(ctx, "UnlockBuilding"); return; }
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
