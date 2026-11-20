import { minibossScale } from "./minibosses";
import type { MinibossSkill } from "./minibosses";

export let WIDTH = 390;
export let HEIGHT = 650;
export const TILE = 32;
export const WALL_RISE = 16;
export const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };
export const FORT_TILES: readonly (readonly [number, number])[] = [[5, 5], [5, 5], [5, 5]];
export const SIDES = ["위", "좌", "우", "아래"] as const;
export type Direction = typeof SIDES[number];
export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; right: number; bottom: number };
export type WeaponSlot = Point & { kind: "arrow" | "hwacha" };
const SPAWN_OUTSIDE = 14;

export function setFieldHeight(height: number): void { HEIGHT = height; CENTER.y = height / 2; }
export function setFieldSize(width: number, height: number): void {
  WIDTH = width; HEIGHT = height; CENTER.x = width / 2; CENTER.y = height / 2;
}

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const enemyBodyScale = (enemy: { readonly goldPouch?: true; readonly miniboss?: MinibossSkill }): number =>
  enemy.goldPouch ? 1.5 : minibossScale(enemy);
/** Ground tile bounds. Wall and gate images are bottom-aligned 32-by-48 tiles. */
export function fortGroundRect(level: number): Rect {
  const [columns, rows] = FORT_TILES[level];
  return { left: CENTER.x - columns * TILE / 2, top: CENTER.y - rows * TILE / 2,
    right: CENTER.x + columns * TILE / 2, bottom: CENTER.y + rows * TILE / 2 };
}
export function fortRect(level: number, margin = 0): Rect {
  const { left, top, right, bottom } = fortGroundRect(level);
  return { left: left - margin, top: top - WALL_RISE - margin, right: right + margin, bottom: bottom + margin };
}
/** Open floor between the projected inner edges of the four drawn wall rows. */
export function visibleCourtyard(level: number): Rect {
  const { left, top, right, bottom } = fortGroundRect(level);
  return { left: left + TILE, top: top + TILE, right: right - TILE, bottom: bottom - TILE - WALL_RISE };
}
export const contains = (rect: Rect, p: Point) => p.x > rect.left && p.x < rect.right && p.y > rect.top && p.y < rect.bottom;
export function pushOut(rect: Rect, p: Point): Point {
  if (!contains(rect, p)) return { x: p.x, y: p.y };
  const gaps = [p.x - rect.left, rect.right - p.x, p.y - rect.top, rect.bottom - p.y], nearest = Math.min(...gaps);
  return nearest === gaps[0] ? { x: rect.left, y: p.y } : nearest === gaps[1] ? { x: rect.right, y: p.y }
    : nearest === gaps[2] ? { x: p.x, y: rect.top } : { x: p.x, y: rect.bottom };
}
export function gapToRect(rect: Rect, p: Point): number {
  return Math.hypot(Math.max(rect.left - p.x, 0, p.x - rect.right), Math.max(rect.top - p.y, 0, p.y - rect.bottom));
}
export function sideOf(rect: Rect, p: Point): Direction {
  const across = (p.x - (rect.left + rect.right) / 2) / (rect.right - rect.left);
  const along = (p.y - (rect.top + rect.bottom) / 2) / (rect.bottom - rect.top);
  return Math.abs(across) > Math.abs(along) ? across < 0 ? "좌" : "우" : along < 0 ? "위" : "아래";
}
/** Liang-Barsky clip of a→b against the rectangle; null when the walk never enters it. */
export function clip(rect: Rect, a: Point, b: Point): [number, number] | null {
  let enter = 0, leave = 1;
  for (const [delta, low, high] of [[b.x - a.x, rect.left - a.x, rect.right - a.x], [b.y - a.y, rect.top - a.y, rect.bottom - a.y]]) {
    if (delta === 0) { if (low > 0 || high < 0) return null; continue; }
    const first = (delta > 0 ? low : high) / delta, second = (delta > 0 ? high : low) / delta;
    enter = Math.max(enter, first); leave = Math.min(leave, second);
    if (enter > leave) return null;
  }
  return [enter, leave];
}
export function crosses(rect: Rect, a: Point, b: Point): boolean {
  const span = clip({ left: rect.left + .01, top: rect.top + .01, right: rect.right - .01, bottom: rect.bottom - .01 }, a, b);
  return span !== null && span[1] > span[0];
}
export function wallPoint(rect: Rect, from: Point, aim: Point = CENTER): Point {
  if (contains(rect, from)) return pushOut(rect, from);
  const span = clip(rect, from, aim);
  if (!span) return pushOut(rect, aim);
  return { x: from.x + (aim.x - from.x) * span[0], y: from.y + (aim.y - from.y) * span[0] };
}
export function edgePoint(side: Direction, along: number): Point {
  if (side === "위") return { x: along * WIDTH, y: -SPAWN_OUTSIDE };
  if (side === "아래") return { x: along * WIDTH, y: HEIGHT + SPAWN_OUTSIDE };
  return { x: side === "좌" ? -SPAWN_OUTSIDE : WIDTH + SPAWN_OUTSIDE, y: along * HEIGHT };
}
export function route(rect: Rect, from: Point, to: Point): Point {
  if (!crosses(rect, from, to)) return to;
  const corners = [{ x: rect.left, y: rect.top }, { x: rect.right, y: rect.top }, { x: rect.right, y: rect.bottom }, { x: rect.left, y: rect.bottom }];
  let best = to, shortest = Infinity;
  for (let first = 0; first < 4; first++) {
    if (distance(from, corners[first]) < .01 || crosses(rect, from, corners[first])) continue;
    for (const turn of [1, 3]) {
      let length = distance(from, corners[first]), corner = first;
      for (let hop = 0; hop < 3 && crosses(rect, corners[corner], to); hop++) {
        const next = (corner + turn) % 4;
        length += distance(corners[corner], corners[next]); corner = next;
      }
      if (crosses(rect, corners[corner], to)) continue;
      length += distance(corners[corner], to);
      if (length < shortest) { shortest = length; best = corners[first]; }
    }
  }
  return best;
}
/** Length of the same corner route used by walkers, rather than a line through the keep. */
export function routeDistance(rect: Rect, from: Point, to: Point): number {
  let at = from, length = 0;
  for (let hop = 0; hop < 5; hop++) {
    const next = route(rect, at, to);
    length += distance(at, next);
    if (next === to) return length;
    at = next;
  }
  return Infinity;
}
/** The classic demo keeps its single south gate; the survival castle has a gate in every wall (owner DM 1794899184.599879). */
export const fortGates = (survival: boolean): readonly Direction[] => survival ? SIDES : ["아래"];
const GATE_HALF = 16;
/** A gate's doorway: the inner end on the courtyard edge and the outer end on the wall's outer edge, on the wall's centre line. */
function doors(level: number, side: Direction, margin: number): { inner: Point; outer: Point } {
  const wall = fortRect(level, margin), court = fortRect(level, -TILE);
  return side === "아래" ? { inner: { x: CENTER.x, y: court.bottom }, outer: { x: CENTER.x, y: wall.bottom } }
    : side === "위" ? { inner: { x: CENTER.x, y: court.top }, outer: { x: CENTER.x, y: wall.top } }
    : side === "좌" ? { inner: { x: court.left, y: CENTER.y }, outer: { x: wall.left, y: CENTER.y } }
    : { inner: { x: court.right, y: CENTER.y }, outer: { x: wall.right, y: CENTER.y } };
}
/** True on a gate's centre line from the courtyard edge outwards, as far as `outerMargin` past the wall (unbounded when undefined). */
export function onGateLine(level: number, side: Direction, p: Point, outerMargin?: number): boolean {
  const court = fortRect(level, -TILE), wall = outerMargin === undefined ? undefined : fortRect(level, outerMargin);
  return side === "아래" ? Math.abs(p.x - CENTER.x) < GATE_HALF && p.y >= court.bottom && (!wall || p.y <= wall.bottom)
    : side === "위" ? Math.abs(p.x - CENTER.x) < GATE_HALF && p.y <= court.top && (!wall || p.y >= wall.top)
    : side === "좌" ? Math.abs(p.y - CENTER.y) < GATE_HALF && p.x <= court.left && (!wall || p.x >= wall.left)
    : Math.abs(p.y - CENTER.y) < GATE_HALF && p.x >= court.right && (!wall || p.x <= wall.right);
}
/** A gate's mouth: the ground just outside its doorway, `depth` deep, as wide as the doorway plus half a body either side. */
const MOUTH_HALF = GATE_HALF + 11;
function inMouth(level: number, side: Direction, p: Point, depth: number): boolean {
  const stone = fortRect(level), along = side === "아래" || side === "위" ? p.x - CENTER.x : p.y - CENTER.y;
  if (Math.abs(along) >= MOUTH_HALF) return false;
  return side === "아래" ? p.y >= stone.bottom && p.y < stone.bottom + depth : side === "위" ? p.y <= stone.top && p.y > stone.top - depth
    : side === "좌" ? p.x <= stone.left && p.x > stone.left - depth : p.x >= stone.right && p.x < stone.right + depth;
}
export const inGateMouth = (level: number, p: Point, sides: readonly Direction[], depth: number): boolean =>
  sides.some(side => inMouth(level, side, p, depth));
