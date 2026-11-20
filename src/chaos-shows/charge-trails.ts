import type Phaser from "phaser";
import { CHAOS_RULES } from "../chaos-contract";
import type { ChaosSkillEvent, ChaosState, ChaosTrail } from "../chaos-contract";
import type { Point } from "../geometry";
import { PALETTE } from "../presentation";
import type { Paint } from "../presentation";
import type { Run } from "../rules";
import { scatter } from "../skill-show";
import type { AmbientShow, FrameContext, SkillStage } from "../skill-stage";
import { skillVfx } from "../skill-vfx";

/** Display-only dressing of 신립's breakthrough trails, in field pixels, shares of a lane and milliseconds. Every lane's width,
 *  length, sweep and life is read from run.chaos and CHAOS_RULES.trail at run time; these numbers only decorate inside it. */
export const TRAIL_SHOW = {
  inset: 3, tint: .08,
  streakGap: 7, streakLength: .14, streakSpread: .22, streakLag: .35, streakAlpha: .6, shimmer: 55,
  hoofArea: 280, hoofAlpha: .75, hoofSparkEvery: 3,
  rimLit: .55, rimAhead: .18, dash: 8, gap: 5, capStep: 5, march: 40,
  wake: .3, wakeAlpha: .22, wedge: .8, wedgeAlpha: .85, tipArm: 5, comet: .14, halo: 4, glint: .75,
  queued: .32, queuedBreath: 420,
  burst: 240, burstReach: 13, hitSparks: 5, arrivalSparks: 7, lift: 7,
} as const;

/** A lane as the rules sweep it: every point within width / 2 of the segment from `from` to `to`. */
export type TrailLane = { readonly from: Point; readonly to: Point; readonly width: number };
export type TrailStreak = { readonly offset: number; readonly length: number; readonly lag: number; readonly beat: number };
export type TrailHoof = { readonly along: number; readonly offset: number };
export type TrailPlan = {
  readonly fromX: number; readonly fromY: number; readonly length: number; readonly half: number;
  readonly ux: number; readonly uy: number; readonly angle: number;
  readonly streaks: readonly TrailStreak[]; readonly hoofs: readonly TrailHoof[];
};
/** One trail at one army tick: how far the rules' sweep has run (0..1), how far its streaks have flowed (in lane lengths), ticks since
 *  it started, how much of it is left before untilTick (1..0), and the ticks its sweep takes from `from` to `to`. */
export type TrailMoment = { readonly since: number; readonly head: number; readonly travel: number; readonly fade: number; readonly sweep: number };
export type TrailLook = { readonly motion: boolean; readonly flash: boolean; readonly now: number };
export type TrailLayer = "ground" | "trails";
/** One rectangle in lane coordinates: `x` along the lane from its start, `y` across its spine, both in field pixels. */
export type TrailSink = (layer: TrailLayer, paint: Paint, alpha: number, x: number, y: number, wide: number, high: number) => void;

const RIM = 2, BURST_CHIPS = 10, FLARE_CHIPS = 14;
const STREAK: readonly Paint[] = [PALETTE.cream, PALETTE.gold, PALETTE.flame, PALETTE.ember];
const WAKE: readonly Paint[] = [PALETTE.gold, PALETTE.gold, PALETTE.flame, PALETTE.ember];
const HEAT: readonly Paint[] = [PALETTE.cream, PALETTE.gold, PALETTE.brass, PALETTE.sand];
const SPARKS: readonly Paint[] = [PALETTE.white, PALETTE.gold, PALETTE.flame];
const CALM_SPARKS: readonly Paint[] = [PALETTE.gold, PALETTE.flame, PALETTE.brass];

/** The army clock as drawn: the rules' tick plus the share of the next one already under way, from the run's own remainder or, when the
 *  scene steps whole ticks, from the display time since the tick last moved. Never more than one tick ahead of the rules. */
export function armyTick(state: Pick<ChaosState, "tick" | "remainder">, sinceTickMs = 0): number {
  const share = (Math.max(0, state.remainder) + Math.max(0, sinceTickMs) / 1000) * CHAOS_RULES.simulationHz;
  return state.tick + Math.min(1, share);
}

