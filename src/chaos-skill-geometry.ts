import { CENTER, HEIGHT, WIDTH, contains, distance, fieldPoint, fortRect, gapToRect, sideOf, SIDES } from "./geometry";
import type { Point } from "./geometry";
import type { Run } from "./rules";
import { CHAOS_RULES, chaosSkillBand } from "./chaos-contract";
import { riverBank } from "./river";

/** Sample complete lanes on dry ground beside the fort, without shortening the caster's reach at a wall. */
export function cloneSweeps(run: Run, castId: number, count: number, length: number): { from: Point; to: Point }[] {
  const wall = fortRect(run.fort, 12);
  const left = 18, right = WIDTH - 18, top = 26, bottom = riverBank() - 8;
  const strips = [
    { left, right, top, bottom: wall.top }, { left, right, top: wall.bottom, bottom },
    { left, right: wall.left, top, bottom }, { left: wall.right, right, top, bottom },
  ];
  const lanes = strips.filter(strip => strip.right > strip.left && strip.bottom > strip.top).flatMap(strip => {
    const diagonal = Math.atan2(strip.bottom - strip.top, strip.right - strip.left);
    return [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, diagonal, Math.PI - diagonal].map(angle => {
    const dx = length * Math.cos(angle), dy = length * Math.sin(angle);
    return { dx, dy, left: strip.left - Math.min(dx, 0), right: strip.right - Math.max(dx, 0),
      top: strip.top - Math.min(dy, 0), bottom: strip.bottom - Math.max(dy, 0) };
    }).filter(lane => lane.right >= lane.left && lane.bottom >= lane.top);
  });
  // A cast-local stream keeps combat/spawn RNG untouched and reproduces each replay.
  let seed = (run.seed ^ Math.imul(castId, 0x9e3779b1)) || 1;
  const roll = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 0x100000000;
  };
  return Array.from({ length: count }, () => {
    // On a narrow viewport the body can reach across a gate farther than any exterior strip.
    const lane = lanes[Math.floor(roll() * lanes.length)] ?? { left, right, top, bottom: wall.top, dx: 0, dy: length };
    const from = { x: lane.left + roll() * (lane.right - lane.left), y: lane.top + roll() * (lane.bottom - lane.top) };
    const to = { x: from.x + lane.dx, y: from.y + lane.dy };
    // Face the castle along the sampled lane: inbound enemies funnel that way even before a wave arrives.
    return lanes.length && distance(from, CENTER) < distance(to, CENTER) ? { from: to, to: from } : { from, to };
  });
}

export type SkillArea = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
/** The land a cast covers: the whole field for an infinite reach, else the box of half-size reach around the caster. */
export function skillArea(at: Point, reach: number): SkillArea {
  const top = CHAOS_RULES.skills.margin, bottom = riverBank();
  if (!Number.isFinite(reach)) return { left: 0, top, right: WIDTH, bottom };
  return { left: Math.max(0, at.x - reach), top: Math.max(top, Math.min(bottom - 1, at.y - reach)),
    right: Math.min(WIDTH, at.x + reach), bottom: Math.min(bottom, Math.max(top + 1, at.y + reach)) };
}
const FIELD = (): SkillArea => skillArea(CENTER, Infinity);
const inside = (area: SkillArea, at: Point) => at.x >= area.left && at.x <= area.right && at.y >= area.top && at.y <= area.bottom;

/** Each grid cell is a real battlefield region (of the cast's area), with stable ID ties and no RNG. */
export function skillLocations(run: Run, count: number, wave: number, target: boolean, area: SkillArea = FIELD()): Point[] {
  const { columns, rows } = CHAOS_RULES.skills;
  const width = (area.right - area.left) / columns, height = (area.bottom - area.top) / rows;
  const cells = columns * rows;
  return Array.from({ length: count }, (_, index) => {
    const cell = (Math.floor(index * cells / count) + wave) % cells;
    const col = cell % columns, row = Math.floor(cell / columns);
    const at = { x: area.left + (col + .5) * width, y: area.top + (row + .5) * height };
    const enemy = target ? run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship"
      && Math.floor((enemy.x - area.left) / width) === col
      && Math.floor((enemy.y - area.top) / height) === row)
      .sort((a, b) => distance(a, at) - distance(b, at) || a.id - b.id)[0] : undefined;
    return enemy ? { x: enemy.x, y: enemy.y } : fieldPoint(run.fort, at, 12);
  });
}

