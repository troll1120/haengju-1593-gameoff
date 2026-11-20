import type Phaser from "phaser";
import { CENTER } from "../geometry";
import type { Point } from "../geometry";
import { bodyDepth, PALETTE, rangeCells } from "../presentation";
import type { Paint } from "../presentation";
import type { General } from "../roster";
import type { Effect, Enemy, Run } from "../rules";
import { effectArea, envelope, scatter } from "../skill-show";
import type { Area, ShowChannels } from "../skill-show";
import type { CastContext, FrameContext, Reach, SkillShow, SkillStage } from "../skill-stage";
import type { DongnaeLine } from "../skills-unique";

export const DONGNAE_GENERAL: General = "송상현";
/** Display-only staging of the held line, in milliseconds from the cast unless named otherwise. The rules own the line, its
 *  width, its life and every pulse; these numbers only time the picture drawn around them. */
export const DONGNAE_SHOW = {
  /** How far the band reaches across the line on each side when the line names no `halfWidth`: the current rules' 16 px. */
  halfWidth: 16,
  /** In run seconds: the rules pulse half a second after the cast, then once a second while the line holds. */
  firstPulse: .5, pulseEvery: 1,
  /** The stakes burst out in turn from the centre to both ends and each lands `rise` after its turn; the last one lands, and the
   *  whole band flashes once, before the rules' first pulse. */
  firstStake: 60, lastStake: 330, jitter: 12, rise: 110, flash: 120,
  fade: 300,
  dusk: { rise: 90, hold: 500, fall: 320 },
  mark: { rise: 60, still: 400, stillFall: 100 },
  /** Gold dashes gather along the rim before a pulse; the pulse lights the band for `spark` and its front reaches both ends of
   *  the line in `wave`. The mud under a slowed foe ripples outward once every `ripple`. */
  gather: 200, spark: 50, wave: 250, ripple: 300,
  /** The palisade's own rhythm: a post every 24 px of line. */
  spacing: 24,
} as const;

/** The rules' band: the line from `from` to `to` and how far it reaches across the line on each side. */
export type Band = { readonly from: Point; readonly to: Point; readonly halfWidth: number };
/** A held line as the rules keep it; a retuned rules build also names the band's half-width on it. */
export type HeldLine = DongnaeLine & { readonly halfWidth?: number };
/** The band of a held line: the line's own half-width, else the current rules' 16 px. */
export function lineBand(line: HeldLine): Band {
  return { from: line.from, to: line.to, halfWidth: line.halfWidth ?? DONGNAE_SHOW.halfWidth };
}

/** The rules' own band test: inside the line's span along it and `halfWidth` across it. Its ends are square, unlike a lane's round caps. */
export function onBand({ from, to, halfWidth }: Band, point: Point): boolean {
  const upright = from.x === to.x ? halfWidth : 0, level = from.y === to.y ? halfWidth : 0;
  return point.x >= Math.min(from.x, to.x) - upright && point.x <= Math.max(from.x, to.x) + upright
    && point.y >= Math.min(from.y, to.y) - level && point.y <= Math.max(from.y, to.y) + level;
}

/** The real band on the 4px ground grid, as a reach the stage can mark: only the cells whose centre the rules slow and strike. */
export function bandReach(band: Band): Reach {
  const { from, to, halfWidth } = band, length = Math.hypot(to.x - from.x, to.y - from.y);
  const ux = (to.x - from.x) / length, uy = (to.y - from.y) / length, cx = (from.x + to.x) / 2, cy = (from.y + to.y) / 2;
  const cells = rangeCells(to.x, to.y, halfWidth, from).filter(cell => onBand(band, { x: cell.x + 2, y: cell.y + 2 }))
    .map(cell => ({ ...cell, far: Math.abs((cell.x + 2 - cx) * uy - (cell.y + 2 - cy) * ux) }));
  const edge = (cell: Point & { far: number }) => cell.far > halfWidth - 4
    || Math.abs((cell.x + 2 - cx) * ux + (cell.y + 2 - cy) * uy) > length / 2 - 4;
  const bearing = (cell: Point) => Math.atan2(cell.y + 2 - cy, cell.x + 2 - cx);
  return { x: to.x, y: to.y, radius: halfWidth, from, cells, rim: cells.filter(edge).sort((a, b) => bearing(a) - bearing(b)) };
}

