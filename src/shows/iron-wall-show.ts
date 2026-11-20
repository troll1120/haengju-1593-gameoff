// allow: SIZE_OK — this lane owns a fixed set of files; the shell painter is the unit to split out when a new show file may be added.
import { CHAOS_RULES } from "../chaos-contract";
import type { ChaosSkillEvent, ChaosSkillState } from "../chaos-contract";
import { boreOf, CANNON_GENERAL, cannonShells, GUN_LAYERS, GunPainter, stageSink, WAY_OUT } from "../chaos-shows/wall-belt";
import type { CannonBrush, CannonLayer, GunPart, WallPort } from "../chaos-shows/wall-belt";
import { fortRect, sideOf } from "../geometry";
import type { Point, Rect } from "../geometry";
import { PALETTE, rangeCells } from "../presentation";
import type { Paint } from "../presentation";
import type { Effect, Run } from "../rules";
import { skillVfx } from "../skill-vfx";
import type { SkillVfx } from "../skill-vfx";
import { scatter } from "../skill-show";
import type { Area, ShowChannels } from "../skill-show";
import { POOL } from "../skill-stage";
import type { CastContext, FrameContext, SkillShow, SkillStage } from "../skill-stage";

/** Display-only staging of 김시민's cannon shells. Every count, port, landing, radius, arc and tick is the rules' own, read from the
 *  live shells in run.chaosSkills; these numbers only shape the picture laid on them, as shares of a shell's own clocks and reach.
 *  The guns that fire them are ../chaos-shows/wall-belt. This file keeps its old path so the shared show index needs no edit. */
export const CANNON_SHOW = {
  /** Shares of the flight (startedTick to impactTick): the muzzle flash, the barrel's recoil, and the gap between the tail's embers. */
  flash: .22, recoil: .3, tail: .04,
  /** Shares of the after-glow (impactTick to untilTick): the pale flash over the reach, the shock front's run to the rim, the
   *  fireball, and when the blast's own smoke starts to rise. */
  pale: .14, shock: .55, ball: .5, plume: .2,
  /** Shares of the blast radius: the fireball's heart and the scorch under it. */
  heart: .32, scorch: .2,
  /** The explosion as cbe4240 reduced the fire cart's (owner DM 1794926634.203539): the landing's flash, shock front, fireball and
   *  gusts span this share of the blast radius (the old picture filled it), at this share of their alpha, played this many times as fast.
   *  The landing rim in flight still marks the rules' whole reach. */
  burst: { size: 1, alpha: .9, pace: 2 },
  /** Owner bug 1033 ("김시민 스킬이 안나가는데"): the cbe4240 cut left a 7 px ball and a 40% puff that did not read on a 390x844 phone,
   *  so the burst again fills the rules' whole hit radius. The drawn ball is enlarged this many times (7 px to 21 px), its embers are
   *  this many pixels, and a bright ring flashes on the real rim for this share of the blast. */
  ballScale: 3, ember: 4, ring: .35,
  /** The barrel's recoil in pixels, and the simulation ticks one step of the landing rim's march takes. */
  kick: 3, march: 3,
  /** A shell first seen this many ticks into its flight or its blast has already thrown its sparks or its debris. */
  late: 2,
  /** The share of the stage's motes all shells in the air together may take, the shake of a cast wave landing, and the ticks a
   *  cast's dusk takes to gather. */
  motes: 1 / 6, shake: .006, dusk: 2,
  /** With motion off: the alphas of the still rim and track, the landed reach and its scorch, the pixels between the track's
   *  dots, and the fixed age of the still smoke at the bore. */
  still: { rim: .7, fill: .2, scorch: .45, gap: 6, smoke: .4 },
} as const;
/** Chips one shell may throw, so the fullest volley the rules fire never takes more than its share of the stage's motes. */
export const SHELL_MOTES = Math.floor(POOL.motes * CANNON_SHOW.motes / Math.max(...CHAOS_RULES.skills.cannon.count));