/** The drawn clock of one stepped rules state: `armyTick` with the display time since that state's tick last moved. */
export function tickClock(): (state: Pick<ChaosState, "tick" | "remainder">, now: number) => number {
  let tick = -1, movedAt = 0;
  return (state, now) => {
    if (state.tick !== tick) { tick = state.tick; movedAt = now; }
    return armyTick(state, now - movedAt);
  };
}

export function laneSpot(plan: Pick<TrailPlan, "fromX" | "fromY" | "ux" | "uy">, along: number, offset: number): Point {
  return { x: plan.fromX + plan.ux * along - plan.uy * offset, y: plan.fromY + plan.uy * along + plan.ux * offset };
}

/** What one trail's picture decides once: gold speed streaks across its real width and hoof marks scattered over it, each inside the
 *  lane the rules sweep. The sweep itself is read from the run every frame. */
export function planTrail(lane: TrailLane, seed: number): TrailPlan {
  const dx = lane.to.x - lane.from.x, dy = lane.to.y - lane.from.y, length = Math.hypot(dx, dy);
  const half = lane.width / 2, side = Math.max(0, half - TRAIL_SHOW.inset), random = scatter(seed);
  const streakCount = Math.max(1, Math.round(lane.width / TRAIL_SHOW.streakGap));
  const streaks = Array.from({ length: streakCount }, (_, index) => ({
    offset: ((index + .2 + random() * .6) / streakCount * 2 - 1) * side,
    length: (TRAIL_SHOW.streakLength + random() * TRAIL_SHOW.streakSpread) * length,
    lag: random() * TRAIL_SHOW.streakLag * length, beat: random() }));
  const hoofCount = Math.floor(length * lane.width / TRAIL_SHOW.hoofArea);
  const hoofs = Array.from({ length: hoofCount }, (_, index) => ({
    along: (index + .2 + random() * .6) / hoofCount * length, offset: (random() * 2 - 1) * side }));
  return { fromX: lane.from.x, fromY: lane.from.y, length, half, ux: length ? dx / length : 1, uy: length ? dy / length : 0,
    angle: Math.atan2(dy, dx), streaks, hoofs };
}

/** Where the rules are with one trail at army tick `tick`: the sweep runs from `from` to `to` over CHAOS_RULES.trail.hitTicks, the lane
 *  stands until its untilTick and fades out over the ticks after the sweep, while its streaks keep flowing and slow to a stop. */
export function trailMoment(trail: Pick<ChaosTrail, "startedTick" | "untilTick">, tick: number): TrailMoment {
  const sweep = CHAOS_RULES.trail.hitTicks, life = trail.untilTick - trail.startedTick, since = tick - trail.startedTick;
  const swept = Math.max(0, Math.min(sweep, life)), linger = life - swept, head = Math.max(0, Math.min(1, since / sweep));
  if (since <= swept) return { since, head, travel: Math.max(0, since) / sweep, fade: since < life ? 1 : 0, sweep };
  const after = Math.min(since, life) - swept, eased = linger > 0 ? after - after * after / (2 * linger) : 0;
  return { since, head, travel: (swept + eased) / sweep, fade: linger > 0 ? Math.max(0, 1 - (after / linger) ** 2) : 0, sweep };
}

/** The stretch of lane one streak covers: it trails `lag` behind the head while the rules sweep, then keeps flowing round the lane. It
 *  never runs ahead of the sweep and never leaves the lane. */
export function streakSpan(plan: TrailPlan, streak: TrailStreak, moment: TrailMoment): { readonly back: number; readonly front: number } | undefined {
  const raw = moment.travel * plan.length - streak.lag;
  if (raw <= 0 || plan.length <= 0) return undefined;
  const front = raw % (plan.length + streak.length), back = Math.max(0, front - streak.length), shown = Math.min(plan.length, front);
  return shown - back > .5 ? { back, front: shown } : undefined;
}

/** One trail's lane in lane coordinates. Motion off: only the still real reach, a faint tint and a standing dashed rim, fading at
 *  untilTick. Motion on: a bright head runs from `from` to `to` with a glowing wake and a chevron behind it, the rim lights where it has
 *  passed, hoof marks flare as it crosses them and gold streaks race down the lane and keep flowing until it fades. Flash off: no white. */