/** When the rules pulse along a line cast at `startedAt` and held until `until`, in run seconds. */
export function pulseTimes(startedAt: number, until: number): number[] {
  const times: number[] = [];
  for (let at = startedAt + DONGNAE_SHOW.firstPulse; at < until; at += DONGNAE_SHOW.pulseEvery) times.push(at);
  return times;
}

export type RampartStake = { readonly x: number; readonly y: number; readonly riseAt: number; readonly flip: boolean };
/** Where the rampart's stakes stand and when each bursts up: on the rules' line at the palisade's own rhythm, rising from the
 *  centre to both ends. With motion off nothing rises: the still variant is the reach mark alone. */
export function planRampart(cast: { readonly seed: number; readonly from: Point; readonly to: Point; readonly still: boolean }): RampartStake[] {
  if (cast.still) return [];
  const random = scatter(cast.seed), { from, to } = cast, dx = to.x - from.x, dy = to.y - from.y;
  const posts = Math.ceil(Math.hypot(dx, dy) / DONGNAE_SHOW.spacing), cascade = DONGNAE_SHOW.lastStake - DONGNAE_SHOW.firstStake;
  return Array.from({ length: posts + 1 }, (_, index) => ({ x: from.x + dx * index / posts, y: from.y + dy * index / posts, flip: random() < .5,
    riseAt: DONGNAE_SHOW.firstStake + Math.abs(index / posts - .5) * 2 * cascade + random() * DONGNAE_SHOW.jitter })).sort((a, b) => a.riseAt - b.riseAt);
}

type Stake = { readonly image: Phaser.GameObjects.Image; readonly x: number; readonly y: number; readonly riseAt: number; readonly far: number; landed: boolean };
type Cell = Point & { readonly far: number; readonly along: number; readonly earth?: Paint };
type Rampart = Band & {
  readonly id: number; readonly centre: Point; readonly halfLength: number;
  /** Which way across the line leads away from the fort: 1 or -1. */
  readonly outer: number;
  readonly reach: Reach; readonly cells: readonly Cell[]; readonly stakes: readonly Stake[];
  readonly banner: Phaser.GameObjects.Image | undefined; readonly bannerX: number;
  readonly castAt: number; readonly raisedAt: number; readonly seconds: number; readonly pulses: readonly number[];
  readonly channels: ShowChannels; readonly density: number;
  fired: number; pulseAt: number; slamAt: number; endAt: number; driftAt: number; rippled: number; flag: number;
};
/** One frame of one rampart: the time, the run, the rules' line while it holds, how much of the picture is left, and how long a
 *  mote born now may live so that none outlives the fade. */
type Moment = { readonly now: number; readonly run: Readonly<Run>; readonly at: FrameContext["at"]; readonly held: DongnaeLine | undefined;
  readonly fade: number; readonly lasting: number };
/** A stepped front run `distance` px out along the line from its centre, two cells to a step from the head back: each step's
 *  paint, strength and reach across the line as a share of the band's half-width. Never a smooth gradient. */
type Steps = readonly (readonly [Paint, number, number])[];
type Front = { readonly steps: Steps; readonly distance: number };

/** Art facts: the crossed stakes are 32 px with their feet on row 30; the banner's 3 px pole stands on row 31 around column 5.
 *  Neither is ever buried to its last row, so a crop always keeps at least one row. */
