import { CHAOS_RULES } from "../chaos-contract";
import type { ChaosState } from "../chaos-contract";
import type { Point } from "../geometry";
import { PALETTE } from "../presentation";
import type { Paint } from "../presentation";
import { scatter } from "../skill-show";
import type { ShowChannels } from "../skill-show";
import { POOL } from "../skill-stage";
import type { AmbientShow, FrameContext, MarkTiming, Reach, SkillStage } from "../skill-stage";
import { skillVfx } from "../skill-vfx";
import type { SkillVfx } from "../skill-vfx";

/** The ground grid every stage picture is drawn on, so a ring keeps the same pixel edge as the range marks. */
const CELL = 4;

/** Display-only staging of 황진's stomps, his army's rings and his manual cast's. The rules own every size and time: a stomp's real spot
 *  and radius, the ticks it starts, lands and ends on, CHAOS_RULES' tick rate and how many stand at once. These are only shares of those. */
export const STOMP_RINGS_SHOW = {
  /** Share of a ring's life its front takes to run from the foot onto the real rim; for the rest the rim holds and fades. */
  race: .45,
  /** Shares of the real radius behind the cream lead: the brass-to-copper body and the dusty wake. */
  body: .07, wake: .1,
  /** Shares of the life a crack glows white, gold and ember once the front opens it before it cools to copper; the foot's core and
   *  the white flare when the front lands on the rim. */
  glow: [.08, .22, .4], core: .12, flare: .15,
  /** Short cracks: a few from the foot, and one per `crackSpacing` pixels of rim scattered through the reach (shares of the radius). */
  footCracks: 5, footLength: [.2, .34], crackSpacing: 72, crackFrom: [.3, .8], crackLength: [.1, .2],
  /** Share of the stage's motes one picture's stomps may ask for in a frame, split over those standing; the foot's part of it. */
  motes: 1 / 6, footShare: .35, rimSpacing: 64, gatherSpacing: 44, gatherWait: .3,
  /** The manual cast's stomps get this many more cracks and chips and a stronger wave. */
  bold: 1.5, boldAlpha: 1.15,
  /** Reduced motion keeps only the still real reach at this alpha: nothing in it moves or fades while the stomp stands. */
  still: .6,
} as const;
/** The most chips one stomp may throw: its part of that share when CHAOS_RULES.ring.capacity army rings stand at once. A larger wave of
 *  the manual cast's stomps splits the share further, so a frame's chips stay within it (times `bold`) however many the rules land. */
export const RING_MOTES = Math.floor(POOL.motes * STOMP_RINGS_SHOW.motes / CHAOS_RULES.ring.capacity);

/** How far the front is from the foot at `share` of the ring's life: it bursts out, slows onto the real rim and stays there. */
export function ringFront(share: number, radius: number): number {
  const run = Math.max(0, Math.min(1, share / STOMP_RINGS_SHOW.race));
  return radius * (1 - (1 - run) * (1 - run));
}
/** The share of the ring's life at which the front reaches `distance` from the foot: ringFront read backwards. */
export function ringReaches(distance: number, radius: number): number {
  const share = radius > 0 ? Math.max(0, Math.min(1, distance / radius)) : 1;
  return STOMP_RINGS_SHOW.race * (1 - Math.sqrt(1 - share));
}

export type CrackCell = { readonly x: number; readonly y: number; readonly far: number; readonly at: number };
/** A mote's start, pace in pixels per second and fall; `at` and `life` are shares of the ring's life. */
export type Chip = { readonly x: number; readonly y: number; readonly vx: number; readonly vy: number; readonly pull: number;
  readonly at: number; readonly life: number; readonly paint: Paint; readonly size: number };
export type RingPlan = { readonly cracks: readonly CrackCell[]; readonly chips: readonly Chip[] };
export type GatherMote = { readonly x: number; readonly y: number; readonly wait: number; readonly paint: Paint; readonly size: number };

const ROCK = [PALETTE.sand, PALETTE.sandLight, PALETTE.ochre, PALETTE.copper] as const;
const DUST = [PALETTE.sand, PALETTE.sandLight, PALETTE.cream] as const;
const within = (random: () => number, [low, high]: readonly [number, number]): number => low + random() * (high - low);