export type CannonPart = GunPart | "aim" | "shadow" | "shock" | "ring" | "scorch" | "smoke" | "shell" | "ball" | "gust" | "plume";
export const CANNON_LAYERS: Readonly<Record<CannonPart, CannonLayer>> = { ...GUN_LAYERS, aim: "ground", shadow: "ground", shock: "ground", ring: "ground", scorch: "ground",
  smoke: "trails", shell: "trails", ball: "trails", gust: "trails", plume: "trails" };
export type CannonSink = (part: CannonPart, paint: Paint, alpha: number) => CannonBrush;

/** A run of ground cells on one row; it lengthens while a plan is measured. */
type Row = { readonly x: number; readonly y: number; width: number };
type Loop = { readonly lee: readonly Point[]; readonly near: readonly Point[] };
type Smoke = { readonly at: Point; readonly puffs: readonly { readonly delay: number; readonly dx: number; readonly dy: number; readonly size: number }[] };
type Fleck = { readonly vx: number; readonly vy: number; readonly life: number; readonly paint: Paint };
export type ShellPlan = {
  /** The rules' port, landing, blast radius and arc. */
  readonly from: WallPort; readonly to: Point; readonly radius: number; readonly arcHeight: number;
  /** The way the rules knock a struck foe: along the ground from the port to the landing. */
  readonly away: Point;
  /** The blast's real reach on the 4px ground grid as loops one cell wide from its heart to its rim. `lee` is the half of a loop
   *  facing away from the wall, `near` the half facing it. */
  readonly loops: readonly Loop[];
  /** The outer loop in marching order, the whole reach as row runs, and the scorched heart as row runs. */
  readonly rim: readonly Point[]; readonly rows: readonly Readonly<Row>[]; readonly heart: readonly Readonly<Row>[];
  /** The reduced explosion's reach (CANNON_SHOW.burst.size of the blast radius) as loops and row runs, like `loops` and `rows`. */
  readonly burst: { readonly radius: number; readonly loops: readonly Loop[]; readonly rows: readonly Readonly<Row>[] };
  /** Smoke born at the bore and over the blast; gusts blown the rules' way out across the reach, as unit ways and waits. */
  readonly smoke: Smoke; readonly plume: Smoke; readonly gusts: readonly (Point & { readonly wait: number })[];
  /** Chips the stage throws once: sparks from the bore, debris off the blast. Velocities in pixels a second, lives in milliseconds. */
  readonly sparks: readonly Fleck[]; readonly debris: readonly Fleck[];
};
type Timing = { readonly share: number; readonly life: number; readonly since: number; readonly tick: number };
/** A live shell at a drawn tick. `share` runs 0 to 1 through its phase and `life` through its whole life; `since` is the ticks
 *  into its phase. In flight `at` is the shell on the rules' arc, `ground` the point under it and `height` its lift as a share of the arc's top. */
export type ShellMoment = Timing & ({ readonly phase: "flight"; readonly at: Point; readonly ground: Point; readonly height: number } | { readonly phase: "blast" });

/** The drawn clock stops this share of a tick short of the next one. */
const LEAD = 1 - 2 ** -10;
/** The fireball's lift off the ground in pixels, and the pull on thrown debris in pixels a second squared. */
const LIFT = 4, PULL = 300;
/** The half of the shock front facing the wall runs this much fainter: the rules knock outward. */
const NEAR = .45;
type Tone = readonly [paint: Paint, alpha: number];
const TAIL: readonly Tone[] = [[PALETTE.flame, .9], [PALETTE.flame, .75], [PALETTE.ember, .6], [PALETTE.ember, .45], [PALETTE.ash, .3]];
const SMOKE: readonly Tone[] = [[PALETTE.silverLight, .6], [PALETTE.silverMid, .5], [PALETTE.silverShade, .36], [PALETTE.steelPale, .22]];
/** The shock front and the wake behind it, a loop to a step: stepped, never a smooth gradient. Without flashes it runs dim and never white. */
const WAKE: readonly Tone[] = [[PALETTE.white, .85], [PALETTE.cream, .6], [PALETTE.gold, .4]];
const CALM_WAKE: readonly Tone[] = [[PALETTE.gold, .45], [PALETTE.ember, .25]];
/** The fireball in four steps, each a few discs from the outside in: paint, alpha and size as a share of the heart. */
type Glow = readonly [paint: Paint, alpha: number, scale: number];
const BALL: readonly (readonly Glow[])[] = [[[PALETTE.cream, .9, 1], [PALETTE.white, 1, .65]], [[PALETTE.gold, .8, 1.1], [PALETTE.cream, .9, .75]],
  [[PALETTE.flame, .6, 1.15], [PALETTE.gold, .7, .6]], [[PALETTE.ember, .35, .9]]];
