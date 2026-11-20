import type Phaser from "phaser";
import { CHAOS_RULES } from "../chaos-contract";
import type { ChaosSkillEvent } from "../chaos-contract";
import type { Point } from "../geometry";
import { PALETTE } from "../presentation";
import type { Paint } from "../presentation";
import type { General } from "../roster";
import { scatter } from "../skill-show";
import { POOL } from "../skill-stage";
import type { CastContext, FrameContext, Reach, SkillShow, SkillStage } from "../skill-stage";
import { skillVfx } from "../skill-vfx";
import type { SkillVfx } from "../skill-vfx";

export const DONGNAE_GENERAL: General = "송상현";
/** The ground grid every stage picture is drawn on, and the 2px chip a bolt's core is one of. */
const CELL = 4, CHIP = 2;
/** Display-only staging of 송상현's thunderstorm. The rules own every place, size, count and time: each strike's origin and strike
 *  point, its radius, its startedTick, impactTick and untilTick, and how many strikes and waves a level casts. These are only
 *  shares of those, and alphas. */
const STORM = {
  /** How far a channel may wander off the straight drop, as a share of the real radius, and how many rows it holds one heading. */
  sway: .2, leg: [2, 5],
  /** One fork for every this many radii of real bolt length; each leaves the channel between these shares of the way down and
   *  runs for this share of the radius. */
  forkEvery: 1.5, forkFrom: [.2, .8], forkLength: [.25, .5],
  /** While the leader comes down, the reach's rim brightens between these alphas and this many rows at its tip burn bright. */
  gather: [.15, .5], tip: 3,
  /** Share of the afterglow the impact ring takes to run from the strike point onto the real rim; then it holds there and fades. */
  race: .45,
  /** The white flash at the strike point, as a share of the real radius. */
  foot: .2,
  /** Share of the stage's motes that all strikes alive at once may throw as sparks. */
  motes: 1 / 3,
  /** How much of the dusk a burning stroke lifts, and the thunderclap's shake when the rules' largest wave lands. */
  lift: .4, rumble: .012,
  /** Reduced motion: the still rim's and the still column's alpha. */
  still: { rim: .6, column: .7 },
} as const;
/** The return stroke through the afterglow, as [until this share, core alpha, halo alpha]: white-hot, a dark blink, a second flash,
 *  then a cooling afterimage. Stepped like every stage picture, never a smooth fade. */
const STROKE = [[.14, 1, .6], [.2, 0, 0], [.34, .85, .35], [.52, .5, 0], [.7, .25, 0]] as const;
/** How long the stroke first burns white: the strike point flashes and the dusk lifts for this share of the afterglow. */
const BURN = STROKE[0][0];
/** The impact ring's bands from its front inward, one cell each: the lead, then a wake that thins out as the front runs and is
 *  gone when it lands, so only the rim is left on the real radius. With flashes off it runs in dull tones. */
const RING: readonly (readonly [Paint, number])[] = [[PALETTE.cream, .75], [PALETTE.gold, .55], [PALETTE.brass, .35]];
const CALM_RING: readonly (readonly [Paint, number])[] = [[PALETTE.brass, .5], [PALETTE.ochre, .3]];
const SPARKS: readonly Paint[] = [PALETTE.white, PALETTE.gold, PALETTE.cream], CALM_SPARKS: readonly Paint[] = [PALETTE.gold, PALETTE.cream, PALETTE.brass];

/** One row of a lightning channel in field pixels; `along` is how far down the bolt it ends, from 0 at the rules' origin to 1 at
 *  the strike point. */
type Slice = { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly along: number };
export type Bolt = { readonly channel: readonly Slice[]; readonly forks: readonly Slice[] };
type Strike = { readonly reach: Reach; readonly cells: Reach["cells"]; readonly bolt: Bolt; readonly vfx: SkillVfx; struck: boolean };

/** One strike's lightning, decided once from the rules' event and the same for its id every time: a channel of pixel rows from the
 *  rules' origin on the field's top edge down to the strike point, zigzagging no farther off the straight drop than a share of the
 *  real radius and pinned to both real ends, and short forks that leave it on the way down. */