/** Where one ring splits the ground and throws chips. Cracks are short chains of 4px ground cells that open as the front passes them
 *  and never leave the real radius; chips fly from the foot at once and dust kicks up along the rim as the front lands. Both end within
 *  the ring's life. With motion off nothing is planned. */
export function planStompRing(ring: { readonly seed: number; readonly x: number; readonly y: number; readonly radius: number;
  readonly motes: number; readonly bold: boolean; readonly still: boolean }): RingPlan {
  if (ring.still || ring.radius <= 0) return { cracks: [], chips: [] };
  const show = STOMP_RINGS_SHOW, random = scatter(ring.seed), more = ring.bold ? show.bold : 1, cells = new Map<string, CrackCell>();
  // A cell's corner is under three pixels from its centre, so a cell this far in lies wholly inside the real radius.
  const inside = Math.max(0, ring.radius - 3);
  const lay = (px: number, py: number): boolean => {
    const x = Math.floor(px / CELL) * CELL, y = Math.floor(py / CELL) * CELL, far = Math.hypot(x + 2 - ring.x, y + 2 - ring.y);
    if (far > inside) return false;
    if (!cells.has(`${x},${y}`)) cells.set(`${x},${y}`, { x, y, far, at: ringReaches(far, ring.radius) });
    return true;
  };
  const crack = (bearing: number, from: number, length: number): void => {
    let turn = bearing, px = ring.x + Math.cos(bearing) * from, py = ring.y + Math.sin(bearing) * from;
    for (let walked = 0; walked < length && lay(px, py); walked += CELL) {
      turn = bearing + Math.max(-.55, Math.min(.55, turn - bearing + (random() - .5) * 1.1));
      px += Math.cos(turn) * CELL; py += Math.sin(turn) * CELL;
    }
  };
  const foot = Math.round(show.footCracks * more), field = Math.round(2 * Math.PI * ring.radius / show.crackSpacing * more);
  for (let index = 0; index < foot; index++)
    crack((index + .2 + random() * .6) / foot * Math.PI * 2, CELL * 1.5, ring.radius * within(random, show.footLength));
  for (let index = 0; index < field; index++)
    crack((index + random()) / field * Math.PI * 2, ring.radius * within(random, show.crackFrom), Math.max(CELL * 2, ring.radius * within(random, show.crackLength)));

  const budget = Math.round(ring.motes * more), thrown = Math.round(budget * show.footShare);
  const kicked = Math.min(budget - thrown, Math.round(2 * Math.PI * ring.radius / show.rimSpacing * more)), chips: Chip[] = [];
  for (let index = 0; index < thrown; index++) {
    const turn = (index + random()) / thrown * Math.PI * 2, pace = 32 + random() * 56, out = Math.min(inside, CELL);
    chips.push({ x: ring.x + Math.cos(turn) * out, y: ring.y + Math.sin(turn) * out * .6, vx: Math.cos(turn) * pace,
      vy: Math.sin(turn) * pace * .5 - (80 + random() * 80), pull: 520, at: 0, life: .55 + random() * .4, paint: ROCK[index % ROCK.length], size: 2 + index % 2 });
  }
  for (let index = 0; index < kicked; index++) {
    const turn = (index + random()) / kicked * Math.PI * 2, far = inside * (.86 + random() * .14), at = ringReaches(far, ring.radius);
    chips.push({ x: ring.x + Math.cos(turn) * far, y: ring.y + Math.sin(turn) * far, vx: Math.cos(turn) * (14 + random() * 24),
      vy: Math.sin(turn) * 10 - (22 + random() * 32), pull: 70, at, life: (1 - at) * (.6 + random() * .4), paint: DUST[index % DUST.length], size: 2 + index % 2 });
  }
  return { cracks: [...cells.values()].sort((a, b) => a.far - b.far), chips };
}

/** Dust that a pending stomp draws in from inside its real reach toward the foot; `wait` is a share of the time until it lands. */
export function planGather(stomp: { readonly seed: number; readonly x: number; readonly y: number; readonly radius: number;
  readonly motes: number; readonly still: boolean }): readonly GatherMote[] {
  if (stomp.still || stomp.radius <= 0) return [];
  const random = scatter(stomp.seed), inside = Math.max(0, stomp.radius - 3);
  const count = Math.min(stomp.motes, Math.round(2 * Math.PI * stomp.radius / STOMP_RINGS_SHOW.gatherSpacing));
  return Array.from({ length: count }, (_, index) => {
    const turn = (index + random()) / count * Math.PI * 2, far = inside * (.7 + random() * .3);
    return { x: stomp.x + Math.cos(turn) * far, y: stomp.y + Math.sin(turn) * far, wait: random() * STOMP_RINGS_SHOW.gatherWait,
      paint: DUST[index % DUST.length], size: 2 + index % 2 };
  });
}

