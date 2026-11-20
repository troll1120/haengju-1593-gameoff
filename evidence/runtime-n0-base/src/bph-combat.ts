import { BPH_WORLD_TO_PX } from "./bph-contract";
import type { BphClass, BphDrawResult, BphEffect, BphFxState, BphPackInstance, BphSave, BphSpawnOrigin } from "./bph-contract";
import type { Effect, Run, SoldierKind, Unit } from "./rules";
import { BPH_PACKS, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { bphEffectValue, openBphPack } from "./bph";
import { discoverBphCodex } from "./bph-codex-rewards";
import { CENTER } from "./geometry";
import { riverLane } from "./river";
import type { BphWaveId } from "./bph-waves";
import { bphFxContext, dispatchBphEffects, freshBphFxState } from "./bph-fx-dispatch";
import { recordBphProgress } from "./bph-upgrades";
import type { BphShop } from "./bph-shop";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { createBphSurvival } from "./bph-survival";
import type { BphSurvivalState } from "./bph-survival";

/** Our display/world conversion; raw profiles remain in original units. */
export const BPH_SCALE = { hp: 1, damage: 1, generalHp: BPH_SURVIVAL_TABLE.generalHpScale,
  distance: BPH_WORLD_TO_PX, movement: BPH_WORLD_TO_PX } as const;
export const BPH_CLASS_BODY: Readonly<Record<BphClass, SoldierKind>> = {
  spearman: "spearman", archer: "archer", militia: "spearman", monk: "monk",
  hwacha: "hwacha", chongtong: "hwacha", joseon_cavalry: "ming_cavalry", panokseon: "panokseon",
};
export type BphUnit = {
  profileId: string; readonly birthProfileId: string; readonly packId: string;
  readonly foil: boolean; readonly giant: boolean; kills: number; stage: number;
  readonly resultId: number | null; readonly parentId: number | null; lifeId: number;
  readonly cause: NonNullable<BphSpawnOrigin["cause"]>;
};
export type BphFieldPack = BphPackInstance & { hp: number; x: number; y: number };
export type BphBattle = {
  readonly save: BphSave; readonly upgrades: readonly BphEffect[]; readonly waveId: BphWaveId;
  packs: BphFieldPack[]; receipts: BphDrawResult[]; applied: number[]; bought: Record<string, number>;
  tomes: { id: string; clock: number; stacks: number; foil?: boolean | null }[];
  pendingMastery: number; settled: boolean; turtleUntil: number;
  readonly survival: BphSurvivalState | null;
  recruitShop: BphShop | null; supplyAt: number;
  readonly fx: BphFxState; readonly fxEvents: Effect[];
};
export function createBphBattle(save: BphSave, upgrades: readonly BphEffect[], waveId: BphWaveId): BphBattle {
  return { save, upgrades, waveId,
    packs: save.inventory.map((pack, i) => ({ ...pack, hp: 2,
      x: CENTER.x + (i % 3 - 1) * 44, y: CENTER.y + 70 + Math.floor(i / 3) * 44 })),
    receipts: [], applied: [], bought: {}, tomes: [], pendingMastery: 0, settled: false, turtleUntil: 0,
    survival: createBphSurvival(waveId), recruitShop: null, supplyAt: BPH_SURVIVAL_TABLE.supplySeconds,
    fx: freshBphFxState(), fxEvents: [] };
}
function profileHp(id: string, battle: BphBattle): number {
  const profile = BPH_PROFILES[id];
  return profile.hp * BPH_SCALE.hp * (1 + bphEffectValue(battle.upgrades, "HeroMaxHP", id));
}
export function addBphProfile(run: Run, card: BphDrawResult["cards"][number], origin: BphSpawnOrigin): void {
  const battle = run.bph;
  if (!battle) return;
  const tome = BPH_TOMES[card.profileId];
  if (tome) {
    const owned = battle.tomes.find(t => t.id === tome.id);
    if (owned) {
      owned.stacks += card.copies;
      if (owned.foil !== card.foil) owned.foil = null;
    } else battle.tomes.push({ id: tome.id, clock: tome.interval, stacks: card.copies, foil: card.foil });
    return;
  }
  const profile = BPH_PROFILES[card.profileId];
  if (!profile) return;
  const owner = run.squads[0];
  let legacyFriendOwners = 0;
  for (let i = 0; i < card.copies; i++) {
    const kind = BPH_CLASS_BODY[profile.classId], maxHp = profileHp(profile.id, battle);
    const unit: Unit = { id: run.nextId++, kind, tier: 1, hp: maxHp, maxHp,
      x: origin.position?.x ?? (kind === "panokseon" ? 32 : CENTER.x),
      y: origin.position?.y ?? (kind === "panokseon" ? riverLane() : CENTER.y),
      clock: 0, strikeAt: 0, aim: 0, downUntil: 0, emerging: kind !== "panokseon",
      bph: { profileId: profile.id, birthProfileId: profile.id, packId: origin.packId,
        foil: card.foil, giant: card.giant === true, kills: 0, stage: 0,
        resultId: origin.resultId ?? null, parentId: origin.parentId ?? null,
        lifeId: 1, cause: origin.cause ?? "pack" } };
    owner.soldiers.push(unit);
    const stats = bphStats(unit, run);
    if (stats) unit.hp = unit.maxHp = stats.hp * BPH_SCALE.hp;
    dispatchBphEffects(run, { kind: "unit-spawn", unit, profileId: profile.id,
      life: { unitId: unit.id, lifeId: 1, profileId: profile.id,
        parentId: origin.parentId ?? null, cause: origin.cause ?? "pack" } });
    if (profile.id === "Hero5_Beastmaster"
      && !bphFxContext(run)?.state.counters[`troops:friends:${unit.id}:${unit.bph?.lifeId}`])
      legacyFriendOwners++;
  }
  if (profile.id === "Hero5_Beastmaster" && legacyFriendOwners > 0) {
    const friends = Number(profile.raw.beastmasterFriendCount);
    addBphProfile(run, { profileId: "Hero_Rat", foil: false, copies: friends * legacyFriendOwners, discovered: false },
      { ...origin, parentId: owner.soldiers.at(-1)?.id, cause: "summon" });
  }
}
export function hitBphPack(run: Run, id: number): readonly BphDrawResult[] {
  const battle = run.bph;
  if (!battle || run.phase !== "playing") return [];
  const field = battle.packs.find(pack => pack.id === id);
  if (!field || field.hp <= 0) return [];
  field.hp--;
  field.x += field.hp > 0 ? 4 : -4;
  if (field.hp > 0) return [];
  const inventory = battle.save.inventory.findIndex(pack => pack.id === id);
  if (inventory < 0) return [];
  const instance = battle.save.inventory[inventory];
  battle.save.inventory.splice(inventory, 1);
  const pack = BPH_PACKS[instance.packId], receipts: BphDrawResult[] = [];
  for (let i = 0; i < (field.box ? pack.boxCount : 1); i++) {
    const receipt = openBphPack(battle.save, { packId: pack.id, effects: battle.upgrades, instance });
    receipts.push(receipt); battle.receipts.push(receipt);
    let spawned = 0;
    for (const card of receipt.cards) {
      const origin = { packId: pack.id, resultId: receipt.id, cause: "pack" } as const;
      addBphProfile(run, card, origin); spawned += card.copies;
      // Roulette extras repeat the base spawn, which never passed through the legacy troop cap either.
      for (let extra = card.copies * ((receipt.multiplier ?? 1) - 1); extra > 0; extra--) {
        addBphProfile(run, { ...card, copies: 1 }, origin); spawned++;
      }
    }
    if (receipt.multiplier) (receipt as { spawned?: number }).spawned = spawned;
    battle.applied.push(receipt.id);
    recordBphProgress(battle.save, { kind: "pack-opened", packId: receipt.packId, count: 1 });
    for (const card of receipt.cards) if (card.discovered || card.foil)
      recordBphProgress(battle.save, { kind: "card-discovered", profileId: card.profileId, foil: card.foil });
    dispatchBphEffects(run, { kind: "pack-opened", result: receipt,
      origin: { instanceId: instance.id, packId: instance.packId, box: instance.box,
        sourceBuilding: instance.sourceBuilding, sourceWave: instance.sourceWave,
        position: { x: field.x, y: field.y } } });
    if (receipt.frenzy) run.squads[0].frenzyUntil = Math.max(run.squads[0].frenzyUntil, run.time + 8);
  }
  if (field.box) battle.save.resources.mastery += pack.boxMastery;
  battle.packs = battle.packs.filter(pack => pack.hp > 0);
  return receipts;
}
export function bphUnitKill(run: Run, unit: Unit, effects: Effect[]): void {
  const progress = unit.bph, battle = run.bph;
  if (!progress || !battle) return;
  progress.kills++;
  const base = BPH_PROFILES[progress.birthProfileId];
  const unlocked = bphEffectValue(battle.upgrades, "HeroKillUpgradeUnlock", base.id);
  for (let stage = progress.stage; stage < Math.min(unlocked, base.evolution.length); stage++) {
    const next = base.evolution[stage];
    if (progress.kills < next.kills) break;
    const ratio = unit.hp / unit.maxHp, profile = BPH_PROFILES[next.profileId];
    progress.profileId = profile.id; progress.stage = stage + 1;
    unit.maxHp = profileHp(profile.id, battle); unit.hp = ratio * unit.maxHp;
    unit.kind = BPH_CLASS_BODY[profile.classId];
    effects.push({ kind: "evolution", x: unit.x, y: unit.y, value: 1, label: profile.name });
    if (next.become && !battle.save.discovered.includes(profile.id)) {
      discoverBphCodex(battle.save, profile.id);
      battle.save.resources[profile.discoveryResource] += profile.discoveryBonus;
    }
  }
}
export function bphStats(unit: Unit, run: Run) {
  const progress = unit.bph;
  if (!progress) return null;
  const p = BPH_PROFILES[progress.profileId];
  const stats = { hp: p.hp, damage: p.damage, cooldown: p.cooldown, range: p.range, area: p.area,
    moveSpeed: p.moveSpeed, critChance: p.critChance, critDamage: p.critDamage,
    blockChance: p.blockChance, damageReduction: p.reduction };
  dispatchBphEffects(run, { kind: "unit-stats", unit, profileId: bphUnitInfo(unit)?.profileId ?? p.id, stats });
  return stats;
}
export function bphUnitInfo(unit: Unit) {
  const data = unit.bph;
  const stage = data && BPH_PROFILES[data.birthProfileId].evolution[data.stage - 1];
  return data ? { profileId: stage && !stage.become ? data.birthProfileId : data.profileId, foil: data.foil, giant: data.giant,
    originalClass: Number(BPH_PROFILES[data.profileId].raw.heroClass), packId: data.packId,
    resultId: data.resultId, parentId: data.parentId, lifeId: data.lifeId, cause: data.cause } : null;
}
export function bphArms(unit: Unit, run: Run) {
  const p = bphStats(unit, run);
  if (!p) return null;
  const profile = BPH_PROFILES[unit.bph?.profileId ?? ""];
  const shot: "" | "arrow" | "rocket" = profile.attackType === 0 ? "" : p.area > 0 ? "rocket" : "arrow";
  return { reach: p.range * BPH_SCALE.distance, every: p.cooldown, windup: .16,
    power: p.damage, critChance: p.critChance, critDamage: p.critDamage,
    cleave: p.area > 0 ? 1000 : 1, span: p.area * BPH_SCALE.distance,
    knock: 0, stun: 0, shot };
}