const CALM_BALL: readonly (readonly Glow[])[] = [[[PALETTE.flame, .6, 1], [PALETTE.gold, .7, .65]], [[PALETTE.ember, .55, 1.1], [PALETTE.flame, .6, .75]],
  [[PALETTE.ember, .4, 1.15]], [[PALETTE.ember, .25, .9]]];
const SPARKS: readonly Paint[] = [PALETTE.cream, PALETTE.gold, PALETTE.flame];
const DEBRIS: readonly Paint[] = [PALETTE.sand, PALETTE.sandLight, PALETTE.flame, PALETTE.cream];
const GUSTS = { count: 6, spread: 1.9, throw: 2.4 } as const;

/** The shells' clock as drawn: the rules' tick plus the share of the next one already under way, from the run's own remainder or, as
 *  the scene steps whole ticks, from the display time since the tick last moved. Always short of the next tick, so nothing lands on
 *  screen before the rules land it. */
export function shellTick(state: Pick<ChaosSkillState, "tick" | "remainder">, sinceTickMs = 0): number {
  return state.tick + Math.min(LEAD, (Math.max(0, state.remainder) + Math.max(0, sinceTickMs) / 1000) * CHAOS_RULES.simulationHz);
}

/** The rules' arc at a share of the flight: the point on the ground between port and landing, and the shell over it, lifted by
 *  arcHeight * 4 * share * (1 - share) as the rules lift it. */
function flightAt(lob: Pick<ChaosSkillEvent, "from" | "to" | "arcHeight">, share: number): { readonly at: Point; readonly ground: Point; readonly height: number } {
  const height = 4 * share * (1 - share), ground = { x: lob.from.x + (lob.to.x - lob.from.x) * share, y: lob.from.y + (lob.to.y - lob.from.y) * share };
  return { ground, height, at: { x: ground.x, y: ground.y - lob.arcHeight * height } };
}

/** Where a shell is in its life at a drawn tick: nothing before the rules fire it or after they drop it, in flight until their
 *  impact tick, then the blast. */
export function shellMoment(shell: ChaosSkillEvent, tick: number): ShellMoment | undefined {
  const { startedTick, impactTick, untilTick } = shell;
  if (tick < startedTick || tick >= untilTick) return undefined;
  const life = (tick - startedTick) / (untilTick - startedTick);
  if (tick >= impactTick) return { phase: "blast", share: (tick - impactTick) / (untilTick - impactTick), life, since: tick - impactTick, tick };
  const share = (tick - startedTick) / (impactTick - startedTick);
  return { phase: "flight", share, life, since: tick - startedTick, tick, ...flightAt(shell, share) };
}

const turned = (way: Point, turn: number): Point => ({ x: way.x * Math.cos(turn) - way.y * Math.sin(turn), y: way.x * Math.sin(turn) + way.y * Math.cos(turn) });
function appendToRuns(rows: Row[], cell: Point): void {
  const last = rows[rows.length - 1];
  if (last && last.y === cell.y && last.x + last.width === cell.x) last.width += 4; else rows.push({ x: cell.x, y: cell.y, width: 4 });
}

/** One shell's picture, measured once from the rules' event: its port's side of the wall, its blast's real reach on the ground
 *  grid, and its decoration, scattered from the shell's own id so the same shell always looks the same. */