/** A real stomp as its picture reads it: the rules' spot, reach and ticks. It shows from `startedTick`, its foot lands on `landsTick`
 *  and it ends on `untilTick`; an army ring lands as it starts. */
export type Stomp = { readonly id: number; readonly x: number; readonly y: number; readonly radius: number;
  readonly startedTick: number; readonly landsTick: number; readonly untilTick: number };
/** The stomps standing at one moment of a rules clock: its `tick` and the `remainder` of a step, in seconds. */
export type StompScene = { readonly tick: number; readonly remainder: number; readonly stomps: readonly Stomp[] };
type Ground = { fillStyle(paint: Paint, alpha: number): Ground; fillRect(x: number, y: number, width: number, height: number): Ground };
/** What a stomp picture asks of the stage: the ground it paints, a measured reach, the still mark and pooled chips. */
export type StompStage = { readonly ground: Ground } & Pick<SkillStage, "reach" | "mark" | "mote">;

/** 황진's army rings exactly as the rules made them. A run without the army state (N0) has none. */
export function armyStomps(chaos: ChaosState | undefined): StompScene {
  return { tick: chaos?.tick ?? 0, remainder: chaos?.remainder ?? 0, stomps: (chaos?.rings ?? []).map(ring => ({ ...ring, landsTick: ring.startedTick })) };
}
/** With motion off a stomp is one still mark of its real reach: brass while its foot is still to land, copper once it has. Nothing
 *  else depends on the clock, so nothing in it moves or fades. */
function stillMark(stomp: Stomp, clock: number, channels: ShowChannels): MarkTiming {
  return { age: 0, since: -1, alpha: STOMP_RINGS_SHOW.still, channels, rim: clock < stomp.landsTick ? PALETTE.brass : PALETTE.copper };
}

type Cell = Point & { readonly far: number };
type Picture = { readonly reach: Reach; readonly cells: readonly Cell[]; plan?: RingPlan; gathered: boolean };
/** One frame's brush: the stage, the rules' clock in ticks, whether flashes are on, and the look and chip budget of one stomp. */
type Brush = { readonly stage: StompStage; readonly clock: number; readonly bright: boolean; readonly bold: boolean; readonly motes: number; readonly look: Pick<SkillVfx, "alpha" | "heavy"> };
type Tone = { readonly from: number; readonly to: number; readonly paint: Paint; readonly alpha: number };

/** The wave's bands in pixels behind its front: a white-hot edge (cream once it has landed), a cream lead, a brass-to-copper body inked
 *  on its inner side and a dusty wake, all sized from the real radius. With flashes off it keeps its motion in dull tones. */
function waveTones(radius: number, bright: boolean, hot: boolean): readonly Tone[] {
  const body = Math.max(CELL, radius * STOMP_RINGS_SHOW.body), wake = Math.max(CELL, radius * STOMP_RINGS_SHOW.wake), lead = CELL * 1.5;
  return bright
    ? [{ from: -CELL / 2, to: CELL / 2, paint: hot ? PALETTE.white : PALETTE.cream, alpha: .78 }, { from: CELL / 2, to: lead, paint: PALETTE.cream, alpha: .6 },
      { from: lead, to: lead + body / 2, paint: PALETTE.brass, alpha: .48 }, { from: lead + body / 2, to: lead + body, paint: PALETTE.copper, alpha: .44 },
      { from: lead + body, to: lead + body + CELL, paint: PALETTE.dark, alpha: .3 }, { from: lead + body + CELL, to: lead + body + CELL + wake, paint: PALETTE.ochre, alpha: .15 }]
    : [{ from: -CELL / 2, to: CELL, paint: PALETTE.copper, alpha: .5 }, { from: CELL, to: CELL + body, paint: PALETTE.ochre, alpha: .3 },
      { from: CELL + body, to: CELL * 2 + body, paint: PALETTE.dark, alpha: .22 }];
}
function firstCellAtLeast(cells: readonly Cell[], far: number): number {
  let low = 0, high = cells.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (cells[middle].far < far) low = middle + 1; else high = middle;
  }
  return low;
}
function band(ground: Ground, cells: readonly Cell[], near: number, far: number, paint: Paint, alpha: number): void {
  if (alpha <= 0 || far <= near) return;
  ground.fillStyle(paint, alpha);
  for (let index = firstCellAtLeast(cells, near); index < cells.length && cells[index].far < far; index++) ground.fillRect(cells[index].x, cells[index].y, CELL, CELL);
}
const outward = (reach: Reach): Cell[] => [...reach.cells].sort((a, b) => a.far - b.far);

