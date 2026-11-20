import type { BphEffect } from "./bph-contract";
import { buildings } from "./fortification";
import type { Point } from "./geometry";

/**
 * The castle's three survival buildings. There is no separate barracks: the central command tent is the barracks
 * (owner DM 1794911971). It keeps the core HP and supplies troops only once the mastery map unlocks barracks
 * production (owner DM 1795153574: no troops from the barracks at the start); the map also unlocks the smithy and the temple.
 */
export type BphCastleBuilding = "barracks" | "smithy" | "temple";
export type BphCastleUnlocks = { readonly production: boolean; readonly smithy: boolean; readonly temple: boolean };
/** The placement of the main tree that unlocks each part; the source building nodes keep their positions. */
export const BPH_CASTLE_UNLOCK_PLACEMENTS = {
  production: "_SkillTreeMain_Demo:25:19",
  smithy: "_SkillTreeMain_Demo:26:19",
  temple: "_SkillTreeMain_Demo:26:20",
} as const satisfies Readonly<Record<keyof BphCastleUnlocks, string>>;

export function bphCastleUnlocks(effects: readonly BphEffect[]): BphCastleUnlocks {
  const bought = new Set(effects.map(effect => effect.targets.placementId ?? effect.nodeId));
  return { production: bought.has(BPH_CASTLE_UNLOCK_PLACEMENTS.production),
    smithy: bought.has(BPH_CASTLE_UNLOCK_PLACEMENTS.smithy), temple: bought.has(BPH_CASTLE_UNLOCK_PLACEMENTS.temple) };
}
/** Temple nodes converted from the source Magic and Tome buildings: each makes revival faster and adds its draws. */
export const BPH_TEMPLE_PLACEMENTS = { magic: "_SkillTreeMain_Demo:20:45", tome: "_SkillTreeMain_Demo:27:4" } as const;
/** Seconds a fallen general lies before rising: never without the temple (owner 1795159499), 20 with it, then each temple node shortens it. */
export const BPH_REVIVE_SECONDS = { none: Infinity, temple: 20, perNode: 5 } as const;
export function bphReviveSeconds(effects: readonly BphEffect[]): number {
  if (!bphCastleUnlocks(effects).temple) return BPH_REVIVE_SECONDS.none;
  const bought = new Set(effects.map(effect => effect.targets.placementId ?? effect.nodeId));
  const nodes = Object.values(BPH_TEMPLE_PLACEMENTS).filter(placement => bought.has(placement)).length;
  return BPH_REVIVE_SECONDS.temple - nodes * BPH_REVIVE_SECONDS.perNode;
}
export function bphCastleStanding(effects: readonly BphEffect[]): Readonly<Record<BphCastleBuilding, boolean>> {
  const unlocks = bphCastleUnlocks(effects);
  return { barracks: unlocks.production, smithy: unlocks.smithy, temple: unlocks.temple };
}
/** The central tent stands 1.5x tall (72 px) from its foot, so its tap circle sits on the canvas, not at its foot. */
export const BPH_TENT_TAP_LIFT = 30;
const REACH: Readonly<Record<BphCastleBuilding, number>> = { barracks: 28, smithy: 20, temple: 22 };
export function bphCastleBuildingAt(effects: readonly BphEffect[], point: Point): BphCastleBuilding | null {
  const places = buildings(), standing = bphCastleStanding(effects);
  const at: Readonly<Record<BphCastleBuilding, Point>> = { barracks: { x: places.barracks.x, y: places.barracks.y - BPH_TENT_TAP_LIFT }, smithy: places.forge, temple: places.infirmary };
  return (["barracks", "smithy", "temple"] as const).find(building =>
    standing[building] && Math.hypot(point.x - at[building].x, point.y - at[building].y) < REACH[building]) ?? null;
}