const STAKE = { art: "painted:palisade-crosses", size: 32, feet: 30, buried: 28, hop: 6, tip: 14, foot: 12 } as const;
const BANNER = { art: ["painted:yard-flag0", "painted:yard-flag1"], size: 32, pole: 5, feet: 31, buried: 30, hop: 3, flutter: 210, behind: 2, finial: 3, top: 36 } as const;
const PUFF = { rise: 8, scale: 1, alpha: .7 } as const;
const EARTH = [PALETTE.bark, PALETTE.bark, PALETTE.timber, PALETTE.ochre] as const;
const CHIPS = [PALETTE.paper, PALETTE.brass, PALETTE.sandLight, PALETTE.timberLight, PALETTE.cream, PALETTE.brass, PALETTE.sand, PALETTE.timberLight] as const;
const DUST = [PALETTE.sand, PALETTE.sandLight, PALETTE.cream] as const, EMBERS = [PALETTE.gold, PALETTE.flame, PALETTE.cream] as const;
const MUD = [PALETTE.ochre, PALETTE.sand, PALETTE.bark] as const;
/** The raise's shock line, white to gold, and a pulse's wave, a cream front with a gold tail. */
const SHOCK: Steps = [[PALETTE.white, .95, 1], [PALETTE.cream, .85, 1], [PALETTE.gold, .75, .5], [PALETTE.gold, .5, .5], [PALETTE.brass, .35, .25], [PALETTE.brass, .2, .25]];
const WAKE: Steps = [[PALETTE.cream, .95, 1], [PALETTE.gold, .8, 1], [PALETTE.gold, .55, 1], [PALETTE.brass, .35, 1]];
const COUNTS = { chips: 8, dust: 3, edge: 13, stars: 6, slamDust: 22, slamEmbers: 26, sparks: 16, struck: 12, foeSparks: 3, splash: 2, kicked: 8, kick: 2, crumble: 14 } as const;
const BEAT = { land: 50, jolt: 70, thump: 70, drift: 150 } as const;
const FEET = 12;

/** Cell corners of a pixel ellipse `wide` by `tall` cells on the 4px grid, centred on a body's feet: all of it, or only its rim. */
function ellipse(wide: number, tall: number, rim: boolean): Point[] {
  const inside = (column: number, row: number) => column >= 0 && row >= 0 && column < wide && row < tall
    && ((column + .5) * 2 / wide - 1) ** 2 + ((row + .5) * 2 / tall - 1) ** 2 <= 1;
  const cells: Point[] = [];
  for (let row = 0; row < tall; row++) for (let column = 0; column < wide; column++)
    if (inside(column, row) && !(rim && inside(column - 1, row) && inside(column + 1, row) && inside(column, row - 1) && inside(column, row + 1)))
      cells.push({ x: (column - wide / 2) * 4, y: (row - tall / 2) * 4 });
  return cells;
}
/** A slowed foe's mud: a dark puddle under its feet, and a rim that ripples outward through three sizes, bright to dim. */
const PUDDLE = ellipse(8, 4, false);
const RIPPLE = [{ cells: ellipse(6, 4, true), paint: PALETTE.cream, alpha: .95 }, { cells: ellipse(8, 4, true), paint: PALETTE.sandLight, alpha: .8 },
  { cells: ellipse(10, 6, true), paint: PALETTE.sand, alpha: .55 }] as const;

/** A piece bursting out of the ground: it clears the soil in the first half of its rise, overshoots, and lands. */
function lift(share: number, buried: number, hop: number): { readonly sink: number; readonly hop: number } {
  if (share >= 1) return { sink: 0, hop: 0 };
  return share < .5 ? { sink: Math.round(buried * (1 - share / .5) ** 2), hop: 0 } : { sink: 0, hop: Math.round(hop * Math.sin(Math.PI * (share - .5) / .5)) };
}
const bogged = (band: Band, enemy: Enemy): boolean => enemy.hp > 0 && enemy.kind !== "ship" && onBand(band, enemy);
/** A four-point pixel glint: gold arms `arm` pixels long around a white core. */
function glint(layer: Phaser.GameObjects.Graphics, { x, y }: Point, arm = 3): void {
  const left = Math.round(x), top = Math.round(y), core = arm > 4 ? 2 : 1;
  layer.fillStyle(PALETTE.gold, .9).fillRect(left - arm, top - 1, arm * 2, 2).fillRect(left - 1, top - arm, 2, arm * 2)
    .fillStyle(PALETTE.white, 1).fillRect(left - core, top - core, core * 2, core * 2);
}

/** 송상현's held line as a rampart slammed up out of the ground, sized by the rules' own band and timed by its own life. The real
 *  band lies marked while the line holds. A white shock line races from the banner to both ends and tears a trench open; crossed
 *  stakes burst out behind it one after another and slam home in chips, dust and smoke; when the last one lands the whole band
 *  flashes and the hold's seconds are called out. Every rules pulse then gathers along the rim and runs out along the band as a
 *  bright wave, every foe the band slows stands in rippling mud, and when the line ends it all sinks back into the ground. */