const meet = (reach: Reach): Picture => ({ reach, cells: outward(reach), gathered: false });

/** A stomp whose foot is still to land: its real reach marches round in brass while dust is drawn in from the rim and the foot glows. */
function gather({ stage, clock, motes }: Brush, picture: Picture, stomp: Stomp): void {
  const drawn = Math.max(0, Math.min(1, (clock - stomp.startedTick) / (stomp.landsTick - stomp.startedTick)));
  if (!picture.gathered) {
    picture.gathered = true;
    const msUntilItLands = (stomp.landsTick - clock) * 1000 / CHAOS_RULES.simulationHz;
    for (const mote of planGather({ seed: Math.imul(stomp.id, 0x2c1b3c6d), x: stomp.x, y: stomp.y, radius: stomp.radius, motes, still: false })) {
      const life = (1 - mote.wait) * msUntilItLands, far = Math.hypot(mote.x - stomp.x, mote.y - stomp.y) || 1, pace = Math.max(0, far - CELL * 2) / far * 1000 / life;
      stage.mote(mote, (stomp.x - mote.x) * pace, (stomp.y - mote.y) * pace, 0, life, mote.paint, false, mote.wait * msUntilItLands, mote.size);
    }
  }
  const ground = stage.ground, phase = Math.floor(clock / 2), inward = stomp.radius * (1 - drawn * drawn);
  ground.fillStyle(PALETTE.brass, .22 + .3 * drawn);
  picture.reach.rim.forEach((spot, index) => { if (Math.floor((index + phase) / 3) % 2 === 0) ground.fillRect(spot.x, spot.y, CELL, CELL); });
  band(ground, picture.cells, inward - CELL * .6, inward + CELL * .6, PALETTE.sandLight, .45);
  band(ground, picture.cells, 0, CELL * 2, PALETTE.copper, .15 + .45 * drawn);
}

/** A landed stomp: its ring races out from the foot to the real radius in cream and copper, splits the ground in short glowing cracks,
 *  throws its chips once and fades within its own life. */
function ring({ stage, clock, bright, bold, motes, look }: Brush, picture: Picture, stomp: Stomp): void {
  const show = STOMP_RINGS_SHOW, life = Math.max(1, stomp.untilTick - stomp.landsTick), lifeMs = life * 1000 / CHAOS_RULES.simulationHz;
  const share = Math.max(0, Math.min(1, (clock - stomp.landsTick) / life));
  let plan = picture.plan;
  if (!plan) {
    plan = picture.plan = planStompRing({ seed: Math.imul(stomp.id, 0x9e3779b1) ^ 0x1593, x: stomp.x, y: stomp.y, radius: stomp.radius, motes, bold, still: false });
    throwChips(stage, plan.chips, share, lifeMs);
  }
  const ground = stage.ground, { cells, reach } = picture, front = ringFront(share, reach.radius);
  const settled = Math.max(0, share - show.race) / (1 - show.race), fade = 1 - settled * settled;
  const strength = fade * (1 - .25 * Math.min(1, share / show.race)) * (bold ? show.boldAlpha : 1) * look.alpha;
  for (const tone of waveTones(reach.radius, bright, share < show.race + show.flare)) band(ground, cells, front - tone.to, front - tone.from, tone.paint, tone.alpha * strength);
  const landed = share - show.race;
  if (bright && look.heavy && landed >= 0 && landed < show.flare) {
    ground.fillStyle(PALETTE.white, .55 * (1 - landed / show.flare) * look.alpha);
    for (const spot of reach.rim) ground.fillRect(spot.x, spot.y, CELL, CELL);
  }
  band(ground, cells, 0, CELL * 2, PALETTE.dark, .4 * fade * look.alpha);
  if (share < show.core) band(ground, cells, 0, CELL * 2, bright ? PALETTE.white : PALETTE.copper, (bright ? .75 : .4) * (1 - share / show.core) * look.alpha);
  if (look.heavy) crack(ground, plan.cracks, share, fade * look.alpha, bright);
}