export function paintTrail(plan: TrailPlan, moment: TrailMoment, look: TrailLook, sink: TrailSink): void {
  const { length, half } = plan, { fade } = moment;
  if (fade <= 0 || length <= 0) return;
  const lit = (look.motion ? moment.head : 1) * length;
  sink("ground", PALETTE.gold, TRAIL_SHOW.tint * fade, 0, -half, lit, half * 2);
  if (look.motion) {
    paintWake(plan, moment, lit, sink);
    paintHoofs(plan, moment, lit, look, sink);
    paintStreaks(plan, moment, look, sink);
  }
  paintRim(plan, lit, TRAIL_SHOW.rimLit * fade, TRAIL_SHOW.rimAhead * fade, look, PALETTE.gold, sink);
  if (look.motion) paintHead(plan, moment, lit, look, sink);
}

/** A queued trail waits for a free slot under CHAOS_RULES.trail.capacity: its real reach stands as a dim dashed rim with a chevron at its
 *  start pointing the way it will run. With motion on the rim marches and the whole mark breathes. */
export function paintQueued(plan: TrailPlan, look: TrailLook, sink: TrailSink): void {
  if (plan.length <= 0) return;
  const alpha = TRAIL_SHOW.queued * (look.motion ? .7 + .3 * Math.sin(look.now / TRAIL_SHOW.queuedBreath * Math.PI * 2) : 1);
  paintRim(plan, 0, alpha, alpha, look, PALETTE.brass, sink);
  const side = Math.max(0, plan.half - TRAIL_SHOW.inset), tip = Math.min(plan.length, plan.half), reach = Math.min(tip, side / 2 / TRAIL_SHOW.wedge);
  for (let back = 0; back <= reach; back += 2) {
    const across = back * TRAIL_SHOW.wedge;
    sink("ground", PALETTE.gold, alpha * 1.6, tip - back - 1, across - 1, 2, 2);
    sink("ground", PALETTE.gold, alpha * 1.6, tip - back - 1, -across - 1, 2, 2);
  }
}

/** A clone of 신립's manual charge as the rules ride it (run.chaosSkills): its body sweeps `radius` to each side of the segment from
 *  `from` to `to` between startedTick and impactTick, then rests at `to` until untilTick. */
export type CloneRide = Pick<ChaosSkillEvent, "id" | "from" | "to" | "radius" | "startedTick" | "impactTick" | "untilTick">;

/** The independent sweeps the rules are running now. */
export function cloneRides(run: Pick<Run, "chaosSkills">): readonly ChaosSkillEvent[] {
  return run.chaosSkills?.events.filter(event => event.kind === "clones") ?? [];
}

/** Where the rules are with one clone at army tick `tick`: it rides from `from` to `to` between its startedTick and impactTick, then
 *  rests there while it fades out by its untilTick. Its streaks follow it and stop with it. */
export function cloneMoment(clone: Pick<CloneRide, "startedTick" | "impactTick" | "untilTick">, tick: number): TrailMoment {
  const sweep = clone.impactTick - clone.startedTick, since = tick - clone.startedTick, head = Math.max(0, Math.min(1, since / sweep));
  const fade = since < 0 || tick >= clone.untilTick ? 0 : tick <= clone.impactTick ? 1 : (clone.untilTick - tick) / (clone.untilTick - clone.impactTick);
  return { since, head, travel: head, fade, sweep };
}

/** Each clone owns the full width of its own lane. */
export function planClone(clone: CloneRide): TrailPlan {
  return planTrail({ from: clone.from, to: clone.to, width: clone.radius * 2 }, Math.imul(clone.id + 1, 0x9e3779b1) ^ 0x51ed);
}

/** One clone's lane in lane coordinates. Motion on: the ground lights behind the clone as the rules ride it, under a glowing wake and
 *  the streaks of its strip, and all of it fades while the clone rests at `to`. Motion off: the whole real reach stands still with a
 *  dashed edge on both sides, and nothing travels. */
export function paintClone(plan: TrailPlan, moment: TrailMoment, look: TrailLook, sink: TrailSink): void {
  const { length, half } = plan, { fade } = moment;
  if (fade <= 0 || length <= 0) return;
  const lit = (look.motion ? moment.head : 1) * length;
  sink("ground", PALETTE.gold, TRAIL_SHOW.tint * fade, 0, -half, lit, half * 2);
  if (look.motion) { paintWake(plan, moment, lit, sink); paintStreaks(plan, moment, look, sink); return; }
  for (const side of [-1, 1]) for (let start = 0; start < length; start += TRAIL_SHOW.dash + TRAIL_SHOW.gap)
    sink("ground", PALETTE.gold, TRAIL_SHOW.rimLit * fade, start, side < 0 ? -half : half - RIM, Math.min(TRAIL_SHOW.dash, length - start), RIM);
}