class DongnaeShow implements SkillShow {
  readonly general = DONGNAE_GENERAL;
  readonly accent = PALETTE.brass;
  /** The rules' own band for this cast's line; the effect only names the line's middle and half length. */
  areas(skill: Effect, run: Readonly<Run>): readonly Area[] {
    const line = (run.uniqueSkills ?? []).filter(item => item.kind === "hold" && item.squad === skill.squad).at(-1);
    if (line?.kind !== "hold") return [effectArea(skill)];
    const { from, to, halfWidth } = lineBand(line);
    return [{ x: to.x, y: to.y, radius: halfWidth, from }];
  }
  private ramparts: Rampart[] = [];

  cast(stage: SkillStage, { skill, run, from: caster, channels, density }: CastContext): void {
    const line = (run.uniqueSkills ?? []).filter(item => item.kind === "hold" && item.squad === skill.squad).at(-1);
    if (line?.kind !== "hold") return;
    const band = lineBand(line), { from, to } = band, still = !channels.motion, castAt = stage.now;
    const centre = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, halfLength = Math.hypot(to.x - from.x, to.y - from.y) / 2;
    const ux = (to.x - from.x) / (halfLength * 2), uy = (to.y - from.y) / (halfLength * 2), reach = bandReach(band);
    const cells = still ? [] : reach.cells.map(cell => ({ ...cell, along: (cell.x + 2 - centre.x) * ux + (cell.y + 2 - centre.y) * uy,
      ...(cell.far <= 4 ? { earth: EARTH[Math.floor(stage.random() * EARTH.length)] } : {}) }));
    const plan = planRampart({ seed: Math.floor(stage.random() * 0x100000000), from, to, still }), stakes: Stake[] = [];
    for (const stake of plan) {
      const image = stage.image(STAKE.art);
      if (!image) break;
      image.setFlipX(stake.flip).setDepth(bodyDepth(stake.y));
      stakes.push({ image, x: Math.round(stake.x), y: Math.round(stake.y), riseAt: castAt + stake.riseAt,
        far: Math.hypot(stake.x - centre.x, stake.y - centre.y), landed: false });
    }
    // The cloth flies away from the general, so neither covers the other; the pole stays on the line's centre either way.
    const mirrored = caster.x >= centre.x, lean = mirrored ? BANNER.pole + 1 - BANNER.size / 2 : BANNER.size / 2 - BANNER.pole;
    const banner = still ? undefined : stage.image(BANNER.art[0])?.setFlipX(mirrored).setDepth(bodyDepth(centre.y) - 1);
    this.ramparts.push({ ...band, id: line.id, centre, halfLength, outer: Math.sign(ux * (centre.y - CENTER.y) - uy * (centre.x - CENTER.x)) || 1,
      reach, cells, stakes, banner, bannerX: Math.round(centre.x) + lean, castAt, raisedAt: castAt + (plan.at(-1)?.riseAt ?? 0) + DONGNAE_SHOW.rise,
      seconds: Math.round(line.until - line.startedAt), pulses: pulseTimes(line.startedAt, line.until), channels, density,
      fired: 0, pulseAt: -Infinity, slamAt: -1, endAt: -1, driftAt: 0, rippled: 0, flag: 0 });
  }

  update(stage: SkillStage, frame: FrameContext): void {
    if (!this.ramparts.length) return;
    this.ramparts = this.ramparts.filter(rampart => {
      if (this.draw(stage, rampart, frame)) return true;
      this.release(stage, rampart);
      return false;
    });
  }

  clear(stage: SkillStage): void {
    for (const rampart of this.ramparts) this.release(stage, rampart);
    this.ramparts = [];
  }

  private release(stage: SkillStage, rampart: Rampart): void {
    for (const stake of rampart.stakes) stage.free(stake.image);
    if (rampart.banner) stage.free(rampart.banner);
  }