export function planBolt({ id, from, to, radius }: Pick<ChaosSkillEvent, "id" | "from" | "to" | "radius">, vfx?: SkillVfx): Bolt {
  const random = scatter(Math.imul(id, 0x9e3779b1) ^ 0x1593), drop = to.y - from.y, rows = Math.max(1, Math.ceil(Math.abs(drop) / CELL));
  const sway = radius * STORM.sway, pin = Math.max(1, Math.round(sway / CELL)), nodes: Point[] = [];
  let offset = 0, heading = 0, held = 0;
  for (let row = 0; row <= rows; row++) {
    if (held === 0) {
      heading = (heading > 0 || heading === 0 && random() < .5 ? -1 : 1) * (1 + Math.floor(random() * 2)) * CHIP;
      held = STORM.leg[0] + Math.floor(random() * (STORM.leg[1] - STORM.leg[0] + 1));
    }
    held--;
    if (Math.abs(offset + heading) > sway) heading = -heading;
    offset += heading;
    const share = row / rows, pinned = Math.min(1, row / pin, (rows - row) / pin);
    nodes.push({ x: Math.round(from.x + (to.x - from.x) * share + offset * pinned), y: Math.round(from.y + drop * share) });
  }
  const width = CHIP;
  const slice = (a: Point, b: Point, along: number): Slice =>
    ({ x: Math.min(a.x, b.x) - width / 2, y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x) + width, height: Math.abs(b.y - a.y), along });
  const forks: Slice[] = [], count = Math.round(Math.abs(drop) / Math.max(CELL, radius * STORM.forkEvery) * (vfx?.density ?? 1));
  for (let fork = 0; fork < count; fork++) {
    const start = Math.floor(rows * (STORM.forkFrom[0] + (fork + random()) / count * (STORM.forkFrom[1] - STORM.forkFrom[0])));
    const length = Math.round(radius * (STORM.forkLength[0] + random() * (STORM.forkLength[1] - STORM.forkLength[0])) / CELL), side = random() < .5 ? -1 : 1;
    let at = nodes[start];
    for (let row = start + 1; row <= Math.min(rows, start + length); row++) {
      const next = { x: at.x + side * (1 + Math.floor(random() * 2)) * CHIP, y: nodes[row].y };
      forks.push(slice(at, next, row / rows));
      at = next;
    }
  }
  return { channel: nodes.slice(1).map((node, row) => slice(nodes[row], node, (row + 1) / rows)), forks };
}
const fill = (layer: Phaser.GameObjects.Graphics, { x, y, width, height }: Slice): void => { layer.fillRect(x, y, width, height); };

/** 송상현's thunderstorm, drawn from the strikes the rules keep in run.chaosSkills and from nothing else, so a wave is drawn whether
 *  or not a cast started its picture. Each strike's leader comes down from the rules' origin during the rules' flight while its real
 *  reach gathers on the ground; on the impact tick the stroke burns white from the top edge to the strike point, blinks and cools,
 *  sparks fly, and a gold ring runs out onto the real radius and fades by untilTick. Dusk holds while strikes are still to come.
 *  Nothing is left standing on the field. With motion off each strike is one still rim and column for its whole life. */
class DongnaeShow implements SkillShow {
  readonly general = DONGNAE_GENERAL;
  readonly accent = PALETTE.silverLight;
  private strikes = new Map<number, Strike>();
  /** The last cast's particle headroom; a storm met without a cast keeps the stage's full share. */
  private density = 1;

  cast(_stage: SkillStage, { density }: CastContext): void { this.density = density; }