function crack(ground: Ground, cracks: readonly CrackCell[], share: number, fade: number, bright: boolean): void {
  const open = cracks.filter(cell => cell.at <= share), heats: readonly Paint[] = bright ? [PALETTE.white, PALETTE.gold, PALETTE.ember] : [PALETTE.copper];
  if (!open.length || fade <= 0) return;
  ground.fillStyle(PALETTE.dark, .45 * fade);
  for (const cell of open) ground.fillRect(cell.x - 1, cell.y - 1, CELL + 2, CELL + 2);
  for (const cell of open) {
    const heat = STOMP_RINGS_SHOW.glow.findIndex(until => share - cell.at < until);
    ground.fillStyle(heats[heat] ?? PALETTE.copper, .72 * fade).fillRect(cell.x, cell.y, CELL, CELL);
  }
}

/** Chips leave the foot at once and rim dust waits for the front; a ring met late throws only what is still to come, cut to its life. */
function throwChips(stage: StompStage, chips: readonly Chip[], share: number, lifeMs: number): void {
  for (const chip of chips) {
    const left = chip.at + chip.life - Math.max(share, chip.at);
    if (left <= 0) continue;
    stage.mote(chip, chip.vx, chip.vy, chip.pull, left * lifeMs, chip.paint, false, Math.max(0, chip.at - share) * lifeMs, chip.size);
  }
}

/** 황진's stomps as small ground-cracking shockwaves, one picture for each real stomp the rules hold; with motion off each is one still
 *  mark. Everything sits on the ground under the danger marks; only brief chips fly over the bodies. */
export class StompPictures {
  private pictures = new Map<number, Picture>();
  private seen?: { readonly tick: number; readonly remainder: number; readonly at: number };

  /** `bold` stomps, the manual cast's, get more cracks and chips and a stronger wave. */
  constructor(private readonly look: { readonly bold: boolean }) {}

  draw(stage: StompStage, scene: StompScene, { now, channels, run }: Pick<FrameContext, "now" | "channels"> & Partial<Pick<FrameContext, "run">>): void {
    if (!scene.stomps.length) { this.clear(); return; }
    const look = run ? skillVfx(run, run.squads.find(squad => squad.general === "황진")) : { alpha: 1, heavy: true };
    const brush: Brush = { stage, clock: this.clock(scene, now), bright: channels.flash, bold: this.look.bold,
      motes: Math.min(RING_MOTES, Math.floor(POOL.motes * STOMP_RINGS_SHOW.motes / scene.stomps.length)), look };
    const pictures = new Map<number, Picture>();
    for (const stomp of scene.stomps) {
      const picture = this.pictures.get(stomp.id) ?? meet(stage.reach(stomp.x, stomp.y, stomp.radius));
      pictures.set(stomp.id, picture);
      if (!channels.motion) stage.mark(picture.reach, stillMark(stomp, brush.clock, channels));
      else if (brush.clock < stomp.landsTick) gather(brush, picture, stomp);
      else ring(brush, picture, stomp);
    }
    this.pictures = pictures;
  }

  clear(): void { this.pictures.clear(); this.seen = undefined; }

  /** The rules' tick, run on between simulation steps by the display clock but never more than one step ahead of the rules. */
  private clock(scene: StompScene, now: number): number {
    const last = this.seen, seen = last && last.tick === scene.tick && last.remainder === scene.remainder ? last : { tick: scene.tick, remainder: scene.remainder, at: now };
    this.seen = seen;
    return scene.tick + Math.min(1, (scene.remainder + (now - seen.at) / 1000) * CHAOS_RULES.simulationHz);
  }
}

const armyRings = new StompPictures({ bold: false });
/** 황진's army stomps, drawn every frame from the rings the rules hold in run.chaos. */
export const ambient: AmbientShow = { id: "stomp-rings", general: "황진", update: (stage, frame) => armyRings.draw(stage, armyStomps(frame.run.chaos), frame), clear: () => armyRings.clear() };