  /** One frame of one rampart; false once nothing of it is left on screen. */
  private draw(stage: SkillStage, rampart: Rampart, { now, cssPixel, run, at }: FrameContext): boolean {
    const age = now - rampart.castAt, { channels } = rampart;
    if (!channels.motion) {
      stage.mark(rampart.reach, { age, since: -1, alpha: envelope(age, 0, DONGNAE_SHOW.mark.still, DONGNAE_SHOW.mark.stillFall), channels });
      return age < DONGNAE_SHOW.mark.still + DONGNAE_SHOW.mark.stillFall;
    }
    // The rules' own line, read only: its next pulse time says which pulses have landed, and its absence that the hold is over.
    const line = run.uniqueSkills?.find(item => item.id === rampart.id), held = line?.kind === "hold" && run.time < line.until ? line : undefined;
    if (!held && rampart.endAt < 0) { rampart.endAt = now; this.crumble(stage, rampart); }
    const gone = rampart.endAt < 0 ? 0 : (now - rampart.endAt) / DONGNAE_SHOW.fade;
    if (gone >= 1) return false;
    const moment: Moment = { now, run, at, held, fade: 1 - gone, lasting: (held ? (held.until - run.time) * 1000 : 0) + DONGNAE_SHOW.fade };
    const fired = held ? rampart.pulses.filter(time => time < held.nextAt - 1e-6).length : rampart.fired;
    if (fired > rampart.fired) { rampart.fired = fired; rampart.pulseAt = now; this.pulse(stage, rampart, moment); }
    if (rampart.slamAt < 0 && (now >= rampart.raisedAt || rampart.fired > 0)) { rampart.slamAt = now; this.slam(stage, rampart, cssPixel); }
    stage.veil(envelope(age, DONGNAE_SHOW.dusk.rise, DONGNAE_SHOW.dusk.hold, DONGNAE_SHOW.dusk.fall), channels);
    stage.mark(rampart.reach, { age, since: rampart.slamAt < 0 ? -1 : now - rampart.slamAt, alpha: Math.min(1, age / DONGNAE_SHOW.mark.rise) * moment.fade, channels });
    this.groundbreak(stage, rampart, moment);
    this.heartbeat(stage, rampart, moment);
    this.mudRings(stage, rampart, moment);
    this.pieces(stage, rampart, moment);
    if (rampart.endAt < 0 && rampart.slamAt >= 0 && now >= rampart.driftAt) {
      rampart.driftAt = now + BEAT.drift / Math.max(.25, rampart.density);
      stage.mote(this.somewhere(stage, rampart, .375), (stage.random() - .5) * 10, -(18 + stage.random() * 20), -8,
        Math.min(600 + stage.random() * 300, moment.lasting), EMBERS[Math.floor(stage.random() * EMBERS.length)], true, 0, 2);
    }
    return true;
  }

  /** A point of the band: `share` of the way along the line and `across` pixels off it. */
  private spot({ from, to, halfLength }: Rampart, share: number, across: number): Point {
    const dx = to.x - from.x, dy = to.y - from.y;
    return { x: from.x + dx * share - dy / (halfLength * 2) * across, y: from.y + dy * share + dx / (halfLength * 2) * across };
  }
  /** A random point of the band: anywhere along it, and up to `spread` of its half-width off the line. */
  private somewhere(stage: SkillStage, rampart: Rampart, spread: number): Point {
    return this.spot(rampart, stage.random(), (stage.random() - .5) * 2 * spread * rampart.halfWidth);
  }
  private along({ from, to, centre, halfLength }: Rampart, point: Point): number {
    return ((point.x - centre.x) * (to.x - from.x) + (point.y - centre.y) * (to.y - from.y)) / (halfLength * 2);
  }
  /** A pulse front's pace in pixels a millisecond: it reaches both ends of the line in the wave time. */
  private pace(rampart: Rampart): number { return rampart.halfLength / DONGNAE_SHOW.wave; }