export function planShell(shell: ChaosSkillEvent, wall: Rect): ShellPlan {
  const { to, radius } = shell, from: WallPort = { x: shell.from.x, y: shell.from.y, side: sideOf(wall, shell.from) }, out = WAY_OUT[from.side];
  const span = Math.hypot(to.x - from.x, to.y - from.y), away = span > 0 ? { x: (to.x - from.x) / span, y: (to.y - from.y) / span } : out;
  const random = scatter(Math.imul(shell.id, 0x9e3779b1) ^ 0xca22), count = Math.max(1, Math.ceil(radius / 4));
  const loops = Array.from({ length: count }, (): { lee: Point[]; near: Point[] } => ({ lee: [], near: [] })), rows: Row[] = [], heart: Row[] = [];
  const reach = radius * CANNON_SHOW.burst.size, inner = Math.max(1, Math.ceil(reach / 4)), burstRows: Row[] = [];
  const burstLoops = Array.from({ length: inner }, (): { lee: Point[]; near: Point[] } => ({ lee: [], near: [] }));
  for (const cell of rangeCells(to.x, to.y, radius)) {
    const dx = cell.x + 2 - to.x, dy = cell.y + 2 - to.y, far = Math.hypot(dx, dy), loop = loops[Math.min(count - 1, Math.floor(far / 4))];
    const lee = dx * away.x + dy * away.y >= 0;
    (lee ? loop.lee : loop.near).push(cell);
    appendToRuns(rows, cell);
    if (far <= radius * CANNON_SHOW.scorch) appendToRuns(heart, cell);
    if (far <= reach) {
      const ring = burstLoops[Math.min(inner - 1, Math.floor(far / 4))];
      (lee ? ring.lee : ring.near).push(cell);
      appendToRuns(burstRows, cell);
    }
  }
  const bearing = (cell: Point) => Math.atan2(cell.y + 2 - to.y, cell.x + 2 - to.x), edge = loops[count - 1];
  const cloud = (at: Point, way: Point, chips: number): Smoke => ({ at, puffs: Array.from({ length: chips }, () => {
    const delay = random() * .15, drift = 6 + random() * 12, across = (random() - .5) * 14, rise = 4 + random() * 10;
    return { delay, dx: way.x * drift - way.y * across, dy: way.y * drift + way.x * across - rise, size: 4 + 2 * Math.floor(random() * 2) };
  }) });
  const smoke = cloud(boreOf(from), out, 5), plume = cloud({ x: to.x, y: to.y - LIFT }, away, 4);
  const gusts = Array.from({ length: GUSTS.count }, () => ({ ...turned(away, (random() - .5) * GUSTS.spread), wait: random() * .35 }));
  const sparks = Array.from({ length: Math.floor(SHELL_MOTES / 3) }, (_, index): Fleck => {
    const pace = 90 + random() * 90;
    return { vx: out.x * pace + (random() - .5) * 60, vy: out.y * pace + (random() - .5) * 60, life: 140 + random() * 120, paint: SPARKS[index % SPARKS.length] };
  });
  const debris = Array.from({ length: SHELL_MOTES - sparks.length }, (_, index): Fleck => {
    const way = turned(away, (random() - .5) * GUSTS.throw), pace = 50 + random() * 90;
    return { vx: way.x * pace, vy: way.y * pace - (40 + random() * 60), life: 260 + random() * 180, paint: DEBRIS[index % DEBRIS.length] };
  });
  return { from, to: { x: to.x, y: to.y }, radius, arcHeight: shell.arcHeight, away, loops, rows, heart, burst: { radius: reach, loops: burstLoops, rows: burstRows },
    rim: [...edge.lee, ...edge.near].sort((a, b) => bearing(a) - bearing(b)), smoke, plume, gusts, sparks, debris };
}

/** Lays a shell's picture on a sink for one look. With flashes off nothing is white and the shock runs dim; with motion off a
 *  shell is a still picture a phase. */
export class ShellPainter {
  private readonly guns: GunPainter;
  private readonly sink: CannonSink;
  constructor(sink: CannonSink, private readonly look: ShowChannels, private readonly vfx?: SkillVfx) {
    this.sink = (part, paint, alpha) => sink(part, paint, alpha * (vfx?.alpha ?? 1));
    this.guns = new GunPainter(this.sink, look.flash);
  }

  /** One live shell of the rules at one moment: its gun, and in flight the flash, the shell on its arc and where it will land,
   *  then the blast; smoke hangs at the bore all its life. */
  shell(plan: ShellPlan, moment: ShellMoment): void {
    if (!this.look.motion) { this.still(plan, moment.phase); return; }
    const { recoil, kick } = CANNON_SHOW, recoiling = moment.phase === "flight" && moment.share < recoil;
    this.guns.gun(plan.from, recoiling ? Math.round(kick * (1 - moment.share / recoil)) : 0, recoiling ? "fired" : "cold");
    switch (moment.phase) {
      case "flight": this.flight(plan, moment); break;
      case "blast": this.blast(plan, moment.share); break;
      default: moment satisfies never;
    }
    this.drift("smoke", plan.smoke, moment.life);
  }

