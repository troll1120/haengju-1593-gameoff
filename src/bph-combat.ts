import { BPH_ATTACK_RANGE_TO_PX, BPH_WORLD_TO_PX } from "./bph-contract";
import type { BphClass, BphDrawResult, BphEffect, BphFxState, BphPackInstance, BphSave, BphSpawnOrigin } from "./bph-contract";
import type { Effect, Run, SoldierKind, Unit } from "./rules";
import { assignMarchFlank } from "./rules";
import { BPH_PACKS, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { bphEffectValue, openBphPack } from "./bph";
import { discoverBphCodex } from "./bph-codex-rewards";
import { bphMergedReward } from "./bph-cost-merge";
import { CENTER, contains, fortRect, WIDTH } from "./geometry";
import { riverBank, riverLane } from "./river";
import { bphRecruitMultiplier, bphUnitPack } from "./bph-recruit";
import type { BphWaveId } from "./bph-waves";
import { bphFxContext, dispatchBphEffects, freshBphFxState } from "./bph-fx-dispatch";
import { recordBphProgress } from "./bph-upgrades";
import type { BphShop } from "./bph-shop";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { createBphSurvival } from "./bph-survival";
import type { BphSurvivalState } from "./bph-survival";
import { bphSmithyBoost } from "./bph-smithy";
import type { BphSmithyState } from "./bph-smithy";
import { bphGeneralMastery } from "./bph-mastery-sides";
import type { BphGeneralMastery } from "./bph-mastery-sides";
import type { BphGeneral } from "./bph-commanders";
import { TUNABLES } from "./tunables";
import { bphUnitBaseStatBonus, EXTRA_COMPANIONS } from "./bph-unit-upgrades";
import { bphFieldCommand } from "./bph-general-command";

/** Our display/world conversion; raw profiles remain in original units. */
export const BPH_SCALE = { hp: 1, damage: 1, generalHp: BPH_SURVIVAL_TABLE.generalHpScale,
  distance: BPH_ATTACK_RANGE_TO_PX, movement: BPH_WORLD_TO_PX } as const;
export const bphAttackReach = (range: number) => range * BPH_SCALE.distance;
export const icebourneSwordOrbit = () => Number(BPH_PROFILES.Hero7_Icebourne.raw.rotatingSwordRadius) * BPH_WORLD_TO_PX;
// Icebourne needs to start his attack where the blades pass, clear of the orbit's inner dead zone.
export const bphProfileAttackReach = (profileId: string, range: number) =>
  profileId === "Hero7_Icebourne" ? icebourneSwordOrbit() : bphAttackReach(range);
// Target searches use a strict upper bound. Include the projected contact point
// even if subtracting field coordinates rounds its distance up by a few ulps.
export const meleeContactLimit = (reach: number) => reach + 1e-7;
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
/** landAt: battle time a building pack dropped as a crate; absent for a paid recruit, opened at the press. */
export type BphFieldPack = BphPackInstance & { hp: number; x: number; y: number; landAt?: number };
/**
 * Building packs drop on the battlefield as crates (owner DM 1794902302.558399). A crate lies `life` battle seconds
 * and blinks for the last `blink`. A tap opens it on the recruit reels with a roulette roll (unit packs x1-x5,
 * mean 1.61, a side stream keyed by the seed and the pack id). One left alone opens by itself when it runs out, at
 * x1, so it is never lost but is worth about 62% of a tapped one. `gap` keeps it off the walls, `bank` off the river.
 */
export const BPH_CRATE = { ...TUNABLES.fieldCrate, salt: 0x5eedc4a7 } as const;
/** Ground just outside the castle walls, spread around them by the golden ratio of the pack id, never on water. */
export function bphCratePoint(serial: number): { x: number; y: number } {
  const ring = fortRect(0, BPH_CRATE.gap), w = ring.right - ring.left, h = ring.bottom - ring.top;
  let along = (serial * .6180339887 % 1) * 2 * (w + h);
  const p = along < w ? { x: ring.left + along, y: ring.top } : (along -= w) < h ? { x: ring.right, y: ring.top + along }
    : (along -= h) < w ? { x: ring.right - along, y: ring.bottom } : { x: ring.left, y: ring.bottom - (along - w) };
  const at = { x: Math.round(Math.max(24, Math.min(WIDTH - 24, p.x))), y: Math.round(Math.max(40, Math.min(riverBank() - BPH_CRATE.bank, p.y))) };
  // A short field pulls the bottom row up against the walls: move that crate out to the nearer side instead.
  if (contains(fortRect(0, BPH_CRATE.gap / 2), at)) at.x = at.x < CENTER.x ? ring.left : ring.right;
  return at;
}
/**
 * Recruit reveal clock in battle seconds. The unit reel stops first, the multiplier reel last, and the troops
 * enter the field at that last stop; the next receipt of a box starts after the hold. Pausing the battle pauses it.
 */
export const BPH_ARRIVAL = { unitStop: 1.4, numberStop: 2.3, hold: 1.2 } as const;
export type BphArrival = { readonly resultId: number; readonly start: number; readonly at: number };
type PendingArrival = BphArrival & { readonly receipt: BphDrawResult; readonly instance: BphPackInstance; readonly fieldId: number };
export type BphBattle = {
  readonly save: BphSave; readonly upgrades: readonly BphEffect[]; readonly waveId: BphWaveId;
  packs: BphFieldPack[]; receipts: BphDrawResult[]; applied: number[]; bought: Record<string, number>;
  tomes: { id: string; clock: number; stacks: number; foil?: boolean | null }[];
  pendingMastery: number; settled: boolean; turtleUntil: number;
  /** Whole medals earned from kill drops, settled with other battle rewards. */
  killMedals?: number;
  readonly survival: BphSurvivalState | null;
  hiredGenerals?: Partial<Record<number, BphGeneral>>;
  recruitShop: BphShop | null; supplyAt: number;
  readonly fx: BphFxState; readonly fxEvents: Effect[];
  /** Present only once a pack opened on the reveal clock, so runs without one keep their exact bytes. */
  arrivals?: PendingArrival[]; arrivalEnd?: number;
  /** Receipts drawn by the barracks, revealed at the barracks rather than above the recruit button. */
  barracksReceipts?: number[];
  /** Present only once the smithy sold something this run. */
  smithy?: BphSmithyState;
  /** Mastery general-side bonuses, present only when the account bought a general-side node. */
  readonly generalMastery?: BphGeneralMastery;
};
export function createBphBattle(save: BphSave, upgrades: readonly BphEffect[], waveId: BphWaveId, seed = 0): BphBattle {
  const general = bphGeneralMastery(upgrades);
  return { save, upgrades, waveId, ...general.purchases ? { generalMastery: general } : {},
    packs: save.inventory.map(pack => ({ ...pack, hp: 2, ...bphCratePoint(pack.id), landAt: 0 })),
    receipts: [], applied: [], bought: {}, tomes: [], pendingMastery: 0, settled: false, turtleUntil: 0,
    survival: createBphSurvival(waveId, seed), recruitShop: null, supplyAt: BPH_SURVIVAL_TABLE.supplySeconds,
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
  const extraFriends = profile.id === "Hero5_Beastmaster"
    ? bphEffectValue(battle.upgrades, EXTRA_COMPANIONS, profile.id) : 0;
  const friendOwners: Unit[] = [];
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
    assignMarchFlank(run, unit);
    owner.soldiers.push(unit);
    const stats = bphStats(unit, run);
    if (stats) unit.hp = unit.maxHp = stats.hp * BPH_SCALE.hp;
    dispatchBphEffects(run, { kind: "unit-spawn", unit, profileId: profile.id,
      life: { unitId: unit.id, lifeId: 1, profileId: profile.id,
        parentId: origin.parentId ?? null, cause: origin.cause ?? "pack" } });
    if (profile.id === "Hero5_Beastmaster"
      && !bphFxContext(run)?.state.counters[`troops:friends:${unit.id}:${unit.bph?.lifeId}`])
      legacyFriendOwners++;
    if (extraFriends > 0) friendOwners.push(unit);
  }
  if (profile.id === "Hero5_Beastmaster" && legacyFriendOwners > 0) {
    const friends = Number(profile.raw.beastmasterFriendCount);
    addBphProfile(run, { profileId: "Hero_Rat", foil: false, copies: friends * legacyFriendOwners, discovered: false },
      { ...origin, parentId: owner.soldiers.at(-1)?.id, cause: "summon" });
  }
  for (const parent of friendOwners) {
    addBphProfile(run, { profileId: "Hero_Rat", foil: card.foil, copies: extraFriends, discovered: false },
      { ...origin, position: parent, parentId: parent.id, cause: "summon" });
  }
}
function spawnBphReceipt(run: Run, receipt: BphDrawResult, packId: string): void {
  let spawned = 0;
  for (const card of receipt.cards) {
    const origin = { packId, resultId: receipt.id, cause: "pack" } as const;
    addBphProfile(run, card, origin); spawned += card.copies;
    // Roulette extras repeat the base spawn, which never passed through the legacy troop cap either.
    for (let extra = card.copies * ((receipt.multiplier ?? 1) - 1); extra > 0; extra--) {
      addBphProfile(run, { ...card, copies: 1 }, origin); spawned++;
    }
  }
  if (receipt.multiplier) (receipt as { spawned?: number }).spawned = spawned;
}
function openedBphReceipt(run: Run, receipt: BphDrawResult, instance: BphPackInstance, position: { x: number; y: number }): void {
  dispatchBphEffects(run, { kind: "pack-opened", result: receipt,
    origin: { instanceId: instance.id, packId: instance.packId, box: instance.box,
      sourceBuilding: instance.sourceBuilding, sourceWave: instance.sourceWave, position } });
  if (receipt.frenzy) run.squads[0].frenzyUntil = Math.max(run.squads[0].frenzyUntil, run.time + 8);
}
/** The reveal clock of a receipt still on its reels; undefined once its troops have entered. */
export function bphArrival(run: Run, resultId: number): BphArrival | undefined {
  return run.bph?.arrivals?.find(arrival => arrival.resultId === resultId);
}
/**
 * Troops of a revealed receipt enter when its last reel stops, in draw order, followed by the same pack-opened
 * effects as an instant opening. The opened pack (hp 0) stays in battle.packs until its last receipt lands, as
 * it did during an instant opening, so opening effects still find it.
 */
export function landBphArrivals(run: Run): void {
  const battle = run.bph, arrivals = battle?.arrivals;
  if (!battle || !arrivals) return;
  while (arrivals.length && arrivals[0].at <= run.time) {
    const arrival = arrivals.shift()!, field = battle.packs.find(pack => pack.id === arrival.fieldId);
    spawnBphReceipt(run, arrival.receipt, arrival.receipt.packId);
    openedBphReceipt(run, arrival.receipt, arrival.instance, { x: field?.x ?? CENTER.x, y: field?.y ?? CENTER.y });
    if (!arrivals.some(next => next.fieldId === arrival.fieldId))
      battle.packs = battle.packs.filter(pack => pack.id !== arrival.fieldId);
  }
}
/**
 * Owner DM 1794922752.822339: a recruit press while reels spin lands every pending receipt at once, the same
 * troops and effects in the same order, with no new draw and no gold. The next receipt starts from now.
 */
export function skipBphArrivals(run: Run): boolean {
  const battle = run.bph;
  if (!battle?.arrivals?.length) return false;
  battle.arrivals = battle.arrivals.map(arrival => ({ ...arrival, at: Math.min(arrival.at, run.time) }));
  landBphArrivals(run);
  battle.arrivalEnd = run.time;
  return true;
}
/**
 * "now" spawns at the tap (rules fixtures); "reveal" is the played game: the draw and its bookkeeping happen
 * at the tap, the troops and the pack-opened effects when the reveal reels stop (BPH_ARRIVAL).
 */
export function hitBphPack(run: Run, id: number, arrival: "now" | "reveal" = "now"): readonly BphDrawResult[] {
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
    const receipt = openBphPack(battle.save, { packId: pack.id, effects: battle.upgrades, instance,
      firstOfBattle: battle.receipts.length === 0 });
    receipts.push(receipt); battle.receipts.push(receipt);
    if (arrival === "now") spawnBphReceipt(run, receipt, pack.id);
    else {
      const start = Math.max(run.time, battle.arrivalEnd ?? run.time), at = start + BPH_ARRIVAL.numberStop;
      battle.arrivalEnd = at + BPH_ARRIVAL.hold;
      (battle.arrivals ??= []).push({ resultId: receipt.id, start, at, receipt, instance, fieldId: field.id });
    }
    battle.applied.push(receipt.id);
    recordBphProgress(battle.save, { kind: "pack-opened", packId: receipt.packId, count: 1 });
    for (const card of receipt.cards) if (card.discovered || card.foil)
      recordBphProgress(battle.save, { kind: "card-discovered", profileId: card.profileId, foil: card.foil });
    if (arrival === "now") openedBphReceipt(run, receipt, instance, { x: field.x, y: field.y });
  }
  if (field.box) battle.save.resources.mastery += pack.boxMastery;
  if (arrival === "now") battle.packs = battle.packs.filter(pack => pack.hp > 0);
  return receipts;
}
/** Crates still lying on the field, oldest first. */
export function bphCrates(run: Run): readonly BphFieldPack[] {
  return run.bph?.packs.filter(pack => pack.landAt !== undefined && pack.hp > 0) ?? [];
}
/** Opens a crate with the hits the two old field taps dealt, so its draw is the field pack's draw. */
function openBphCrate(run: Run, field: BphFieldPack): readonly BphDrawResult[] {
  let opened: readonly BphDrawResult[] = [];
  for (let hits = field.hp; hits > 0; hits--) opened = hitBphPack(run, field.id, "reveal");
  return opened;
}
/** One tap opens a crate on the recruit reels; its roulette roll rides on the instance as a purchase's does. */
export function tapBphCrate(run: Run, id: number): readonly BphDrawResult[] {
  const field = bphCrates(run).find(pack => pack.id === id), instance = run.bph?.save.inventory.find(pack => pack.id === id);
  if (!field || !instance || run.phase !== "playing") return [];
  if (instance.multiplier === undefined && bphUnitPack(instance.packId)) {
    const multiplier = bphRecruitMultiplier(run.seed ^ BPH_CRATE.salt, id);
    if (multiplier > 1) instance.multiplier = multiplier;
  }
  return openBphCrate(run, field);
}
/** A crate nobody tapped opens by itself when its time runs out, at x1. */
export function expireBphCrates(run: Run): void {
  for (const field of bphCrates(run)) {
    if (run.time < field.landAt! + BPH_CRATE.life) continue;
    const instance = run.bph!.save.inventory.find(pack => pack.id === field.id);
    if (instance) delete instance.multiplier;
    openBphCrate(run, field);
  }
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
    const stages = battle.save.unitUpgrades[bphUnitInfo(unit)?.profileId ?? profile.id];
    unit.maxHp = profileHp(profile.id, battle);
    const health = bphUnitBaseStatBonus(stages, "health");
    if (health) unit.maxHp += profile.hp * BPH_SCALE.hp * health;
    unit.hp = ratio * unit.maxHp;
    unit.kind = BPH_CLASS_BODY[profile.classId];
    effects.push({ kind: "evolution", x: unit.x, y: unit.y, value: 1, label: profile.name });
    if (next.become && !battle.save.discovered.includes(profile.id)) {
      discoverBphCodex(battle.save, profile.id);
      const reward = bphMergedReward(profile.discoveryResource, profile.discoveryBonus);
      battle.save.resources[reward.resource] += reward.amount;
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
  const boost = bphSmithyBoost(run, p.classId);
  if (boost !== 1) { stats.hp *= boost; stats.damage *= boost; }
  const command = bphFieldCommand(run, p.classId);
  if (command?.health) stats.hp *= 1 + command.health;
  if (command?.attack) stats.damage *= 1 + command.attack;
  if (command?.attackSpeed) stats.cooldown /= 1 + command.attackSpeed;
  if (command?.range) stats.range *= 1 + command.range;
  if (command?.moveSpeed) stats.moveSpeed *= 1 + command.moveSpeed;
  if (command?.damageReduction) stats.damageReduction += command.damageReduction;
  const stages = run.bph?.save.unitUpgrades[bphUnitInfo(unit)?.profileId ?? p.id];
  const health = bphUnitBaseStatBonus(stages, "health");
  const attack = bphUnitBaseStatBonus(stages, "attack");
  const attackSpeed = bphUnitBaseStatBonus(stages, "attackSpeed");
  if (health) stats.hp += p.hp * health;
  if (attack) stats.damage += p.damage * attack;
  // Cooldown is the inverse of attack rate. Add the bonus in rate units.
  if (attackSpeed && p.cooldown > 0 && stats.cooldown > 0)
    stats.cooldown = 1 / (1 / stats.cooldown + attackSpeed / p.cooldown);
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
  return { reach: bphProfileAttackReach(profile.id, p.range), every: p.cooldown, windup: .16,
    // HeroDefinition.critDamage is a bonus (zero at base), not a total multiplier.
    // Native Hero.RollCrit adds the bonus to 2x; see review/unit-spells/critical.md.
    power: p.damage, critChance: p.critChance, critDamage: 2 + p.critDamage,
    cleave: p.area > 0 ? 1000 : 1, span: p.area * BPH_SCALE.distance,
    knock: 0, stun: 0, shot };
}