function paintRim(plan: TrailPlan, lit: number, litAlpha: number, aheadAlpha: number, look: TrailLook, paint: Paint, sink: TrailSink): void {
  const { length, half } = plan, period = TRAIL_SHOW.dash + TRAIL_SHOW.gap, shift = look.motion ? look.now / TRAIL_SHOW.march % period : 0;
  const edge = (from: number, to: number, alpha: number) => {
    if (to - from <= 0 || alpha <= 0) return;
    sink("ground", paint, alpha, from, -half, to - from, RIM);
    sink("ground", paint, alpha, from, half - RIM, to - from, RIM);
  };
  for (let start = shift - period; start < length; start += period) {
    const from = Math.max(0, start), to = Math.min(length, start + TRAIL_SHOW.dash);
    edge(from, Math.min(to, lit), litAlpha);
    edge(Math.max(from, lit), to, aheadAlpha);
  }
  // The round ends of the reach: every other chip of each half circle, one rim width inside it.
  const radius = Math.max(0, half - RIM), steps = Math.max(2, Math.round(Math.PI * radius / TRAIL_SHOW.capStep));
  for (let step = 1; step < steps; step += 2) {
    const turn = step / steps * Math.PI, x = Math.sin(turn) * radius, y = -Math.cos(turn) * radius;
    sink("ground", paint, lit > 0 ? litAlpha : aheadAlpha, -x - 1, y - 1, 2, 2);
    sink("ground", paint, lit >= length ? litAlpha : aheadAlpha, length + x - 1, y - 1, 2, 2);
  }
}

function paintWake(plan: TrailPlan, moment: TrailMoment, lit: number, sink: TrailSink): void {
  const { sweep } = moment, drain = moment.since <= sweep ? 1 : 1 - (moment.since - sweep) / (sweep / 2);
  if (drain <= 0 || lit <= 0) return;
  const slice = TRAIL_SHOW.wake * plan.length / WAKE.length, inner = Math.max(0, plan.half - RIM);
  for (let index = 0; index < WAKE.length && lit - index * slice > 0; index++) {
    const front = lit - index * slice, back = Math.max(0, front - slice);
    sink("ground", WAKE[index], TRAIL_SHOW.wakeAlpha * (1 - index / WAKE.length) * drain * moment.fade, back, -inner, front - back, inner * 2);
  }
}

function paintHoofs(plan: TrailPlan, moment: TrailMoment, lit: number, look: TrailLook, sink: TrailSink): void {
  const { sweep } = moment;
  for (const hoof of plan.hoofs) {
    if (hoof.along > lit) break;
    // Hit windows since the head crossed this mark: it cools from cream through gold and brass to sand.
    const cooled = Math.max(0, moment.since - hoof.along / plan.length * sweep) / sweep;
    const paint = HEAT[Math.min(HEAT.length - 1, Math.floor(cooled * HEAT.length))], alpha = TRAIL_SHOW.hoofAlpha * moment.fade * (1 - .45 * Math.min(1, cooled));
    // A horseshoe print opening the way the riders ran: a heel bar and two short prongs.
    sink("ground", paint, alpha, hoof.along - 2, hoof.offset - 2, 2, 4);
    sink("ground", paint, alpha, hoof.along, hoof.offset - 2, 2, 1);
    sink("ground", paint, alpha, hoof.along, hoof.offset + 1, 2, 1);
  }
}

function paintStreaks(plan: TrailPlan, moment: TrailMoment, look: TrailLook, sink: TrailSink): void {
  for (const streak of plan.streaks) {
    const span = streakSpan(plan, streak, moment);
    if (!span) continue;
    const shimmer = look.flash ? .8 + .2 * Math.sin(look.now / TRAIL_SHOW.shimmer + streak.beat * Math.PI * 2) : 1;
    const step = (span.front - span.back) / STREAK.length;
    STREAK.forEach((paint, band) => sink("ground", paint, TRAIL_SHOW.streakAlpha * (1 - band * .18) * moment.fade * shimmer,
      span.front - step * (band + 1), streak.offset - 1, step, 2));
  }
}