export function cannonOrigin(run: Run, target: Point, index: number, count: number): Point {
  const wall = fortRect(run.fort);
  const along = (index + .5) / count;
  switch (sideOf(wall, target)) {
    case "위": return { x: wall.left + along * (wall.right - wall.left), y: wall.top };
    case "아래": return { x: wall.left + along * (wall.right - wall.left), y: wall.bottom };
    case "좌": return { x: wall.left, y: wall.top + along * (wall.bottom - wall.top) };
    case "우": return { x: wall.right, y: wall.top + along * (wall.bottom - wall.top) };
  }
}

/** The blast radius of the commander's current band clusters the targets one blast apart. */
function cannonRadius(run: Run): number {
  return CHAOS_RULES.skills.cannon.radius[chaosSkillBand(run.chaos?.level ?? 0)];
}

/** A passive volley's targets per wall side: each side's nearest threats within the guns' reach (casting foes first, then
 *  ladders, bosses, then the nearest, spaced a blast radius apart, as cannonTargets clusters them). A side with none stands
 *  silent — its guns hold their fire, so the battery a player sees is the battery that shoots. */
export function passiveSideTargets(run: Run, per: number): readonly (readonly Point[])[] {
  const wall = fortRect(run.fort), radius = cannonRadius(run);
  const passiveReach = CHAOS_RULES.skills.cannon.passiveReach[chaosSkillBand(run.chaos?.level ?? 0)];
  const priority = (enemy: Run["enemies"][number]) => enemy.casting ? 3 : enemy.ladder ? 2 : enemy.boss ? 1 : 0;
  return SIDES.map(side => {
    const foes = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship" && !contains(wall, enemy)
      && sideOf(wall, enemy) === side && gapToRect(wall, enemy) <= passiveReach)
      .sort((a, b) => priority(b) - priority(a) || gapToRect(wall, a) - gapToRect(wall, b) || a.id - b.id);
    const centers: Point[] = [];
    for (const foe of foes) {
      if (centers.every(at => distance(at, foe) > radius)) centers.push(foe);
      if (centers.length >= per) break;
    }
    return centers;
  });
}

/** Intercept casters and approaching ladders, spreading ports over distinct live clusters. Foes already inside a breached wall
 *  are targets too (gap 0, so they come first) and are shelled where they stand, not at the field point outside the wall:
 *  left out, a barrage cast after a breach fell on empty ground. */
export function cannonTargets(run: Run, fallback: readonly Point[], area: SkillArea = FIELD()): Point[] {
  const wall = fortRect(run.fort), radius = cannonRadius(run);
  const priority = (enemy: Run["enemies"][number]) => enemy.casting ? 3 : enemy.ladder ? 2 : enemy.boss ? 1 : 0;
  const enemies = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship" && inside(area, enemy))
    .sort((a, b) => priority(b) - priority(a) || gapToRect(wall, a) - gapToRect(wall, b) || a.id - b.id);
  const chosen: Point[] = [];
  for (const enemy of enemies) {
    if (chosen.every(at => distance(at, enemy) > radius))
      chosen.push(contains(wall, enemy) ? { x: enemy.x, y: enemy.y } : fieldPoint(run.fort, enemy, 12));
    if (chosen.length === fallback.length) break;
  }
  return fallback.map((at, index) => chosen.length ? chosen[index % chosen.length] : at);
}

