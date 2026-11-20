import { CENTER, fortRect, sideOf, SIDES } from "./geometry";
import type { Direction, Point } from "./geometry";

export type Fortification = {
  walls: Record<Direction, number>;
  base: number;
  maxBase: number;
  /** Inert legacy snapshot fields; retained so unpurchased runs serialize identically. */
  palisades: Record<Direction, { hp: number; until: number }>;
  palisadesBought: number;
  wall: number;
  maxWall: number;
  fort: number;
  time: number;
  gold: number;
};
export const KEEP_STAGES = [.75, .5, .25] as const;
export const buildings = () => ({
  // The central command tent is the barracks (owner DM 1794911971): its doorway is the keep's own foot.
  barracks: { x: CENTER.x, y: CENTER.y + 18 },
  infirmary: { x: CENTER.x - 36, y: CENTER.y + 20 },
  forge: { x: CENTER.x + 36, y: CENTER.y + 20 },
  base: { x: CENTER.x, y: CENTER.y + 18 },
});

/** A wall side holds garrison posts while its stone stands. */
export const wallOpen = (fort: Fortification, side: Direction) => fort.walls[side] > 0;
/** A corner tower stands while either of the two walls it joins still stands. */
export const cornerOpen = (fort: Fortification, at: Point) =>
  wallOpen(fort, at.x < CENTER.x ? "좌" : "우") || wallOpen(fort, at.y < CENTER.y ? "위" : "아래");
/** 0 intact, 1 cracked, 2 burning, 3 smoking ruin, 4 collapsed. */
export function keepStage(fort: Fortification): number {
  const share = fort.base / fort.maxBase;
  return share <= 0 ? 4 : KEEP_STAGES.filter(limit => share <= limit).length;
}
/** 0 sound, 1-3 crumbling, 4 breached. */
export function wallStage(fort: Fortification, side: Direction): number {
  const share = fort.walls[side] / (fort.maxWall / 4);
  return share <= 0 ? 4 : share <= .25 ? 3 : share <= .5 ? 2 : share <= .75 ? 1 : 0;
}
export function strikeFort(fort: Fortification, at: Point, damage: number, keepBlow = 1): void {
  const side = sideOf(fortRect(fort.fort), at);
  if (fort.walls[side] > 0) {
    // A rounding crumb left by summed hits is not standing wall: the Nth equal hit on an N-hit side breaks it.
    const left = fort.walls[side] - damage;
    fort.walls[side] = left > 1e-9 ? left : 0;
  } else {
    fort.base = Math.max(0, fort.base - damage * keepBlow);
  }
  fort.wall = SIDES.reduce((sum, direction) => sum + fort.walls[direction], 0);
}