/** While the rules sweep: a chevron on the ground and a small bright spearhead over the bodies. When the sweep reaches `to`: a brief ring
 *  flares inside the lane's far end. */
function paintHead(plan: TrailPlan, moment: TrailMoment, lit: number, look: TrailLook, sink: TrailSink): void {
  const { sweep } = moment, side = Math.max(0, plan.half - TRAIL_SHOW.inset), bright = look.flash ? PALETTE.white : PALETTE.cream;
  if (moment.head < 1) {
    const reach = side / TRAIL_SHOW.wedge;
    for (let back = 0; back <= reach && lit - back >= 0; back += 2) {
      const share = reach > 0 ? back / reach : 0, across = back * TRAIL_SHOW.wedge, alpha = TRAIL_SHOW.wedgeAlpha * (1 - share * .6);
      const paint = share < .25 ? bright : share < .6 ? PALETTE.gold : PALETTE.ember;
      sink("ground", paint, alpha, lit - back - 1, across - 1, 2, 2);
      sink("ground", paint, alpha, lit - back - 1, -across - 1, 2, 2);
    }
    const arm = Math.max(1, Math.min(TRAIL_SHOW.tipArm, plan.half - RIM)), halo = Math.max(1, Math.min(TRAIL_SHOW.halo, plan.half - RIM));
    const tail = Math.min(TRAIL_SHOW.comet * plan.length, lit), comet = [bright, PALETTE.gold, PALETTE.flame] as const;
    comet.forEach((paint, band) => sink("trails", paint, .9 - band * .25, lit - tail * (band + 1) / comet.length, -1, tail / comet.length, 2));
    sink("trails", PALETTE.gold, .45, lit - halo, -halo, halo * 2, halo * 2);
    sink("trails", PALETTE.gold, .95, lit - arm, -1, arm * 2, 2);
    sink("trails", PALETTE.gold, .95, lit - 1, -arm, 2, arm * 2);
    sink("trails", bright, 1, lit - 2, -2, 4, 4);
    return;
  }
  const share = (moment.since - sweep) / (sweep / 2);
  if (share < 0 || share >= 1) return;
  const radius = 2 + Math.max(0, side - 2) * (1 - (1 - share) ** 2), paint = share < .3 ? bright : share < .65 ? PALETTE.gold : PALETTE.ember;
  for (let step = 0; step < FLARE_CHIPS; step++) {
    const turn = step / FLARE_CHIPS * Math.PI * 2;
    sink("ground", paint, (1 - share) * (look.flash ? .8 : .55) * moment.fade, plan.length + Math.cos(turn) * radius - 1, Math.sin(turn) * radius - 1, 2, 2);
  }
}

type TrailView = { readonly plan: TrailPlan; readonly startedTick: number; readonly untilTick: number; readonly random: () => number;
  seen: number; stamped: number; arrived: boolean; live: boolean; glint?: Phaser.GameObjects.Image };
type Burst = Point & { readonly at: number; readonly turn: number };

/** 신립's army breakthrough trails (run.chaos.trails) as gold cavalry streak lanes in their real width and length, and the queued ones
 *  (run.chaos.pendingTrails) as dim dashed lanes. Lasting pictures stay on the ground under the danger marks; only the small spearhead,
 *  the brief bursts on struck foes and the sparks rise over the bodies. It only reads the run. */
class ChargeTrails implements AmbientShow {
  readonly id = "charge-trails";
  readonly general = "신립";
  private look = { tier: 3, alpha: 1, density: 1, heavy: true };
  private views = new Map<number, TrailView>();
  private queued = new WeakMap<object, TrailPlan>();
  private bursts: Burst[] = [];
  private plans = new Map<number, TrailPlan>();
  private readonly cloneTick = tickClock();
  private state: ChaosState | undefined;
  private tick = -1;
  private tickAt = 0;