  /** With flashes off the shock line runs dim and the band does not flash. */
  private groundbreak(stage: SkillStage, rampart: Rampart, { now, fade }: Moment): void {
    const { cells, halfLength, halfWidth, centre, channels } = rampart, age = now - rampart.castAt;
    const distance = halfLength * (age - DONGNAE_SHOW.firstStake) / (DONGNAE_SHOW.lastStake - DONGNAE_SHOW.firstStake);
    for (const cell of cells)
      if (cell.earth !== undefined && Math.abs(cell.along) <= distance) stage.ground.fillStyle(cell.earth, .6 * fade).fillRect(cell.x, cell.y, 4, 4);
    if (distance < 0 && channels.flash) glint(stage.trails, centre, 4);
    if (distance >= 0 && distance < halfLength + SHOCK.length * 8) this.sweep(stage, rampart, { steps: SHOCK, distance });
    const lit = rampart.slamAt < 0 ? -1 : now - rampart.slamAt;
    if (!channels.flash || lit < 0 || lit >= DONGNAE_SHOW.flash) return;
    const early = lit < DONGNAE_SHOW.flash / 2;
    stage.ground.fillStyle(early ? PALETTE.cream : PALETTE.gold, early ? .9 : .65);
    for (const cell of cells) stage.ground.fillRect(cell.x, cell.y, 4, 4);
    if (lit < BEAT.jolt) for (let star = 0; star < COUNTS.stars; star++)
      glint(stage.trails, this.spot(rampart, (star + .5) / COUNTS.stars, rampart.outer * (halfWidth - 2)), 4);
  }

  /** With flashes off only the front's head runs, in dim brass. */
  private sweep(stage: SkillStage, { cells, halfWidth, channels }: Rampart, { steps, distance }: Front): void {
    steps.forEach(([paint, alpha, reach], step) => {
      if (step && !channels.flash) return;
      stage.ground.fillStyle(channels.flash ? paint : PALETTE.brass, channels.flash ? alpha : .4);
      for (const cell of cells)
        if (cell.far <= reach * halfWidth && Math.floor((distance - Math.abs(cell.along)) / 8) === step) stage.ground.fillRect(cell.x, cell.y, 4, 4);
    });
  }

  /** Gold dashes run in along the rim to meet at the banner on each pulse; the pulse lights the band for a moment, then its wave
   *  runs out to both ends on the ground and, since the stakes cover most of a narrow band, along both rims above the bodies.
   *  With flashes off only a dim front runs. */
  private heartbeat(stage: SkillStage, rampart: Rampart, { now, run, held }: Moment): void {
    const { cells, halfLength, halfWidth, channels } = rampart, lead = held && held.nextAt < held.until ? (held.nextAt - run.time) * 1000 : -1;
    if (lead >= 0 && lead < DONGNAE_SHOW.gather) {
      const dash = halfLength * lead / DONGNAE_SHOW.gather;
      stage.ground.fillStyle(PALETTE.gold, .75);
      for (const cell of cells) if (cell.far > halfWidth - 4 && Math.abs(Math.abs(cell.along) - dash) < 6) stage.ground.fillRect(cell.x, cell.y, 4, 4);
    }
    const since = now - rampart.pulseAt, distance = this.pace(rampart) * since;
    if (distance >= halfLength + WAKE.length * 8) return;
    if (channels.flash && since < DONGNAE_SHOW.spark) {
      stage.ground.fillStyle(PALETTE.gold, .4);
      for (const cell of cells) stage.ground.fillRect(cell.x, cell.y, 4, 4);
    }
    this.sweep(stage, rampart, { steps: WAKE, distance });
    if (!channels.flash) return;
    WAKE.forEach(([paint, alpha], step) => {
      stage.field.fillStyle(step ? paint : PALETTE.white, alpha);
      for (const cell of cells)
        if (cell.far > halfWidth - 4 && Math.floor((distance - Math.abs(cell.along)) / 8) === step) stage.field.fillRect(cell.x, cell.y, 4, 4);
    });
  }

