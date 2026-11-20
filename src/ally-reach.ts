import { distance, fieldPoint, fortRect, routeDistance, type Point } from "./geometry";
import { riverBank } from "./river";

export type Stall = { id: number; x: number; y: number; since: number; gap?: number; tx?: number; ty?: number };
export type Shun = { id: number; until: number; x: number; y: number; count: number };
type Walker = Point & { stall?: Stall; shun?: Shun[] };

const STALL = { moved: 2, after: .5, first: 2, cap: 8, drift: 12, keep: 4 } as const;

/** True while `enemy` is remembered as a foe this walker stood idle against, until it expires or the foe moves on. */
export function shunned(walker: Walker, enemy: Point & { id: number }, time: number): boolean {
  return !!walker.shun?.some(entry => entry.id === enemy.id && entry.until > time && distance(entry, enemy) < STALL.drift);
}

/** A walker whose blow is ready but who has not moved 2 px in half a second toward a foe he cannot strike yet
 *  remembers that foe for 2 s, doubling per repeat up to 8 s, so target choice passes it over. */
export function noteStall(walker: Walker, target: (Point & { id: number }) | undefined, waiting: boolean, time: number): void {
  if (walker.shun) walker.shun = walker.shun.filter(entry => entry.until + STALL.cap > time);
  if (!target || !waiting) { delete walker.stall; return; }
  const stall = walker.stall;
  if (!stall || stall.id !== target.id || distance(walker, stall) >= STALL.moved) {
    walker.stall = { id: target.id, x: walker.x, y: walker.y, since: time };
    return;
  }
  if (time - stall.since < STALL.after - 1e-6) return;
  remember(walker, target, time);
}

/** The enemy-side twin of noteStall for a walker jostled by a crowd: it counts as blocked when its target stays within
 *  the shun drift (12 px) and the walker, ready to strike, has closed less than 2 px on it over half a second, however
 *  much either is pushed about. */
export function noteBlocked(walker: Walker, target: (Point & { id: number }) | undefined, waiting: boolean, time: number): void {
  if (walker.shun) walker.shun = walker.shun.filter(entry => entry.until + STALL.cap > time);
  if (!target || !waiting) { delete walker.stall; return; }
  const stall = walker.stall, gap = distance(walker, target);
  const restart = () => { walker.stall = { id: target.id, x: walker.x, y: walker.y, since: time, gap, tx: target.x, ty: target.y }; };
  if (!stall || stall.id !== target.id || stall.gap === undefined
    || distance(target, { x: stall.tx ?? target.x, y: stall.ty ?? target.y }) >= STALL.drift) return restart();
  if (time - stall.since < STALL.after - 1e-6) return;
  // Net progress over the whole window, so a crowd's jostling cannot keep restarting it with brief 2 px dips.
  if (stall.gap - gap >= STALL.moved) return restart();
  remember(walker, target, time);
}

function remember(walker: Walker, target: Point & { id: number }, time: number): void {
  const count = (walker.shun?.find(entry => entry.id === target.id)?.count ?? 0) + 1;
  const until = time + Math.min(STALL.cap, STALL.first * 2 ** (count - 1));
  walker.shun = [...(walker.shun ?? []).filter(entry => entry.id !== target.id), { id: target.id, until, x: target.x, y: target.y, count }]
    .slice(-STALL.keep);
  delete walker.stall;
}

export type StandRule = { readonly stop: number; readonly strike: number; readonly margin: number };
export type Stand = { readonly stand: Point; readonly cost: number };

/** Where a ground ally may actually stand: inside the field, outside the wall margin, above the river bank. */
export function legal(level: number, p: Point, margin: number): Point {
  const at = fieldPoint(level, p, margin);
  return { x: at.x, y: Math.min(at.y, riverBank() - 8) };
}

/** The stand point a walker should head for so that its blow can land, or undefined when no legal point is inside
 *  strike reach. Tries the usual approach line first, then the legal point nearest the enemy (the far side of a wall
 *  corner), and keeps the one with the shorter walk round the wall. */
export function standFor(level: number, body: Point, enemy: Point, rule: StandRule): Stand | undefined {
  const gap = Math.max(1, distance(enemy, body));
  const line = gap <= rule.stop ? body
    : { x: enemy.x + (body.x - enemy.x) / gap * rule.stop, y: enemy.y + (body.y - enemy.y) / gap * rule.stop };
  const wall = fortRect(level, rule.margin);
  let best: Stand | undefined;
  for (const raw of [line, enemy]) {
    const stand = legal(level, raw, rule.margin);
    if (distance(stand, enemy) >= rule.strike - .5) continue;
    const cost = routeDistance(wall, body, stand);
    if (!best || cost < best.cost - .01) best = { stand, cost };
  }
  return best;
}