  update(stage: SkillStage, frame: FrameContext): void {
    this.look = skillVfx(frame.run, frame.run.squads.find(squad => squad.general === this.general));
    const look: TrailLook = { motion: frame.channels.motion, flash: frame.channels.flash, now: frame.now };
    this.clones(stage, frame.run, look);
    const state = frame.run.chaos;
    if (state !== this.state) { this.forget(stage); this.state = state; }
    if (!state) return;
    if (state.tick !== this.tick) { this.tick = state.tick; this.tickAt = frame.now; }
    const tick = armyTick(state, frame.now - this.tickAt);
    for (const view of this.views.values()) view.live = false;
    for (const trail of state.trails) {
      const view = this.views.get(trail.id) ?? this.open(trail, tick);
      view.live = true;
      if (trail.hits.length <= view.seen) continue;
      if (look.motion) for (const id of trail.hits.slice(view.seen)) this.burstOn(stage, frame, view, id, trailMoment(view, tick), look);
      view.seen = trail.hits.length;
    }
    // A trail the rules dropped early, its slot taken at capacity after its hits were spent, still fades out by its own untilTick;
    // an emptied army (a cleared run) drops every picture at once.
    for (const [id, view] of this.views) if (!view.live && (tick >= view.untilTick || !state.trails.length)) { this.release(stage, view); this.views.delete(id); }
    for (const entry of state.pendingTrails) {
      const plan = this.queued.get(entry) ?? planTrail(entry, 0);
      this.queued.set(entry, plan);
      this.lane(stage, plan, sink => paintQueued(plan, look, sink));
    }
    for (const view of this.views.values()) {
      const moment = trailMoment(view, tick);
      this.shine(stage, view, moment, look);
      if (moment.fade <= 0) continue;
      this.lane(stage, view.plan, sink => paintTrail(view.plan, moment, look, sink));
      if (look.motion) this.throwSparks(stage, view, moment, look);
    }
    if (look.motion) this.drawBursts(stage, look);
    else this.bursts = [];
  }

  clear(stage: SkillStage): void {
    this.forget(stage);
    this.state = undefined;
    this.plans.clear();
  }

  /** The clones' own lanes and one existing dust puff per spawn. */
  private clones(stage: SkillStage, run: FrameContext["run"], look: TrailLook): void {
    const state = run.chaosSkills, rides = cloneRides(run);
    if (!state || !rides.length) { this.plans.clear(); return; }
    const tick = this.cloneTick(state, look.now), plans = new Map<number, TrailPlan>();
    for (const ride of rides) {
      const previous = this.plans.get(ride.id);
      const plan = previous ?? planClone(ride);
      if (!previous && look.motion && tick - ride.startedTick <= 2) stage.puff(ride.from.x, ride.from.y, 0, 1, .85);
      plans.set(ride.id, plan);
      this.lane(stage, plan, sink => paintClone(plan, cloneMoment(ride, tick), look, sink));
    }
    this.plans = plans;
  }

  private forget(stage: SkillStage): void {
    for (const view of this.views.values()) this.release(stage, view);
    this.views.clear(); this.bursts = []; this.tick = -1;
  }

  private shine(stage: SkillStage, view: TrailView, moment: TrailMoment, look: TrailLook): void {
    if (!look.motion || !look.flash || moment.head >= 1 || moment.fade <= 0) { this.release(stage, view); return; }
    view.glint ??= stage.image("spark", 1);
    const spot = laneSpot(view.plan, moment.head * view.plan.length, 0);
    view.glint?.setVisible(true).setPosition(Math.round(spot.x), Math.round(spot.y)).setRotation(view.plan.angle + Math.PI / 2)
      .setScale(TRAIL_SHOW.glint).setAlpha(this.look.alpha);
  }

  private release(stage: SkillStage, view: TrailView): void {
    if (view.glint) stage.free(view.glint);
    view.glint = undefined;
  }

  private open(trail: ChaosTrail, tick: number): TrailView {
    const seed = Math.imul(trail.id + 1, 0x9e3779b1) ^ 0x51ed, plan = planTrail(trail, seed), reached = trailMoment(trail, tick).head * plan.length;
    const view: TrailView = { plan, startedTick: trail.startedTick, untilTick: trail.untilTick, random: scatter(seed ^ 0x2c1b3c6d),
      seen: 0, stamped: plan.hoofs.filter(hoof => hoof.along <= reached).length, arrived: reached >= plan.length, live: true };
    this.views.set(trail.id, view);
    return view;
  }

  private lane(stage: SkillStage, plan: TrailPlan, paint: (sink: TrailSink) => void): void {
    const { ground, trails } = stage;
    ground.save().translateCanvas(plan.fromX, plan.fromY).rotateCanvas(plan.angle);
    trails.save().translateCanvas(plan.fromX, plan.fromY).rotateCanvas(plan.angle);
    paint((layer, tone, alpha, x, y, wide, high) => {
      if (alpha > 0 && wide > 0 && high > 0) {
        (layer === "ground" ? ground : trails).fillStyle(tone, Math.min(1, alpha) * this.look.alpha)
          .fillRect(x, y, wide, high);
      }
    });
    ground.restore(); trails.restore();
  }