  /** The landing's real rim marching and brightening, the shell's shadow on the ground, the flash at the bore, and the shell on the
   *  rules' arc with embers behind it, larger the higher it is. */
  private flight(plan: ShellPlan, moment: Extract<ShellMoment, { phase: "flight" }>): void {
    const { share, at, ground, height } = moment, { flash, tail, march } = CANNON_SHOW;
    this.rim(plan, .2 + .5 * share * share, Math.floor(moment.tick / march));
    const wide = height > .5 ? 6 : 8;
    this.sink("shadow", PALETTE.dark, .5 - .2 * height)(Math.round(ground.x - wide / 2), Math.round(ground.y) - 2, wide, 4);
    if (share < flash) this.guns.flash(plan.from, share / flash);
    TAIL.forEach(([paint, alpha], index) => {
      const behind = share - (index + 1) * tail;
      if (behind <= 0) return;
      const ember = flightAt(plan, behind).at;
      const side = CANNON_SHOW.ember;
      this.sink("shell", paint, alpha)(Math.round(ember.x - side / 2), Math.round(ember.y - side / 2), side, side);
    });
    // Owner bug 1033: at least 16 px on a phone, so the shell reads through the gun smoke even where the drawn ball sprite is pooled out.
    const size = height > 2 / 3 ? 20 : height > 1 / 3 ? 18 : 16, x = Math.round(at.x - size / 2), y = Math.round(at.y - size / 2);
    this.sink("shell", PALETTE.outline, 1)(x, y, size, size);
    this.sink("shell", PALETTE.flame, 1)(x + 2, y + 2, size - 4, size - 4);
    this.sink("shell", PALETTE.cream, 1)(x + 4, y + 4, 6, 6);
  }

  /** The shell lands: a scorch, a pale flash over the whole reach, a stepped shock front running from the heart to the real rim
   *  where its dust settles, the fireball, gusts blown the way the rules knock, and smoke off the blast. */
  private blast(plan: ShellPlan, share: number): void {
    const { pale, shock, ball, heart, plume, burst } = CANNON_SHOW, { loops, rows, radius } = plan.burst, bright = this.look.flash, last = loops.length - 1;
    const fast = share * burst.pace, dim = burst.alpha;
    if (fast >= 1) return;
    const burnt = this.sink("scorch", PALETTE.ash, .5 * (1 - fast) * dim);
    for (const row of plan.heart) burnt(row.x, row.y, row.width, 4);
    if (bright && fast < pale) {
      const fill = this.sink("shock", PALETTE.cream, .4 * (1 - fast / pale) * dim);
      for (const row of rows) fill(row.x, row.y, row.width, 4);
    }
    if (fast < CANNON_SHOW.ring) {
      const fade = 1 - fast / CANNON_SHOW.ring, edge = plan.loops.length - 1;
      this.loop(plan.loops[edge], bright ? PALETTE.white : PALETTE.gold, fade, "ring");
      this.loop(plan.loops[edge - 1], bright ? PALETTE.cream : PALETTE.ember, .7 * fade, "ring");
    }
    if (fast < shock) {
      const front = Math.floor(loops.length * (1 - (1 - fast / shock) ** 2));
      (bright ? WAKE : CALM_WAKE).forEach(([paint, alpha], step) => this.loop(loops[front - step], paint, alpha * dim));
    } else {
      const settling = (1 - (fast - shock) / (1 - shock)) ** 2;
      this.loop(loops[last], PALETTE.sandLight, .45 * settling * dim);
      this.loop(loops[last - 1], PALETTE.sand, .25 * settling * dim);
    }
    if (fast < ball) for (const [paint, alpha, scale] of (bright ? BALL : CALM_BALL)[Math.floor(fast / ball * BALL.length)])
      this.disc(this.sink("ball", paint, alpha * dim), { x: plan.to.x, y: plan.to.y - LIFT }, radius * heart * scale);
    for (const gust of plan.gusts.slice(0, Math.ceil(plan.gusts.length * (this.vfx?.density ?? 1)))) {
      const run = (fast / shock - gust.wait) / (1 - gust.wait);
      if (run <= 0 || run >= 1) continue;
      const far = radius * (.2 + .7 * (1 - (1 - run) ** 2)), x = Math.round(plan.to.x + gust.x * far), y = Math.round(plan.to.y + gust.y * far);
      const level = Math.abs(gust.x) > Math.abs(gust.y);
      this.sink("gust", PALETTE.sandLight, (1 - run) * dim)(x - (level ? 2 : 1), y - (level ? 1 : 2), level ? 4 : 2, level ? 2 : 4);
      this.sink("gust", PALETTE.sand, .6 * (1 - run) * dim)(Math.round(x - gust.x * 5) - 1, Math.round(y - gust.y * 5) - 1, 2, 2);
    }
    this.drift("plume", plan.plume, (fast - plume) / (1 - plume));
  }