  private mudRings(stage: SkillStage, rampart: Rampart, { now, run, at, fade, lasting }: Moment): void {
    const beat = (now - rampart.castAt) / DONGNAE_SHOW.ripple, ripple = RIPPLE[Math.floor(beat % 1 * RIPPLE.length)];
    const kicking = rampart.endAt < 0 && Math.floor(beat) !== rampart.rippled, wave = now - rampart.pulseAt, pace = this.pace(rampart);
    rampart.rippled = Math.floor(beat);
    let kicked = 0;
    for (const enemy of run.enemies) {
      if (!bogged(rampart, enemy)) continue;
      const drawn = at(enemy), size = enemy.boss || enemy.elite ? 2 : 1, side = 4 * size;
      const x = Math.round(drawn.x / 4) * 4, y = Math.round((drawn.y + FEET * size) / 4) * 4;
      stage.ground.fillStyle(PALETTE.bark, .5 * fade);
      for (const cell of PUDDLE) stage.ground.fillRect(x + cell.x * size, y + cell.y * size, side, side);
      stage.ground.fillStyle(ripple.paint, ripple.alpha * fade);
      for (const cell of ripple.cells) stage.ground.fillRect(x + cell.x * size, y + cell.y * size, side, side);
      const struck = wave - Math.abs(this.along(rampart, drawn)) / pace;
      if (rampart.channels.flash && struck >= 0 && struck < BEAT.thump) glint(stage.trails, { x: drawn.x, y: drawn.y - 6 }, 4);
      if (!kicking || kicked++ >= COUNTS.kicked) continue;
      for (let fleck = 0; fleck < Math.round(COUNTS.kick * rampart.density); fleck++)
        stage.mote({ x: x + (stage.random() - .5) * 20 * size, y }, (stage.random() - .5) * 50, -(40 + stage.random() * 40), 240,
          Math.min(240 + stage.random() * 120, lasting), MUD[fleck % MUD.length], false, 0, 2);
    }
  }

  private pieces(stage: SkillStage, rampart: Rampart, { now, fade }: Moment): void {
    const { channels } = rampart, gone = 1 - fade, wave = now - rampart.pulseAt, pace = this.pace(rampart);
    const jolt = rampart.slamAt >= 0 && now - rampart.slamAt < BEAT.jolt ? 2 : 0;
    for (const stake of rampart.stakes) {
      const since = now - stake.riseAt, landing = since - DONGNAE_SHOW.rise;
      if (since < 0) continue;
      if (landing >= 0 && !stake.landed) { stake.landed = true; this.land(stage, stake, rampart.density); }
      const up = lift(since / DONGNAE_SHOW.rise, STAKE.buried, STAKE.hop), sink = Math.max(up.sink, Math.round(STAKE.buried * gone ** 2));
      const struck = wave - stake.far / pace, thump = struck >= 0 && struck < BEAT.thump ? 2 : 0;
      stake.image.setVisible(true).setPosition(stake.x, stake.y + sink - Math.max(up.hop, jolt, thump)).setCrop(0, 0, STAKE.size, STAKE.feet - sink);
      if (!channels.flash || sink) continue;
      if (landing >= 0 && landing < BEAT.land) glint(stage.trails, { x: stake.x, y: stake.y + STAKE.foot }, 6);
      if (thump || jolt) glint(stage.trails, { x: stake.x, y: stake.y - STAKE.tip });
    }
    const { banner, centre } = rampart, since = now - rampart.castAt - DONGNAE_SHOW.firstStake;
    if (!banner || since < 0) return;
    const up = lift(since / DONGNAE_SHOW.rise, BANNER.buried, BANNER.hop), sink = Math.max(up.sink, Math.round(BANNER.buried * gone ** 2));
    // The cloth snaps to its other frame on every pulse, then flutters between the two.
    const flag = Math.floor((now - Math.max(rampart.pulseAt, rampart.castAt)) / BANNER.flutter) % 2;
    if (flag !== rampart.flag) { rampart.flag = flag; banner.setTexture(BANNER.art[flag]); }
    const foot = Math.round(centre.y) - BANNER.behind;
    banner.setVisible(true).setCrop(0, 0, BANNER.size, BANNER.feet - sink)
      .setPosition(rampart.bannerX, foot + BANNER.size / 2 - BANNER.feet + sink - Math.max(up.hop, jolt));
    if (channels.flash && (wave < BEAT.thump || jolt) && !sink) glint(stage.trails, { x: Math.round(centre.x) + 1, y: foot - BANNER.feet + BANNER.finial });
  }

  private land(stage: SkillStage, stake: Stake, density: number): void {
    const foot = { x: stake.x, y: stake.y + STAKE.foot };
    for (let chip = 0; chip < Math.round(COUNTS.chips * density); chip++)
      stage.mote(foot, (stage.random() - .5) * 120, -(130 + stage.random() * 30), 420, 520 + stage.random() * 120, CHIPS[chip % CHIPS.length], false, 0, 2 + chip % 2);
    for (let puff = 0; puff < Math.round(COUNTS.dust * density); puff++)
      stage.mote(foot, (stage.random() - .5) * 50, -(12 + stage.random() * 24), -20, 380 + stage.random() * 200, DUST[puff % DUST.length], false, stage.random() * 60, 2);
    stage.puff(foot.x, foot.y - PUFF.rise, 0, PUFF.scale, PUFF.alpha);
  }