/** Reserve distinct real spawn positions for waves whose visible lifetimes overlap. */
export function militiaSpawn(run: Run, input: {
  readonly at: Point; readonly ordinal: number; readonly count: number; readonly wave: number;
  readonly startedTick: number; readonly untilTick: number; readonly area?: SkillArea;
}): Point {
  const { columns, rows, militia } = CHAOS_RULES.skills, area = input.area ?? FIELD();
  const cells = columns * rows, width = (area.right - area.left) / columns, height = (area.bottom - area.top) / rows;
  const cell = (Math.floor(input.ordinal * cells / input.count) + input.wave) % cells;
  const left = area.left + cell % columns * width, top = area.top + Math.floor(cell / columns) * height;
  const across = Math.max(1, Math.floor(width / militia.spacing)), down = Math.max(1, Math.floor(height / militia.spacing));
  const candidates = Array.from({ length: across * down }, (_, index) => {
    const at = fieldPoint(run.fort, {
      x: left + (index % across + .5) * width / across,
      y: top + (Math.floor(index / across) + .5) * height / down,
    }, 12);
    return { x: at.x, y: Math.min(at.y, riverBank() - 8) };
  }).sort((a, b) => distance(a, input.at) - distance(b, input.at) || a.y - b.y || a.x - b.x);
  const occupied = (run.chaosSkills?.events ?? []).filter(event => event.kind === "militia"
    && event.startedTick < input.untilTick && input.startedTick < event.untilTick);
  const offset = Math.floor(input.wave / (cells / input.count)) % candidates.length;
  for (let index = 0; index < candidates.length; index++) {
    const at = candidates[(index + offset) % candidates.length];
    if (occupied.every(event => distance(event.from, at) + 1e-9 >= militia.spacing)) return at;
  }
  // Projection can exhaust a small region; remain on legal ground if no spaced slot exists.
  return candidates[offset];
}

/** Ship passes below Lv20 sail through the densest band of land enemies across their own heading (rows for the sideways
 *  passes, columns for the up-and-down ones; nearer the general on ties), one ship width apart, wherever on the field they
 *  stand: the band scales how many ships sail and how hard they hit, never strands them in empty water inside his box. */
export function shipTargets(run: Run, from: Point, fallback: readonly Point[], wave: number): Point[] {
  const width = CHAOS_RULES.skills.ships.width;
  const land = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship");
  const ranked = (across: (at: Point) => number) => land.map(enemy => ({ enemy,
    density: land.filter(other => Math.abs(across(other) - across(enemy)) <= width / 2).length }))
    .sort((a, b) => b.density - a.density || distance(a.enemy, from) - distance(b.enemy, from) || a.enemy.id - b.enemy.id)
    .map(entry => entry.enemy);
  const rows = ranked(at => at.y), columns = ranked(at => at.x), used: Point[][] = [[], []];
  return fallback.map((at, ordinal) => {
    const sideways = (ordinal + wave) % 4 < 2, across = sideways ? (p: Point) => p.y : (p: Point) => p.x;
    const lanes = sideways ? rows : columns, taken = used[sideways ? 0 : 1];
    const pick = lanes.find(enemy => taken.every(lane => Math.abs(across(lane) - across(enemy)) >= width))
      ?? lanes[taken.length % Math.max(1, lanes.length)];
    if (!pick) return at;
    taken.push(pick);
    return { x: pick.x, y: pick.y };
  });
}

/** A pass crosses the whole field through `at`. */
export function shipRoute(at: Point, ordinal: number): { from: Point; to: Point } {
  const edge = CHAOS_RULES.skills.ships.edge;
  const left = -edge, right = WIDTH + edge, top = -edge, bottom = HEIGHT + edge;
  switch (ordinal % 4) {
    case 0: return { from: { x: left, y: at.y }, to: { x: right, y: at.y } };
    case 1: return { from: { x: right, y: at.y }, to: { x: left, y: at.y } };
    case 2: return { from: { x: at.x, y: top }, to: { x: at.x, y: bottom } };
    default: return { from: { x: at.x, y: bottom }, to: { x: at.x, y: top } };
  }
}

export function segmentGap(at: Point, from: Point, to: Point): number {
  const dx = to.x - from.x, dy = to.y - from.y;
  const t = Math.max(0, Math.min(1, ((at.x - from.x) * dx + (at.y - from.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(at.x - from.x - dx * t, at.y - from.y - dy * t);
}

export function screenRadius(from: Point = CENTER): number {
  return Math.max(...[{ x: 0, y: 0 }, { x: WIDTH, y: 0 }, { x: 0, y: HEIGHT }, { x: WIDTH, y: HEIGHT }]
    .map(at => distance(from, at)));
}