/** Moves a point standing in a gate's mouth straight out to `depth` past the wall, so the doorway stays free to walk out of. */
export function clearGateMouth(level: number, p: Point, sides: readonly Direction[], depth: number): Point {
  const side = sides.find(side => inMouth(level, side, p, depth));
  if (!side) return p;
  const out = fortRect(level, depth);
  return side === "아래" ? { x: p.x, y: out.bottom } : side === "위" ? { x: p.x, y: out.top }
    : side === "좌" ? { x: out.left, y: p.y } : { x: out.right, y: p.y };
}
/** The gate whose doorway gives the shortest walk from `from` to `to` (gates in `sides` order on ties). */
export function nearestGate(level: number, from: Point, to: Point, sides: readonly Direction[], margin = 10): Direction {
  if (sides.length === 1) return sides[0];
  const wall = fortRect(level, margin), court = fortRect(level, -TILE), inside = contains(court, from);
  let best = sides[0], shortest = Infinity;
  for (const side of sides) {
    const { inner, outer } = doors(level, side, margin);
    const length = inside ? distance(from, inner) + distance(inner, outer) + routeDistance(wall, outer, to)
      : routeDistance(contains(wall, from) ? fortRect(level) : wall, from, outer) + distance(outer, inner) + distance(inner, to);
    if (length < shortest) { shortest = length; best = side; }
  }
  return best;
}
/** Ground allies cross the stone perimeter only along a gate's centre line, through the nearest of the castle's gates. */
export function allyRoute(level: number, from: Point, to: Point, margin = 10, sides: readonly Direction[] = fortGates(false)): Point {
  const wall = fortRect(level, margin), court = fortRect(level, -TILE);
  const inside = contains(court, from), targetGate = sides.find(side => onGateLine(level, side, to, margin));
  // An intruder standing in the stone band is a target to hit from either side,
  // not a walking destination inside a wall.
  const goal = contains(wall, to) && !contains(court, to) && !targetGate
    ? inside ? { x: Math.max(court.left + 1, Math.min(court.right - 1, to.x)), y: Math.max(court.top + 1, Math.min(court.bottom - 1, to.y)) }
      : pushOut(wall, to) : to;
  const entering = contains(court, goal) || !!targetGate;
  // On a gate's outer door row a walker has left; counting it as still in the gate sent edge walkers back to the door.
  const outerRow = (side: Direction) => { const { outer } = doors(level, side, margin); return side === "아래" || side === "위" ? from.y === outer.y : from.x === outer.x; };
  const standing = sides.find(side => onGateLine(level, side, from, margin) && !outerRow(side));
  if (inside) {
    if (contains(court, goal)) return goal;
    const { inner, outer } = doors(level, targetGate ?? nearestGate(level, from, goal, sides, margin), margin);
    return distance(from, inner) > .01 ? inner : targetGate ? goal : outer;
  }
  if (standing) {
    const { inner, outer } = doors(level, standing, margin);
    return targetGate ? goal : entering ? distance(from, inner) <= .01 ? goal : inner
      : distance(from, outer) <= .01 ? route(wall, from, goal) : outer;
  }
  const block = contains(wall, from) ? fortRect(level) : wall;
  if (!entering) return route(block, from, goal);
  const { inner, outer } = doors(level, targetGate ?? nearestGate(level, from, goal, sides, margin), margin);
  return distance(from, outer) > .01 ? route(block, from, outer) : targetGate ? goal : inner;
}
export function fieldPoint(level: number, p: Point, margin: number): Point {
  const inField = { x: Math.max(18, Math.min(WIDTH - 18, p.x)), y: Math.max(26, Math.min(HEIGHT - 18, p.y)) };
  return pushOut(fortRect(level, margin), inField);
}
export function guardPoint(level: number, side: Direction, gap: number, shift = 0): Point {
  const rect = fortRect(level, gap);
  return side === "위" ? { x: CENTER.x + shift, y: rect.top } : side === "아래" ? { x: CENTER.x + shift, y: rect.bottom }
    : { x: side === "좌" ? rect.left : rect.right, y: CENTER.y + shift };
}
export function weaponSlots(level: number): WeaponSlot[] {
  const rect = fortRect(level, -TILE / 2);
  rect.top += WALL_RISE;
  const slots: WeaponSlot[] = [{ kind: "arrow", x: rect.left, y: rect.top }, { kind: "hwacha", x: rect.right, y: rect.top }];
  if (level >= 1) slots.push({ kind: "arrow", x: rect.right, y: rect.bottom });
  if (level >= 2) slots.push({ kind: "hwacha", x: rect.left, y: rect.bottom });
  return slots;
}

export function wallPosts(level: number): Point[] {
  const rect = fortRect(level, -TILE / 2), posts: Point[] = [];
  rect.top += WALL_RISE;
  for (let x = rect.left + 16; x < rect.right; x += 16) {
    posts.push({ x, y: rect.top });
    if (Math.abs(x - CENTER.x) > 18) posts.push({ x, y: rect.bottom });
  }
  for (let y = rect.top + 16; y < rect.bottom; y += 16) posts.push({ x: rect.left, y }, { x: rect.right, y });
  return posts;
}