  /** Motion off: the gun, still smoke at its bore and the rules' real reach; in flight a still dotted track from the port to the
   *  landing, and once the rules land the shell the reach filled and scorched. Nothing travels, flashes or drifts. */
  private still(plan: ShellPlan, phase: ShellMoment["phase"]): void {
    const { rim, fill, scorch, gap, smoke } = CANNON_SHOW.still, { from, to, away } = plan;
    this.rim(plan, rim, 0);
    switch (phase) {
      case "flight": {
        const span = Math.hypot(to.x - from.x, to.y - from.y), track = this.sink("aim", PALETTE.gold, rim);
        for (let along = gap; along < span; along += gap) track(Math.round(from.x + away.x * along) - 1, Math.round(from.y + away.y * along) - 1, 2, 2);
        break;
      }
      case "blast": {
        const landed = this.sink("shock", this.look.flash ? PALETTE.cream : PALETTE.gold, this.look.flash ? fill : fill / 2);
        for (const row of plan.rows) landed(row.x, row.y, row.width, 4);
        const burnt = this.sink("scorch", PALETTE.ash, scorch);
        for (const row of plan.heart) burnt(row.x, row.y, row.width, 4);
        break;
      }
      default: phase satisfies never;
    }
    this.guns.gun(from, 0, "cold");
    this.drift("smoke", plan.smoke, smoke);
  }

  /** The landing's real rim as dots with its heart marked; `march` shifts the dots a cell a step. */
  private rim(plan: ShellPlan, alpha: number, march: number): void {
    const brush = this.sink("aim", PALETTE.gold, alpha);
    plan.rim.forEach((cell, index) => { if ((index + march) % 4 === 0) brush(cell.x, cell.y, 4, 4); });
    brush(Math.floor(plan.to.x / 4) * 4, Math.floor(plan.to.y / 4) * 4, 4, 4);
  }

  /** One loop of the reach: the half facing away from the wall at full strength and the half facing it fainter. */
  private loop(loop: Loop | undefined, paint: Paint, alpha: number, part: "shock" | "ring" = "shock"): void {
    if (!loop || alpha <= 0) return;
    const lee = this.sink(part, paint, alpha);
    for (const cell of loop.lee) lee(cell.x, cell.y, 4, 4);
    const near = this.sink(part, paint, alpha * NEAR);
    for (const cell of loop.near) near(cell.x, cell.y, 4, 4);
  }

  private disc(brush: CannonBrush, at: Point, radius: number): void {
    for (let dy = -Math.ceil(radius / 4) * 4; dy < radius; dy += 4) {
      const half = Math.round(Math.sqrt(Math.max(0, radius * radius - (dy + 2) * (dy + 2))) / 2) * 2;
      if (half > 0) brush(Math.round(at.x) - half, Math.round(at.y) + dy, half * 2, 4);
    }
  }

