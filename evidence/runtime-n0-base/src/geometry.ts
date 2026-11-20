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
export function fortRect(level: number, margin = 0): Rect {
  const [columns, rows] = FORT_TILES[level];
  return { left: CENTER.x - columns * TILE / 2 - margin, top: CENTER.y - rows * TILE / 2 - WALL_RISE - margin,
    right: CENTER.x + columns * TILE / 2 + margin, bottom: CENTER.y + rows * TILE / 2 + margin };
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
function clip(rect: Rect, a: Point, b: Point): [number, number] | null {
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
/** Ground allies cross the stone perimeter only along the south gate's centre line. */
export function allyRoute(level: number, from: Point, to: Point, margin = 10): Point {
  const wall = fortRect(level, margin), court = fortRect(level, -TILE);
  const innerDoor = { x: CENTER.x, y: court.bottom }, outerDoor = { x: CENTER.x, y: wall.bottom };
  const inside = contains(court, from), gateTarget = Math.abs(to.x - CENTER.x) < 16 && to.y >= court.bottom && to.y <= wall.bottom;
  // An intruder standing in the stone band is a target to hit from either side,
  // not a walking destination inside a wall.
  const goal = contains(wall, to) && !contains(court, to) && !gateTarget
    ? inside ? { x: Math.max(court.left + 1, Math.min(court.right - 1, to.x)), y: Math.max(court.top + 1, Math.min(court.bottom - 1, to.y)) }
      : pushOut(wall, to) : to;
  const entering = contains(court, goal) || gateTarget;
  const inGate = Math.abs(from.x - CENTER.x) < 16 && from.y >= court.bottom && from.y <= wall.bottom;
  if (inside) return contains(court, goal) ? goal : distance(from, innerDoor) > .01 ? innerDoor : gateTarget ? goal : outerDoor;
  if (inGate) return gateTarget ? goal : entering ? distance(from, innerDoor) <= .01 ? goal : innerDoor
    : distance(from, outerDoor) <= .01 ? route(wall, from, goal) : outerDoor;
  const block = contains(wall, from) ? fortRect(level) : wall;
  return entering ? distance(from, outerDoor) > .01 ? route(block, from, outerDoor) : gateTarget ? goal : innerDoor : route(block, from, goal);
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