  update(stage: SkillStage, { run, channels }: FrameContext): void {
    const state = run.chaosSkills, events = state?.events.filter(event => event.kind === "thunder") ?? [];
    if (!state || !events.length) { this.strikes.clear(); return; }
    // The rules' 30Hz tick, run on by the share of the next one already under way: never more than one tick ahead of the rules.
    const clock = state.tick + Math.min(1, Math.max(0, state.remainder) * CHAOS_RULES.simulationHz);
    const coming = events.some(event => clock < event.impactTick), bright = channels.flash, strikes = new Map<number, Strike>();
    let dusk = 0, burning = false, landed = 0;
    for (const event of events) {
      if (clock < event.startedTick || clock >= event.untilTick) continue;
      const strike = this.strikes.get(event.id) ?? this.meet(stage, event, skillVfx(run, run.squads.find(squad => squad.id === event.squad)));
      strikes.set(event.id, strike);
      if (!channels.motion) { this.still(stage, strike); continue; }
      if (clock < event.impactTick) {
        const flight = (clock - event.startedTick) / (event.impactTick - event.startedTick);
        this.leader(stage, strike, flight, bright);
        // The sky darkens with the first wave's leaders and stays dark for every later wave.
        dusk = Math.max(dusk, event.wave > 0 ? 1 : flight);
        continue;
      }
      const glow = (clock - event.impactTick) / (event.untilTick - event.impactTick);
      if (!strike.struck) { strike.struck = true; landed++; this.sparks(stage, event, clock, bright); }
      strikeRing(stage, strike.reach, strike.cells, glow, bright, strike.vfx);
      strokeBolt(stage, strike.bolt, glow, bright, strike.vfx);
      dusk = Math.max(dusk, coming ? 1 : 1 - glow * glow);
      burning ||= glow < BURN;
    }
    this.strikes = strikes;
    if (dusk > 0) stage.veil(dusk * (bright && burning ? 1 - STORM.lift : 1), channels);
    if (landed) stage.shake(STORM.rumble * Math.min(1, landed / Math.max(...CHAOS_RULES.skills.thunder.count)));
  }

  clear(): void { this.strikes.clear(); this.density = 1; }

  private meet(stage: SkillStage, event: ChaosSkillEvent, vfx: SkillVfx): Strike {
    const reach = stage.reach(event.to.x, event.to.y, event.radius);
    return { reach, cells: [...reach.cells].sort((a, b) => a.far - b.far), bolt: planBolt(event, vfx), vfx, struck: false };
  }

  /** Reduced motion: the real reach's rim and the bolt's column, the same every frame of the strike's life. */
  private still({ ground, trails }: SkillStage, { reach, bolt, vfx }: Strike): void {
    ground.fillStyle(PALETTE.gold, STORM.still.rim * vfx.alpha);
    for (const spot of reach.rim) ground.fillRect(spot.x, spot.y, CELL, CELL);
    trails.fillStyle(PALETTE.silver, STORM.still.column * vfx.alpha);
    for (const slice of bolt.channel) fill(trails, slice);
  }

  /** Before the impact: every other cell of the real rim brightens while the leader comes down the channel at the rules' pace. */
  private leader({ ground, trails }: SkillStage, { reach, bolt, vfx }: Strike, flight: number, bright: boolean): void {
    const shown = Math.floor(flight * bolt.channel.length), [dim, lit] = STORM.gather;
    ground.fillStyle(PALETTE.silver, (dim + (lit - dim) * flight) * vfx.alpha);
    reach.rim.forEach((spot, index) => { if (index % 2 === 0) ground.fillRect(spot.x, spot.y, CELL, CELL); });
    trails.fillStyle(PALETTE.steelLight, .6 * vfx.alpha);
    for (let row = 0; row < shown; row++) fill(trails, bolt.channel[row]);
    for (const fork of bolt.forks) if (fork.along <= flight) fill(trails, fork);
    trails.fillStyle(bright ? PALETTE.white : PALETTE.silver, .9 * vfx.alpha);
    for (let row = Math.max(0, shown - STORM.tip); row < shown; row++) fill(trails, bolt.channel[row]);
  }