  /** Smoke: each chip swells and thins in steps as it drifts its own way from where it was born. */
  private drift(part: "smoke" | "plume", smoke: Smoke, age: number): void {
    for (const puff of smoke.puffs.slice(0, Math.ceil(smoke.puffs.length * (this.vfx?.density ?? 1)))) {
      const grown = (age - puff.delay) / (1 - puff.delay);
      if (grown < 0 || grown >= 1) continue;
      const [paint, alpha] = SMOKE[Math.floor(grown * SMOKE.length)], size = puff.size + 2 * Math.floor(grown * 3);
      this.sink(part, paint, alpha)(Math.round((smoke.at.x + puff.dx * grown - size / 2) / 2) * 2, Math.round((smoke.at.y + puff.dy * grown - size / 2) / 2) * 2, size, size);
    }
  }
}

type Live = { readonly plan: ShellPlan; readonly vfx: SkillVfx; sparked: boolean; burst: boolean;
  /** The drawn iron ball in flight and the reduced explosion at the landing, both pooled stage sprites. */
  ball?: Phaser.GameObjects.Sprite; blast?: Phaser.GameObjects.Sprite };

/** The shells of the cast a skill effect announces. The rules mark neither that effect nor a shell as cast or passive, so the cast
 *  is taken as the squad's newest one that still holds a later wave in reserve (a passive volley holds none), else its newest. */
function castShells(run: Readonly<Run>, skill: Effect): readonly ChaosSkillEvent[] {
  const tick = run.chaosSkills?.tick ?? 0, own = cannonShells(run).filter(shell => shell.squad === skill.squad);
  const held = own.filter(shell => shell.startedTick > tick), newest = Math.max(...(held.length ? held : own).map(shell => shell.castId));
  return own.filter(shell => shell.castId === newest);
}

/** 김시민's cannon barrage, drawn every frame from the rules' own shells in run.chaosSkills, so a passive volley that arrives with
 *  no cast is drawn like a cast one. Each shell's gun stands in the wall at the port the rules fire it from: on the rules' start
 *  tick it recoils, flashes at the bore and leaves smoke along the wall; the shell climbs the rules' arc over its shadow toward a
 *  marching rim that marks the rules' real reach; on the rules' impact tick it bursts in a fireball, a stepped shock front runs out
 *  to that rim and gusts blow the way the rules knock the struck foes. A cast dims the field until its first wave lands and each of
 *  its waves shakes the ground once as it lands. Everything lies under the enemy's red warnings and nothing on the ground is red.
 *  Motion off keeps a still picture a phase; flashes off paints nothing white. */
class CannonShow implements SkillShow {
  readonly general = CANNON_GENERAL;
  readonly accent = PALETTE.steelLight;
  private readonly live = new Map<number, Live>();
  private salvo: number[] = [];
  private dusk?: { readonly from: number; readonly land: number; readonly until: number };
  private seenTick = -1;
  private tickAt = 0;

  /** The ground a cast covers: every blast the rules have reserved for it. */
  areas(skill: Effect, run: Readonly<Run>): readonly Area[] {
    return castShells(run, skill).map(shell => ({ x: shell.to.x, y: shell.to.y, radius: shell.radius }));
  }

  /** A cast adds no picture of its own, only its weight: the dusk until its first wave lands and one shake for each wave's impact tick. */
  cast(_stage: SkillStage, { skill, run }: CastContext): void {
    const state = run.chaosSkills, shells = castShells(run, skill);
    if (!state || !shells.length) return;
    const first = shells.reduce((early, shell) => shell.impactTick < early.impactTick ? shell : early);
    this.salvo = [...new Set(shells.map(shell => shell.impactTick))].sort((a, b) => a - b);
    this.dusk = { from: state.tick, land: first.impactTick, until: first.untilTick };
  }