  private slam(stage: SkillStage, rampart: Rampart, cssPixel: number): void {
    const { centre, density, halfWidth } = rampart, row = Math.round(COUNTS.edge * density);
    stage.shout(centre.x, centre.y - BANNER.top, String(rampart.seconds), PALETTE.gold, cssPixel, true);
    stage.shake(.012, 90);
    for (let index = 0; index < row; index++) {
      const share = (index + .5) / row;
      stage.mote(this.spot(rampart, share, rampart.outer * (halfWidth - 2)), (stage.random() - .5) * 16, -(90 + stage.random() * 40), 300,
        320 + stage.random() * 120, EMBERS[index % EMBERS.length], true, Math.abs(share - .5) * 2 * BEAT.jolt, 2 + index % 2);
    }
    for (let index = 0; index < Math.round(COUNTS.slamDust * density); index++)
      stage.mote(this.somewhere(stage, rampart, .75), (stage.random() - .5) * 26, -(18 + stage.random() * 40), -12,
        520 + stage.random() * 360, DUST[index % DUST.length], false, stage.random() * 120);
    for (let index = 0; index < Math.round(COUNTS.slamEmbers * density); index++)
      stage.mote(this.somewhere(stage, rampart, .625), (stage.random() - .5) * 22, -(40 + stage.random() * 70), -10,
        520 + stage.random() * 380, EMBERS[index % EMBERS.length], true, stage.random() * 160);
  }

  private pulse(stage: SkillStage, rampart: Rampart, { run, at, lasting }: Moment): void {
    const { density, halfLength, halfWidth } = rampart, pace = this.pace(rampart);
    for (let index = 0; index < Math.round(COUNTS.sparks * density); index++) {
      const share = stage.random(), spark = this.spot(rampart, share, (stage.random() - .5) * .625 * halfWidth), reached = Math.abs(share - .5) * 2 * halfLength / pace;
      stage.mote({ x: spark.x, y: spark.y - 6 }, (stage.random() - .5) * 30, -(50 + stage.random() * 60), 60, Math.min(340 + stage.random() * 240, lasting - reached),
        EMBERS[index % EMBERS.length], true, reached);
    }
    let struck = 0;
    for (const enemy of run.enemies) {
      if (struck >= COUNTS.struck || !bogged(rampart, enemy)) continue;
      struck++;
      const drawn = at(enemy), reached = Math.abs(this.along(rampart, drawn)) / pace;
      for (let spark = 0; spark < Math.round(COUNTS.foeSparks * density); spark++)
        stage.mote({ x: drawn.x + (stage.random() - .5) * 12, y: drawn.y - 4 }, (stage.random() - .5) * 70, -(70 + stage.random() * 60), 200,
          Math.min(280 + stage.random() * 140, lasting - reached), EMBERS[spark % EMBERS.length], true, reached, 2 + spark % 2);
      for (let fleck = 0; fleck < Math.round(COUNTS.splash * density); fleck++)
        stage.mote({ x: drawn.x, y: drawn.y + FEET }, (stage.random() - .5) * 90, -(50 + stage.random() * 50), 300,
          Math.min(240 + stage.random() * 120, lasting - reached), MUD[fleck % MUD.length], false, reached, 2);
    }
  }

  private crumble(stage: SkillStage, rampart: Rampart): void {
    for (let index = 0; index < Math.round(COUNTS.crumble * rampart.density); index++)
      stage.mote(this.somewhere(stage, rampart, .5), (stage.random() - .5) * 30, -(14 + stage.random() * 30), -14,
        180 + stage.random() * 110, DUST[index % DUST.length], false, stage.random() * 10);
    for (const share of [.28, .72]) { const smoke = this.spot(rampart, share, 0); stage.puff(smoke.x, smoke.y - 4); }
  }
}

export const show: SkillShow = new DongnaeShow();