  private throwSparks(stage: SkillStage, view: TrailView, moment: TrailMoment, look: TrailLook): void {
    const { plan } = view, reached = moment.head * plan.length, sparks = look.flash ? SPARKS : CALM_SPARKS, random = view.random;
    for (; view.stamped < plan.hoofs.length && plan.hoofs[view.stamped].along <= reached; view.stamped++) {
      if (view.stamped % TRAIL_SHOW.hoofSparkEvery) continue;
      const hoof = plan.hoofs[view.stamped], back = 30 + random() * 60, across = (random() - .5) * 60;
      stage.mote(laneSpot(plan, hoof.along, hoof.offset), -plan.ux * back - plan.uy * across, -plan.uy * back + plan.ux * across - (30 + random() * 40),
        260, 180 + random() * 140, sparks[view.stamped % sparks.length], look.flash && view.stamped % 2 === 0, 0, 2);
    }
    if (view.arrived || moment.head < 1) return;
    view.arrived = true;
    const end = laneSpot(plan, plan.length, 0);
    for (let index = 0; index < TRAIL_SHOW.arrivalSparks; index++) {
      const turn = plan.angle + (index / (TRAIL_SHOW.arrivalSparks - 1) - .5) * Math.PI * .9, speed = 60 + random() * 70;
      stage.mote(end, Math.cos(turn) * speed, Math.sin(turn) * speed - 30, 240, 200 + random() * 140, sparks[index % sparks.length], false, 0, 2);
    }
  }

  private burstOn(stage: SkillStage, frame: FrameContext, view: TrailView, id: number, moment: TrailMoment, look: TrailLook): void {
    const { plan } = view, body = frame.foe(id) ?? frame.run.enemies.find(enemy => enemy.id === id);
    const spot = body ? { x: body.x, y: body.y - TRAIL_SHOW.lift } : laneSpot(plan, moment.head * plan.length, 0);
    this.bursts.push({ ...spot, at: frame.now, turn: view.random() * Math.PI });
    const sparks = look.flash ? SPARKS : CALM_SPARKS;
    for (let index = 0; index < TRAIL_SHOW.hitSparks; index++) {
      const along = 60 + view.random() * 80, across = (view.random() - .5) * 100;
      stage.mote(spot, plan.ux * along - plan.uy * across, plan.uy * along + plan.ux * across - (20 + view.random() * 40), 280, 200 + view.random() * 120,
        sparks[index % sparks.length], look.flash && index % 2 === 0, 0, 2);
    }
  }

  private drawBursts(stage: SkillStage, look: TrailLook): void {
    this.bursts = this.bursts.filter(burst => look.now - burst.at < TRAIL_SHOW.burst);
    const field = stage.field, arm = Math.round(TRAIL_SHOW.burstReach / 2);
    for (const burst of this.bursts) {
      const share = (look.now - burst.at) / TRAIL_SHOW.burst, far = (3 + (TRAIL_SHOW.burstReach - 3) * (1 - (1 - share) ** 2));
      const x = Math.round(burst.x), y = Math.round(burst.y);
      field.fillStyle(share < .3 ? look.flash ? PALETTE.white : PALETTE.cream : share < .65 ? PALETTE.gold : PALETTE.ember, (1 - share * share) * (look.flash ? 1 : .75) * this.look.alpha);
      const chips = Math.max(2, Math.round(BURST_CHIPS * this.look.density));
      for (let step = 0; step < chips; step++) {
        const turn = burst.turn + step / chips * Math.PI * 2;
        field.fillRect(Math.round(x + Math.cos(turn) * far) - 1, Math.round(y + Math.sin(turn) * far) - 1, 2, 2);
      }
      if (look.flash && this.look.heavy && share < .35) field.fillStyle(PALETTE.white, (1 - share / .35) * this.look.alpha).fillRect(x - arm, y - 1, arm * 2, 2).fillRect(x - 1, y - arm, 2, arm * 2);
    }
  }
}

export const ambient: AmbientShow = new ChargeTrails();