  update(stage: SkillStage, { run, now, channels }: FrameContext): void {
    const state = run.chaosSkills, shells = cannonShells(run);
    if (!state || !shells.length) { this.clear(); return; }
    if (state.tick !== this.seenTick) { this.seenTick = state.tick; this.tickAt = now; }
    const tick = channels.motion ? shellTick(state, now - this.tickAt) : state.tick, wall = fortRect(run.fort);
    const seen = new Set<number>();
    for (const shell of shells) {
      const moment = shellMoment(shell, tick);
      if (!moment) continue;
      seen.add(shell.id);
      let live = this.live.get(shell.id);
      if (!live) this.live.set(shell.id, live = { plan: planShell(shell, wall), vfx: skillVfx(run, run.squads.find(squad => squad.id === shell.squad)), sparked: false, burst: false });
      const paint = new ShellPainter(stageSink(stage, CANNON_LAYERS), channels, live.vfx);
      paint.shell(live.plan, moment);
      if (channels.motion) { this.picture(stage, live, shell, moment); this.fling(stage, live, moment); }
    }
    for (const [id, live] of this.live) if (!seen.has(id)) {
      if (live.ball) stage.freeSprite(live.ball);
      if (live.blast) stage.freeSprite(live.blast);
      this.live.delete(id);
    }
    let landed = false;
    while (this.salvo.length && state.tick >= this.salvo[0]) { this.salvo.shift(); landed = true; }
    if (landed && channels.motion) stage.shake(CANNON_SHOW.shake);
    if (!this.dusk) return;
    const { from, land, until } = this.dusk;
    if (tick >= until) this.dusk = undefined;
    else if (channels.motion) stage.veil(tick < land ? Math.min(1, (tick - from) / CANNON_SHOW.dusk) : 1 - (tick - land) / (until - land), channels);
  }

  /** The show takes no pooled picture: its chips are the stage's own and return by themselves. */
  clear(): void {
    this.live.clear(); this.salvo = []; this.dusk = undefined; this.seenTick = -1;
  }

  /** The drawn shot itself (owner DM 1794922218's "안 쏴지는데"): the iron ball of the deck cannon's shell art in flight, and at
   *  the rules' impact tick cbe4240's reduced explosion — the largest drawn explosion that fits the hit circle, half opaque,
   *  played twice as fast, exactly the deck cannon's navalBlast look. Pooled sprites, freed the frame the shell leaves. */
  private picture(stage: SkillStage, live: Live, shell: ChaosSkillEvent, moment: ShellMoment): void {
    if (moment.phase === "flight") {
      live.ball ??= stage.sprite("boom", "naval-shell");
      live.ball?.setPosition(Math.round(moment.at.x), Math.round(moment.at.y)).setScale(CANNON_SHOW.ballScale).setAlpha(live.vfx.alpha).setVisible(true);
      return;
    }
    if (live.ball) { stage.freeSprite(live.ball); live.ball = undefined; }
    live.blast ??= (() => {
      const room = shell.radius * 2 * CANNON_SHOW.burst.size;
      const looks = [{ texture: "blast-gold", animation: "explosion-gold", scale: 1, width: 64 },
        { texture: "boom-gold", animation: "boom-gold", scale: 1, width: 32 },
        { texture: "boom-gold", animation: "boom-gold", scale: .5, width: 16 }] as const;
      const look = looks.find(option => option.width <= room) ?? looks[looks.length - 1];
      const sprite = stage.sprite(look.texture);
      sprite?.setOrigin(.5, .5).setScale(Math.max(1, Math.round(room / look.width))).setAlpha(CANNON_SHOW.burst.alpha * live.vfx.alpha)
        .setPosition(Math.round(shell.to.x), Math.round(shell.to.y - 4)).setVisible(true);
      sprite?.play({ key: look.animation });
      if (sprite) sprite.anims.timeScale = 2;
      return sprite;
    })();
  }

  /** A shell's sparks from the bore and its debris off the blast, thrown once as the rules fire and land it and never replayed. */
  private fling(stage: SkillStage, live: Live, moment: ShellMoment): void {
    const { plan } = live, fresh = moment.since < CANNON_SHOW.late;
    switch (moment.phase) {
      case "flight": {
        if (live.sparked) return;
        live.sparked = true;
        if (fresh) for (const spark of plan.sparks) stage.mote(plan.smoke.at, spark.vx, spark.vy, 0, spark.life, spark.paint, true, 0, 2);
        return;
      }
      case "blast": {
        if (live.burst) return;
        live.burst = true;
        if (fresh) plan.debris.forEach((chip, index) => stage.mote(plan.to, chip.vx, chip.vy, PULL, chip.life, chip.paint, false, 0, 2 + index % 2));
        return;
      }
      default: moment satisfies never;
    }
  }
}

export const show: SkillShow = new CannonShow();
