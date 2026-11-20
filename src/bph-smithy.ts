import type { BphClass, BphEffect } from "./bph-contract";
import { BPH_CLASS_NAMES } from "./bph-data";
import { bphRelicClassMatches } from "./bph-relic-classes";
import { BPH_MONSTERS } from "./bph-data";
import { bphSurvivalIntensity } from "./bph-survival";
import { BPH_SURVIVAL_TABLE, bphSurvivalChapter, bphSurvivalEnemyScale } from "./bph-survival-data";
import { SIDES } from "./geometry";
import type { Run } from "./rules";

/**
 * The smithy: during play, gold buys one level for a whole troop class or the next wall tier. Every run starts
 * with the wooden palisade; the mastery map allows the stone wall (23:15 SN_TowerHP) and the castle wall
 * (17:19 SN_TowerHP2). Runs that buy nothing keep no smithy state, so their battle stays byte-identical.
 */
export type BphSmithyState = { levels: Partial<Record<BphClass, number>>; wall: number };
export const BPH_SMITHY_CLASSES = Object.keys(BPH_CLASS_NAMES) as readonly BphClass[];
export const BPH_SMITHY = {
  maxLevel: 4,
  /** Each class level multiplies that class's HP and damage by 1 + perLevel x level. */
  perLevel: .2,
  /** Class price doubles per level already bought: 4, 8, 16, 32 gold. */
  classPrice: 4,
  /** 0 palisade (목책), 1 stone wall (돌담), 2 castle wall (성벽): regular-spearman hits one side takes to break, and the
   * price to reach it (owner DM 1795094246.280439 "창병 1마리가 100번 공격하면 터지게 / 돌담은 1마리가 500번 / 성벽은 1마리가 1000번"). */
  walls: [{ hits: 100, price: 0 }, { hits: 500, price: 15 }, { hits: 1000, price: 30 }],
} as const;
export const BPH_WALL_TIER_PLACEMENTS = ["_SkillTreeMain_Demo:23:15", "_SkillTreeMain_Demo:17:19"] as const;

/** One regular Chapter 1 spearman's wall hit once spear files split into their final share (3:00, 1/3 each). */
export function bphSpearWallHit(): number {
  const file = BPH_SURVIVAL_TABLE.infantryFile[BPH_SURVIVAL_TABLE.infantryFile.length - 1], profileId = "Monster1_Caveling";
  return BPH_MONSTERS[profileId].towerDamage * bphSurvivalChapter("WaveChapter1")!.castleDamage
    * bphSurvivalIntensity(file.at).castleDamage * bphSurvivalEnemyScale("WaveChapter1", profileId).castleDamage / file.multiplier;
}
/** One side's HP at a wall tier; `boost` is the wall-HP upgrades (성벽 보강, 의병 III, BonfireMaxHP) as a multiplier. */
export const bphWallSideHp = (tier: number, boost: number): number => bphSpearWallHit() * BPH_SMITHY.walls[tier].hits * boost;
export const bphSmithyLevel = (run: Run, classId: BphClass): number => run.bph?.smithy?.levels[classId] ?? 0;
export const bphWallTier = (run: Run): number => run.bph?.smithy?.wall ?? 0;
export function bphSmithyBoost(run: Run, classId: BphClass): number {
  const battle = run.bph;
  if (!battle?.smithy) return 1;
  let level = bphSmithyLevel(run, classId);
  for (const other of BPH_SMITHY_CLASSES) {
    const linkedLevel = bphSmithyLevel(run, other);
    if (linkedLevel > level && bphRelicClassMatches(battle.upgrades, classId, other)) level = linkedLevel;
  }
  return 1 + BPH_SMITHY.perLevel * level;
}
/** The highest wall tier the mastery map allows: palisade always, then one tier per owned placement in order. */
export function bphWallTierCap(effects: readonly BphEffect[]): number {
  const owned = new Set(effects.map(effect => effect.targets.placementId));
  let cap = 0;
  while (cap < BPH_WALL_TIER_PLACEMENTS.length && owned.has(BPH_WALL_TIER_PLACEMENTS[cap])) cap++;
  return cap;
}
/** Null when the class is at its last level. */
export function bphSmithyClassPrice(run: Run, classId: BphClass): number | null {
  const level = bphSmithyLevel(run, classId);
  return level >= BPH_SMITHY.maxLevel ? null : BPH_SMITHY.classPrice * 2 ** level;
}
/** Null when the wall is at its last tier or the next tier is not unlocked yet. */
export function bphSmithyWallPrice(run: Run): number | null {
  const next = bphWallTier(run) + 1;
  if (!run.bph || next >= BPH_SMITHY.walls.length || next > bphWallTierCap(run.bph.upgrades)) return null;
  return BPH_SMITHY.walls[next].price;
}
function smithy(run: Run): BphSmithyState {
  const battle = run.bph!;
  return battle.smithy ??= { levels: {}, wall: 0 };
}
function pay(run: Run, price: number | null): boolean {
  if (!run.bph || run.phase !== "playing" || price === null || run.gold < price) return false;
  run.gold -= price; run.bph.save.coins = run.gold;
  return true;
}
/** Every run starts on the palisade, sized in spearman hits and raised by the wall-HP upgrades. */
export function startBphPalisade(run: Run, boost: number): void {
  const side = bphWallSideHp(0, boost);
  run.maxWall = side * SIDES.length;
  for (const direction of SIDES) run.walls[direction] = side;
  run.wall = run.maxWall;
}
/** One level for the whole class; standing soldiers re-fit their HP on the next step (rules.ts garrison loop). */
export function buyBphSmithyClass(run: Run, classId: BphClass): boolean {
  if (!pay(run, bphSmithyClassPrice(run, classId))) return false;
  const state = smithy(run);
  state.levels[classId] = (state.levels[classId] ?? 0) + 1;
  return true;
}
/** The next wall tier raises max wall HP; each standing side gains its share, a breached side stays open. */
export function buyBphSmithyWall(run: Run): boolean {
  if (!pay(run, bphSmithyWallPrice(run))) return false;
  const state = smithy(run), from = BPH_SMITHY.walls[state.wall].hits, to = BPH_SMITHY.walls[state.wall + 1].hits;
  const base = run.maxWall / from, gain = base * (to - from) / 4;
  state.wall++;
  run.maxWall = base * to;
  for (const side of SIDES) if (run.walls[side] > 0) run.walls[side] += gain;
  run.wall = SIDES.reduce((sum, side) => sum + run.walls[side], 0);
  return true;
}
/** Wall art per tier (owner DM 1794959357 "이대로 일단 해"): palisade, fieldstone, stone; main.ts loads `wall-<tier>-<shape>-<stage>`. */
export const bphWallTexture = (tier: number, shape: string, stage: number): string =>
  `wall-${Math.min(tier, BPH_SMITHY.walls.length - 1)}-${shape}-${"abcd"[stage]}`;
