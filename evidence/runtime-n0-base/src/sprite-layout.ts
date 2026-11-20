import { allyRoute, distance, fortRect } from "./geometry";
import type { Point } from "./geometry";
import type { Run } from "./rules";

export type FrameSize = { readonly width: number; readonly height: number };
/** All 41 Imjin unit sheets have two horizontal body cells. */
export const UNIT_FRAME: FrameSize = { width: 32, height: 32 };
/** Direction/pose files in generals/ are individual frames, not horizontal sheets. */
export const BOSS_FRAME: FrameSize = { width: 56, height: 64 };

/** Use the final rendered bounds, after origin, scale, lunge and entry motion. */
export function healthAnchor(bounds: { readonly x: number; readonly y: number; readonly width: number }): Point {
  return { x: bounds.x + bounds.width / 2, y: bounds.y - 8 };
}

export function showEnemyHealth(enemy: { readonly hp: number; readonly maxHp: number; readonly boss: boolean; readonly elite: boolean }): boolean {
  return enemy.hp > 0 && (enemy.boss || enemy.elite || enemy.hp < enemy.maxHp);
}

/** Smooth ordinary walking only. Bosses never reserve space or displace either side.
 * Keep render interpolation separate from damage, targeting, and the simulation clock. */
export function battleLayout(run: Run, previous?: ReadonlyMap<Point, Point>, seconds = 1 / 60): Map<Point, Point> {
  const positions = new Map<Point, Point>();
  if (previous) for (const unit of [...run.enemies, ...run.squads.flatMap(squad => [squad, ...squad.soldiers])]) {
    const target = unit, from = previous.get(unit) ?? unit;
    const ally = run.squads.some(squad => squad === unit || squad.soldiers.some(soldier => soldier === unit));
    const next = ally && unit.kind !== "archer" && unit.kind !== "hwacha" && unit.kind !== "panokseon" ? allyRoute(run.fort, from, target) : target;
    const gap = distance(from, next), speed = unit.kind === "general" ? run.squads.some(squad => squad === unit && squad.state === "charge") ? 420 : 168 : 170;
    const step = Math.min(gap, speed * seconds);
    positions.set(unit, gap > 0 ? { x: from.x + (next.x - from.x) * step / gap, y: from.y + (next.y - from.y) * step / gap } : { x: from.x, y: from.y });
  }
  return positions;
}

/** Reconcile by fighter identity so recruiting never restarts another fighter's animation. */
export function retainRoster<T>(units: readonly { id: number }[], previous: ReadonlyMap<number, T>, create: (index: number) => T): T[] {
  return units.map((unit, index) => previous.get(unit.id) ?? create(index));
}

/** Reserve a whole head display (ring, health and attack bars) as one block. */
export function headLayout(run: Run, positions: ReadonlyMap<Point, Point>): Map<Point, number> {
  const heads = new Map<Point, number>(), occupied: { x: number; y: number }[] = [];
  // Include attack lunges, bobbing and the wall lift, not just other UI blocks.
  const allies = run.squads.flatMap(squad => [squad, ...squad.soldiers]).filter(unit => unit.hp > 0).map(unit => {
    const at = positions.get(unit) ?? unit, leader = unit.kind === "general";
    return { unit, x: at.x, y: at.y - (leader ? 16 : unit.perch !== undefined ? 32 : 0), radius: leader ? 40 : 26 };
  });
  const owners = [
    ...run.enemies.filter(enemy => enemy.hp > 0 && (enemy.boss || enemy.elite)).map(unit => ({ unit, offset: unit.kind === "ukita" ? 78 : 58 })),
    ...run.squads.filter(squad => squad.hp > 0).map(unit => ({ unit, offset: 66 })),
  ];
  for (const { unit, offset } of owners) {
    const at = positions.get(unit) ?? unit;
    let top = at.y - offset;
    while (occupied.some(other => Math.abs(other.x - at.x) < 48 && Math.abs(other.y - top) < 30)
      || allies.some(body => body.unit !== unit && Math.abs(body.x - at.x) < body.radius + 24
        && top < body.y + body.radius + 6 && top + 24 > body.y - body.radius - 6)) top -= 30;
    occupied.push({ x: at.x, y: top }); heads.set(unit, top);
  }
  return heads;
}