  /** Sparks from the strike point on the impact, once: they stay inside the real reach and die with the afterglow. A slow device
   *  gets fewer, and every strike the rules can have alive at once fits its share of the stage's motes. */
  private sparks(stage: SkillStage, { id, to, radius, untilTick }: ChaosSkillEvent, clock: number, bright: boolean): void {
    const { thunder, afterTicks } = CHAOS_RULES.skills, alive = Math.max(...thunder.count) * Math.ceil((thunder.flight + afterTicks) / thunder.interval);
    const count = Math.round(Math.floor(POOL.motes * STORM.motes / alive) * this.density), seconds = (untilTick - clock) / CHAOS_RULES.simulationHz;
    const random = scatter(Math.imul(id, 0x2c1b3c6d) ^ 0x1593), paints = bright ? SPARKS : CALM_SPARKS;
    for (let spark = 0; spark < count; spark++) {
      const turn = (spark + random()) / count * Math.PI * 2, pace = radius * (.35 + random() * .5) / seconds;
      stage.mote({ x: to.x, y: to.y }, Math.cos(turn) * pace, Math.sin(turn) * pace * .5 - pace * .4, pace * 1.2, seconds * 1000 * (.5 + random() * .5),
        paints[spark % paints.length], bright, 0, CHIP + spark % 2);
    }
  }
}

/** From the impact: the stroke burns from the bolt's origin to the strike point, blinks and cools over `glow` 0..1. With flashes off
 *  it stands dull for the same time, with no white and no blink. */
export function strokeBolt({ trails }: SkillStage, bolt: Bolt, glow: number, bright: boolean, vfx?: SkillVfx): void {
  const beat = STROKE.find(([until]) => glow < until);
  if (!beat) return;
  const [, core, halo] = beat, alpha = vfx?.alpha ?? 1;
  if (!bright) { trails.fillStyle(PALETTE.steelLight, .55 * alpha); for (const slice of bolt.channel) fill(trails, slice); return; }
  if (core <= 0) return;
  if (halo > 0 && (vfx?.heavy ?? true)) {
    trails.fillStyle(PALETTE.silverLight, halo * alpha);
    for (const slice of bolt.channel) trails.fillRect(slice.x - CHIP, slice.y, slice.width + 2 * CHIP, slice.height);
    for (const fork of bolt.forks) fill(trails, fork);
  }
  trails.fillStyle(halo > 0 ? PALETTE.white : PALETTE.steelLight, core * alpha);
  for (const slice of bolt.channel) fill(trails, slice);
}

/** From the impact, on the ground: a charred strike point, a white flash over it while the stroke first burns, and a ring that
 *  runs out onto the reach's radius, holds on the rim and fades as the afterglow ends. `cells` are the reach's cells nearest first. */
export function strikeRing({ ground }: SkillStage, reach: Reach, cells: Reach["cells"], glow: number, bright: boolean, vfx?: SkillVfx): void {
  const raced = Math.min(1, glow / STORM.race), front = reach.radius * (1 - (1 - raced) * (1 - raced));
  const settled = Math.max(0, glow - STORM.race) / (1 - STORM.race), fade = 1 - settled * settled, tones = bright ? RING : CALM_RING;
  const flash = bright && glow < BURN && (vfx?.heavy ?? true), foot = (flash ? reach.radius * STORM.foot : CELL * 2), bands = raced < 1 && (vfx?.heavy ?? true) ? tones.length : 1;
  ground.fillStyle(flash ? PALETTE.white : PALETTE.dark, (flash ? .8 : .4 * fade) * (vfx?.alpha ?? 1));
  for (const cell of cells) { if (cell.far >= foot) break; ground.fillRect(cell.x, cell.y, CELL, CELL); }
  let tone = -1;
  for (const cell of cells) {
    const step = Math.floor((front - cell.far) / CELL);
    if (step >= bands) continue;
    if (step < 0) break;
    if (step !== tone) { tone = step; ground.fillStyle(tones[step][0], tones[step][1] * (step ? 1 - raced : fade) * (vfx?.alpha ?? 1)); }
    ground.fillRect(cell.x, cell.y, CELL, CELL);
  }
}

export const show: SkillShow = new DongnaeShow();
