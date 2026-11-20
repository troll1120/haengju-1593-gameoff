import { allyAnimation, allyAttackFrame } from "../ally-animation";
import { spriteFlipX } from "../attack-facing";
import { BPH_CLASS_ART } from "../bph-art";
import { CHAOS_RULES } from "../chaos-contract";
import type { ChaosMilitia, ChaosMods, ChaosState } from "../chaos-contract";
import type { Point } from "../geometry";
import { FRIENDLY_ATTACK, friendlyStrikeOffset, MOTION, stepHop, stepsWalked } from "../motion";
import { bodyDepth, PALETTE } from "../presentation";
import { scatter } from "../skill-show";
import type { ShowChannels } from "../skill-show";
import { POOL } from "../skill-stage";
import type { AmbientShow, FrameContext, SkillStage } from "../skill-stage";
import { skillVfx } from "../skill-vfx";

/** Display-only timing (ms) and decoration sizes (px). Every reach, radius, lifetime and clock the rules use is read from the run
 *  and the chaos contract each frame; nothing here stands for a rules number. */
export const MILITIA_SHOW = {
  rise: 150, sink: 250,
  /** How a militia breaks out of the grass. The army's rise one at a time where a kill calls them: a small crown and a puff of
   *  smoke. A cast raises a whole wave on one tick all over the field: a taller crown, more grass and leaves that hang in the air.
   *  Reserve the reach outline and slash trails for army militia. */
  breakout: {
    army: { crown: { grow: 40, hold: 70, ms: 150, rays: 9, tall: 23 }, flash: 80, chips: 6, leaves: 0, smoke: true, drawCombatGuides: true },
    cast: { crown: { grow: 50, hold: 200, ms: 360, rays: 9, tall: 34 }, flash: 120, chips: 8, leaves: 4, smoke: false, drawCombatGuides: false },
  },
  /** Share of the stage's motes one troop may have in the air at once. */
  motes: 1 / 6,
  spark: 110, ring: 170, ringGrow: 70, chips: 4, volleyChips: 9, cry: 170,
  renew: 210, rustle: 230,
  /** One rim dot every `gap` pixels, marching one gap along every `march` ms. */
  net: { gap: 14, march: 700, alpha: .3 },
  patch: .38, feet: 12,
} as const;

export type Breakout = typeof MILITIA_SHOW.breakout[keyof typeof MILITIA_SHOW.breakout];
export type Chip = { readonly x: number; readonly y: number; readonly vx: number; readonly vy: number; readonly pull: number;
  readonly life: number; readonly tone: number; readonly leaf: boolean };
export type BlowPlan = { readonly from: Point; readonly x: number; readonly y: number; readonly heading: number; readonly ring: number;
  readonly volley: boolean; readonly chips: readonly Chip[] };
export type MilitiaPose = { readonly x: number; readonly y: number; readonly frame: number; readonly flipX: boolean; readonly angle: number;
  /** Share of the body below the grass line: 0 standing, 1 hidden. */
  readonly buried: number };
/** One real militia as its picture reads it. The rules' army militia (run.chaos.militia) already has these fields and a cast's
 *  militia (run.chaosSkills) is read into them. `cleave` is the rules' radius round the point it strikes. */
export type MilitiaMember = Readonly<Pick<ChaosMilitia, "id" | "x" | "y" | "startedTick" | "untilTick" | "aimX" | "aimY" | "struckTick">>
  & { readonly cleave: number };
/** A group of real militia for one frame. `tick` is the rules' whole tick, all a still picture reads; `clock` is the same clock
 *  with the time already gathered toward the next tick, in ticks. `reach` is how far the rules let each member strike. */
export type MilitiaTroop = { readonly tick: number; readonly clock: number; readonly reach: number;
  readonly members: readonly MilitiaMember[]; readonly volleyTick: number | undefined };
type Pen = { fillStyle(color: number, alpha?: number): Pen; fillRect(x: number, y: number, width: number, height: number): Pen };
type Picture = { readonly frame: { readonly width: number; readonly height: number };
  setFrame(frame: number): Picture; setFlipX(value: boolean): Picture; setCrop(x?: number, y?: number, width?: number, height?: number): Picture;
  setVisible(value: boolean): Picture; setPosition(x: number, y: number): Picture; setAngle(degrees: number): Picture; setDepth(value: number): Picture };
/** What a troop's picture uses of the stage: its three drawing layers, pooled pictures, motes and smoke. */
export type MilitiaCanvas = { readonly ground: Pen; readonly field: Pen; readonly trails: Pen;
  image(key: string, frame: number): Picture | undefined; free(picture: Picture): void;
  mote(at: Point, vx: number, vy: number, pull: number, life: number, paint: number, twinkles: boolean, delay: number, size: number): void;
  puff(x: number, y: number, delay: number, scale: number, alpha: number): void };
/** The motes one troop may have in the air at once, so the army, a cast's waves and every other show keep their part of the stage's. */
export const TROOP_MOTES = Math.floor(POOL.motes * MILITIA_SHOW.motes);
type MilitiaMods = Extract<ChaosMods, { readonly general: "곽재우" }>;

const ART = BPH_CLASS_ART.militia;
const pose = (moving: boolean, attacking: boolean) => allyAnimation(ART, { moving, attacking, hurt: false, down: false, direction: "side" });
const IDLE = pose(false, false), WALK = pose(true, false), ATTACK = pose(false, true);
/** The rules' militia blow is labelled a spearman swing, so the pose and lunge last the army spearmen's contact and recovery. */
const BLOW_MS = MOTION.spearContactMs + MOTION.spearRecoveryMs;
/** A body steps for two rules ticks after the rules last moved it. */
const WALK_MS = 2000 / CHAOS_RULES.simulationHz;
/** A sideways step shorter than this many pixels does not turn a body round. */
const TURN = .25;
const CELL = 4, HAND = 4, HEAD = 18, SWAY_MS = 180, RUSTLE_BEAT = 45;
const GRASS = [PALETTE.leafLight, PALETTE.leaf, PALETTE.paper] as const, LEAVES = [PALETTE.leafLight, PALETTE.paper, PALETTE.brass] as const;
const BRIGHT = [PALETTE.white, PALETTE.gold, PALETTE.cream] as const, DULL = [PALETTE.gold, PALETTE.ember, PALETTE.brass] as const;
const BLADES = [[-10, 4], [-7, 6], [6, 5], [9, 3]] as const, TUFT = [[-7, 7], [-4, 10], [-1, 8], [2, 11], [5, 7]] as const;

export function militiaMods(state: Pick<ChaosState, "mods"> | undefined): MilitiaMods | undefined {
  const mods = state?.mods;
  return mods?.general === "곽재우" ? mods : undefined;
}

/** 곽재우's army militia as the rules hold them this frame (run.chaos.militia), with the reach and cleave of the army's level. */
export function armyTroop(state: ChaosState, mods: MilitiaMods, volleyTick?: number): MilitiaTroop {
  // remainder is the run time (s) already gathered toward the next tick, so `clock` is the rules' clock in fractional ticks.
  return { tick: state.tick, clock: state.tick + state.remainder * CHAOS_RULES.simulationHz, reach: mods.reach, volleyTick,
    members: state.militia.map(member => ({ ...member, cleave: mods.cleaveRadius })) };
}

/** The outline of the ground the army holds: each militia's real reach circle, less the arcs inside another's, as dots `gap` pixels
 *  apart shifted along by `phase` (a share of one gap). */
export function reachNet(members: readonly Point[], reach: number, gap: number, phase: number): Point[] {
  const dots: Point[] = [];
  if (reach <= 0) return dots;
  const count = Math.max(1, Math.round(Math.PI * 2 * reach / gap));
  members.forEach((member, index) => {
    if (members.some((other, at) => at < index && other.x === member.x && other.y === member.y)) return;
    for (let dot = 0; dot < count; dot++) {
      const turn = (dot + phase) / count * Math.PI * 2, x = member.x + Math.cos(turn) * reach, y = member.y + Math.sin(turn) * reach;
      if (!members.some((other, at) => at !== index && Math.hypot(x - other.x, y - other.y) < reach)) dots.push({ x, y });
    }
  });
  return dots;
}
export const netPhase = (now: number, channels: ShowChannels): number => channels.motion ? now / MILITIA_SHOW.net.march % 1 : 0;

/** A blow at the point the rules aimed it: a ring out to the rules' cleave radius and chips that fly straight from the struck point
 *  and stop inside that radius. Motion off keeps only the place and heading. */
export function planBlow(blow: { readonly seed: number; readonly from: Point; readonly aim: Point; readonly cleave: number; readonly volley: boolean;
  readonly density: number; readonly channels: ShowChannels }): BlowPlan {
  const { from, aim, cleave, volley } = blow, heading = Math.atan2(aim.y - from.y, aim.x - from.x);
  const place = { from: { x: from.x, y: from.y }, x: aim.x, y: aim.y, heading, volley };
  if (!blow.channels.motion) return { ...place, ring: 0, chips: [] };
  const random = scatter(blow.seed), count = Math.round((volley ? MILITIA_SHOW.volleyChips : MILITIA_SHOW.chips) * blow.density);
  const chips = Array.from({ length: count }, (_, index) => {
    const turn = heading + (random() - .5) * Math.PI * 1.4, far = cleave * (.3 + .55 * random()), life = 150 + random() * 110;
    return { x: aim.x, y: aim.y, vx: Math.cos(turn) * far * 1000 / life, vy: Math.sin(turn) * far * 1000 / life, pull: 0, life, tone: index % 3, leaf: false };
  });
  return { ...place, ring: cleave, chips };
}

/** What a militia throws up as it breaks out at `at`: grass that hops to both sides and falls back, then the leaves of a cast's
 *  breakout, which rise and hang. Motion off throws nothing. */
export function planPop(pop: { readonly seed: number; readonly at: Point; readonly breakout: Breakout; readonly density: number;
  readonly channels: ShowChannels }): Chip[] {
  if (!pop.channels.motion) return [];
  const random = scatter(pop.seed);
  const grass = Array.from({ length: Math.round(pop.breakout.chips * pop.density) }, (_, index) => {
    const side = index % 2 ? 1 : -1;
    return { x: pop.at.x + side * (2 + random() * 6), y: pop.at.y, vx: side * (14 + random() * 50), vy: -(50 + random() * 46), pull: 300,
      life: 260 + random() * 130, tone: index % 3, leaf: false };
  });
  const leaves = Array.from({ length: Math.round(pop.breakout.leaves * pop.density) }, (_, index) =>
    ({ x: pop.at.x + (random() - .5) * 18, y: pop.at.y - random() * 12, vx: (random() - .5) * 70, vy: -(40 + random() * 60), pull: 110,
      life: 520 + random() * 380, tone: index % 3, leaf: true }));
  return [...grass, ...leaves];
}

/** One body on the rules' own coordinates: climbing out of the grass after it appears, sinking as its lifetime ends, stepping while
 *  the rules move it, and in its attack pose with a lunge along the blow after each strike. Motion off keeps only the attack pose. */
export function militiaPose(body: { readonly x: number; readonly y: number; readonly faceLeft: boolean; readonly moving: boolean;
  readonly gait: number; readonly bornMs: number; readonly leftMs: number; readonly blowMs: number; readonly heading: number;
  readonly still: boolean }): MilitiaPose {
  const striking = body.blowMs >= 0 && body.blowMs < BLOW_MS, flipX = spriteFlipX(ART, body.faceLeft), idle = IDLE.frames[0].frame ?? 0;
  const attack = allyAttackFrame(ATTACK, { windupProgress: -1, sinceReleaseMs: body.still ? 0 : Math.max(0, body.blowMs),
    contactMs: MOTION.spearContactMs, recoveryMs: MOTION.spearRecoveryMs }).frame ?? 0;
  if (body.still) return { x: body.x, y: body.y, frame: striking ? attack : idle, flipX, angle: 0, buried: 0 };
  const walking = body.moving && !striking;
  const lunge = striking ? friendlyStrikeOffset("spearman", { windupProgress: -1, sinceReleaseMs: body.blowMs }) : 0;
  const rising = Math.max(0, 1 - body.bornMs / MILITIA_SHOW.rise), sinking = Math.max(0, 1 - body.leftMs / MILITIA_SHOW.sink);
  const angle = striking ? (body.faceLeft ? -1 : 1) * FRIENDLY_ATTACK.spearman.swing * (1 - body.blowMs / BLOW_MS)
    : walking ? Math.sin(body.gait / MOTION.stride * Math.PI) * MOTION.lean : 0;
  const frame = striking ? attack : walking ? WALK.frames[stepsWalked(body.gait) % WALK.frames.length].frame ?? 0 : idle;
  return { x: body.x + Math.cos(body.heading) * lunge, y: body.y + Math.sin(body.heading) * lunge - (walking ? stepHop(body.gait) : 0),
    frame, flipX, angle, buried: Math.min(1, Math.max(rising * rising, sinking * sinking)) };
}

/** A militia with motion off: standing on its rules position, in its attack pose for the whole ticks its last blow lasts. It reads
 *  the troop's whole tick and never the time between two ticks, so a still picture changes only when the rules change. */
export function stillPose(member: MilitiaMember, troop: MilitiaTroop, faceLeft: boolean): MilitiaPose {
  return militiaPose({ x: member.x, y: member.y, faceLeft, moving: false, gait: 0, bornMs: Infinity, leftMs: Infinity,
    blowMs: (troop.tick - member.struckTick) * 1000 / CHAOS_RULES.simulationHz, heading: 0, still: true });
}

type Body = {
  readonly startedTick: number; readonly bornAt: number; readonly popAt: Point; readonly random: () => number;
  picture?: Picture;
  x: number; y: number; gait: number; movedAt: number; faceLeft: boolean;
  struckTick: number; blowAt: number; heading: number; volley: boolean; untilTick: number; renewAt: number;
};
type Blow = BlowPlan & { readonly at: number };
type Thrown = Chip & { readonly paint: number; readonly twinkles: boolean };
type Moment = Pick<FrameContext, "now" | "channels"> & Partial<Pick<FrameContext, "run">>;
type Rustle = Point & { readonly seenAt: number; lastAt: number };
const seedOf = (random: () => number) => Math.floor(random() * 0x100000000);

/** The bodies of one troop of real militia. Lasting pictures stay faint on stage.ground, under the danger marks: the outline of
 *  the troop's real reach and trampled grass at each militia's feet. The bodies are pooled pictures depth-sorted like units; they
 *  come from the stage's large image pool, because one cast alone keeps more militia alive than the sprite pool holds. Everything
 *  over them (grass crown, slash, spark, war cry, glint) is small and short, and what the troop throws into the air never passes
 *  its share of the stage's motes. With motion off a body only stands where the rules have it (stillPose). */
export class MilitiaBodies {
  private look = { tier: 3, alpha: 1, density: 1, heavy: true };
  private readonly bodies = new Map<number, Body>();
  private blows: Blow[] = [];
  /** When each mote this troop threw lands, on the stage's clock. */
  private aloft: number[] = [];

  constructor(private readonly breakout: Breakout) {}

  /** Draws the troop for this frame. Without a troop it gives back whatever it still holds. */
  update(stage: MilitiaCanvas, troop: MilitiaTroop | undefined, moment: Moment): void {
    this.look = moment.run ? skillVfx(moment.run, moment.run.squads.find(squad => squad.general === "곽재우"))
      : { tier: 3, alpha: 1, density: 1, heavy: true };
    if (!troop) {
      if (this.bodies.size || this.blows.length) this.clear(stage);
      return;
    }
    const { now, channels } = moment, since = (tick: number) => (troop.clock - tick) * 1000 / CHAOS_RULES.simulationHz;
    if (this.breakout.drawCombatGuides) this.net(stage, troop, netPhase(now, channels));
    // Militia that break out on one frame share what is left of the troop's motes, so each throws as much as its neighbours.
    const risers = channels.motion ? troop.members.filter(member => this.bodies.get(member.id)?.startedTick !== member.startedTick).length : 0;
    const density = risers ? Math.min(1, this.room(now) / (risers * (this.breakout.chips + this.breakout.leaves))) : 1;
    const live = new Set<number>();
    for (const member of troop.members) {
      live.add(member.id);
      const body = this.follow(stage, member, { bornMs: since(member.startedTick), density }, moment);
      if (member.untilTick > body.untilTick && Number.isFinite(body.untilTick)) {
        body.renewAt = now;
        if (channels.motion) this.shed(stage, body, { count: 3, now, paint: PALETTE.gold });
      }
      body.untilTick = member.untilTick;
      if (member.struckTick !== body.struckTick) {
        body.struckTick = member.struckTick;
        const ago = since(member.struckTick);
        if (member.struckTick >= member.startedTick && ago < BLOW_MS)
          this.blow(stage, body, member, { at: now - ago, volley: member.struckTick === troop.volleyTick }, moment);
      }
      this.patch(stage, member, channels.motion ? Math.floor((now + member.x * 7) / SWAY_MS) % 2 : 0);
      if (!channels.motion) { this.place(stage, body, stillPose(member, troop, body.faceLeft)); continue; }
      const drawn = militiaPose({ x: member.x, y: member.y, faceLeft: body.faceLeft, moving: now - body.movedAt < WALK_MS, gait: body.gait,
        bornMs: now - body.bornAt, leftMs: -since(member.untilTick), blowMs: now - body.blowAt, heading: body.heading, still: false });
      this.adorn(stage, body, drawn, moment);
      this.place(stage, body, drawn);
    }
    for (const [id, body] of this.bodies) if (!live.has(id)) { this.leave(stage, body, moment); this.bodies.delete(id); }
    if (this.blows.length) this.blows = this.blows.filter(blow => this.strike(stage, blow, now, channels));
  }

  clear(stage: MilitiaCanvas): void {
    for (const body of this.bodies.values()) this.release(stage, body);
    this.bodies.clear(); this.blows = [];
  }

  private release(stage: MilitiaCanvas, body: Body): void {
    if (body.picture) stage.free(body.picture);
    body.picture = undefined;
  }

  /** How many more motes the troop's share of the stage's has room for. */
  private room(now: number): number {
    this.aloft = this.aloft.filter(lands => lands > now);
    return Math.max(0, TROOP_MOTES - this.aloft.length);
  }

  /** Throws the chips the troop's share still has room for. */
  private fling(stage: MilitiaCanvas, now: number, chips: readonly Thrown[]): void {
    for (const chip of chips.slice(0, this.room(now))) {
      stage.mote(chip, chip.vx, chip.vy, chip.pull, chip.life, chip.paint, chip.twinkles, 0, 2);
      this.aloft.push(now + chip.life);
    }
  }

  private follow(stage: MilitiaCanvas, member: MilitiaMember, rise: { readonly bornMs: number; readonly density: number }, { now, channels }: Moment): Body {
    const { bornMs, density } = rise;
    let body = this.bodies.get(member.id);
    if (!body || body.startedTick !== member.startedTick) {
      if (body) this.release(stage, body);
      body = { startedTick: member.startedTick, bornAt: now - bornMs, popAt: { x: member.x, y: member.y },
        random: scatter(Math.imul(member.id, 0x9e3779b1) ^ member.startedTick), x: member.x, y: member.y, gait: 0, movedAt: -Infinity,
        faceLeft: member.aimX < member.x, struckTick: -Infinity, blowAt: -Infinity, heading: 0, volley: false, untilTick: member.untilTick, renewAt: -Infinity };
      this.bodies.set(member.id, body);
      if (channels.motion && bornMs < this.breakout.crown.ms) {
        const foot = { x: member.x, y: member.y + MILITIA_SHOW.feet };
        if (this.breakout.smoke) stage.puff(foot.x, foot.y - 2, 0, .75, .55);
        this.fling(stage, now, planPop({ seed: seedOf(body.random), at: foot, breakout: this.breakout, density, channels })
          .map(chip => ({ ...chip, paint: (chip.leaf ? LEAVES : GRASS)[chip.tone], twinkles: chip.leaf })));
      }
    }
    const dx = member.x - body.x, walked = Math.hypot(dx, member.y - body.y);
    if (walked > 0) {
      body.gait += walked; body.movedAt = now; body.x = member.x; body.y = member.y;
      // A cast's militia has no aim until it strikes, so a body first faces the way the rules walk it.
      if (Math.abs(dx) >= TURN) body.faceLeft = dx < 0;
    }
    if (Math.abs(member.aimX - member.x) >= 1) body.faceLeft = member.aimX < member.x;
    return body;
  }

  private blow(stage: MilitiaCanvas, body: Body, member: MilitiaMember, struck: { readonly at: number; readonly volley: boolean }, { now, channels }: Moment): void {
    const { at, volley } = struck;
    body.blowAt = at; body.volley = volley;
    body.heading = Math.atan2(member.aimY - member.y, member.aimX - member.x);
    if (!channels.motion) return;
    const plan = planBlow({ seed: seedOf(body.random), from: member, aim: { x: member.aimX, y: member.aimY }, cleave: member.cleave, volley, density: 1, channels });
    this.blows.push({ ...plan, at });
    const paints = channels.flash ? BRIGHT : DULL;
    this.fling(stage, now, plan.chips.map(chip => ({ ...chip, paint: paints[chip.tone], twinkles: volley })));
  }

  /** The short pictures over a moving body: its breakout crown, renewal glint and volley cry. */
  private adorn(stage: MilitiaCanvas, body: Body, drawn: MilitiaPose, { now, channels }: Moment): void {
    const popMs = now - body.bornAt, renewMs = now - body.renewAt, blowMs = now - body.blowAt, foot = body.popAt.y + MILITIA_SHOW.feet;
    if (popMs < this.breakout.crown.ms) this.crown(stage, { x: body.popAt.x, y: foot }, popMs, channels.flash);
    if (this.look.heavy && renewMs < MILITIA_SHOW.renew) this.twinkle(stage, body.x, body.y - HEAD, renewMs, channels.flash);
    if (this.look.heavy && body.volley && blowMs < MILITIA_SHOW.cry) this.cry(stage, drawn.x, drawn.y - HEAD, blowMs, channels.flash);
  }

  private place(stage: MilitiaCanvas, body: Body, drawn: MilitiaPose): void {
    const picture = body.picture ??= stage.image(ART, drawn.frame);
    if (!picture) return;
    picture.setFrame(drawn.frame).setFlipX(drawn.flipX);
    const height = picture.frame.height, buried = Math.round(drawn.buried * height);
    if (buried >= height) { picture.setVisible(false); return; }
    // The buried rows are cropped off and the body lowered by as many, so the cut stays on the grass line while it climbs out.
    if (buried > 0) picture.setCrop(0, 0, picture.frame.width, height - buried); else picture.setCrop();
    picture.setPosition(drawn.x, drawn.y + buried).setAngle(drawn.angle).setDepth(bodyDepth(body.y)).setVisible(true);
  }

  private net(stage: MilitiaCanvas, { members, reach }: MilitiaTroop, phase: number): void {
    if (!members.length) return;
    stage.ground.fillStyle(PALETTE.gold, MILITIA_SHOW.net.alpha);
    for (const dot of reachNet(members, reach, MILITIA_SHOW.net.gap, phase))
      stage.ground.fillRect(Math.floor(dot.x / CELL) * CELL, Math.floor(dot.y / CELL) * CELL, CELL, CELL);
  }

  private patch(stage: MilitiaCanvas, at: Point, sway: number): void {
    const left = Math.round(at.x), foot = Math.round(at.y + MILITIA_SHOW.feet);
    stage.ground.fillStyle(PALETTE.forest, MILITIA_SHOW.patch * this.look.alpha).fillRect(left - 9, foot - 1, 18, 3).fillRect(left - 6, foot - 3, 12, 2);
    stage.ground.fillStyle(PALETTE.leafLight, MILITIA_SHOW.patch * this.look.alpha);
    for (const [dx, tall] of BLADES) stage.ground.fillRect(left + dx + (dx < 0 ? -sway : sway), foot - tall, 2, tall);
  }

  private crown(stage: MilitiaCanvas, at: Point, popMs: number, flash: boolean): void {
    const { grow, hold, ms, rays, tall } = this.breakout.crown, left = Math.round(at.x), base = Math.round(at.y);
    const grown = Math.min(1, popMs / grow), breaking = popMs >= hold, fade = !breaking ? 1 : popMs < (hold + ms) / 2 ? .66 : .33;
    const count = Math.max(3, Math.ceil(rays * this.look.density));
    for (const edge of [1, 0]) for (let ray = 0; ray < count; ray++) {
      const turn = -Math.PI * (.1 + .8 * ray / (count - 1)), long = tall * grown * (.6 - .4 * Math.sin(turn)) * (ray % 2 ? .75 : 1);
      for (let far = breaking ? long * .45 : 2; far <= long; far += 2) {
        const wide = far < long * .4 ? 3 : 2;
        stage.field.fillStyle(edge ? PALETTE.forest : far > long - 4 ? PALETTE.paper : PALETTE.leafLight, fade * this.look.alpha)
          .fillRect(Math.round(left + Math.cos(turn) * far - wide / 2) - edge, Math.round(base + Math.sin(turn) * far - wide / 2) - edge, wide + edge * 2, wide + edge * 2);
      }
    }
    if (!flash || !this.look.heavy || popMs >= this.breakout.flash) return;
    const early = popMs < this.breakout.flash / 2, arm = early ? 8 : 5, core = early ? 3 : 1, y = base - 6;
    stage.trails.fillStyle(early ? PALETTE.white : PALETTE.cream, 1)
      .fillRect(left - arm, y - 1, arm * 2, 2).fillRect(left - 1, y - arm, 2, arm * 2).fillRect(left - core, y - core, core * 2, core * 2);
  }

  /** Draws one blow for this frame; false once it has played out. */
  private strike(stage: MilitiaCanvas, blow: Blow, now: number, channels: ShowChannels): boolean {
    const age = now - blow.at, sparkMs = MILITIA_SHOW.spark * (blow.volley ? 1.6 : 1);
    if (!channels.motion || age >= Math.max(sparkMs, MILITIA_SHOW.ring)) return false;
    const x = Math.round(blow.x), y = Math.round(blow.y - HAND);
    // Like the army spearmen's slash trail, the slash shows only with flashes on.
    if (this.breakout.drawCombatGuides && channels.flash && this.look.heavy && age < MOTION.spearContactMs) {
      const dx = blow.x - blow.from.x, dy = blow.y - blow.from.y, far = Math.hypot(dx, dy), reached = far * Math.min(1, age / MOTION.spearContactMs + .25);
      for (let back = 0; back <= Math.min(reached, 16); back += 2) {
        const along = (reached - back) / (far || 1);
        stage.trails.fillStyle(back < 6 ? PALETTE.white : PALETTE.cream, 1 - back / 18)
          .fillRect(Math.round(blow.from.x + dx * along) - 1, Math.round(blow.from.y - HAND + dy * along) - 1, 2, 2);
      }
    }
    if (age < sparkMs) {
      // A dark edge keeps the spark readable over the white flash of the foe it struck.
      const fade = 1 - age / sparkMs, arm = Math.max(2, Math.round((blow.volley ? 10 : 7) * fade)), core = blow.volley && this.look.heavy ? 2 : 1;
      stage.trails.fillStyle(PALETTE.outline, .8 * this.look.alpha).fillRect(x - arm - 1, y - 1, arm * 2 + 3, 3).fillRect(x - 1, y - arm - 1, 3, arm * 2 + 3);
      stage.trails.fillStyle(channels.flash ? PALETTE.gold : PALETTE.ember, this.look.alpha).fillRect(x - arm, y, arm * 2 + 1, 1).fillRect(x, y - arm, 1, arm * 2 + 1);
      stage.trails.fillStyle(channels.flash ? PALETTE.white : PALETTE.gold, this.look.alpha).fillRect(x - core, y - core, core * 2 + 1, core * 2 + 1);
    }
    if (this.breakout.drawCombatGuides && age < MILITIA_SHOW.ring && blow.ring > 0) {
      const grown = Math.min(1, age / MILITIA_SHOW.ringGrow), front = blow.ring * (1 - (1 - grown) ** 2);
      const alpha = (blow.volley ? .85 : .7) * (1 - age / MILITIA_SHOW.ring);
      stage.ground.fillStyle(channels.flash ? PALETTE.cream : PALETTE.gold, alpha);
      this.ring(stage, blow.x, blow.y, front);
      if (this.look.heavy) {
        stage.ground.fillStyle(PALETTE.gold, alpha * .6 * this.look.alpha);
        this.ring(stage, blow.x, blow.y, front - CELL);
        if (blow.volley) this.ring(stage, blow.x, blow.y, front - CELL * 2);
      }
    }
    return true;
  }

  private ring(stage: MilitiaCanvas, x: number, y: number, radius: number): void {
    if (radius <= 0) return;
    const count = Math.max(6, Math.ceil(Math.PI * 2 * radius / CELL));
    for (let step = 0; step < count; step++) {
      const turn = step / count * Math.PI * 2;
      stage.ground.fillRect(Math.floor((x + Math.cos(turn) * radius) / CELL) * CELL, Math.floor((y + Math.sin(turn) * radius) / CELL) * CELL, CELL, CELL);
    }
  }

  private twinkle(stage: MilitiaCanvas, x: number, y: number, age: number, flash: boolean): void {
    const fade = 1 - age / MILITIA_SHOW.renew, arm = Math.max(1, Math.round(4 * fade)), left = Math.round(x), top = Math.round(y - 4 * (1 - fade));
    stage.trails.fillStyle(PALETTE.gold, 1).fillRect(left - arm, top, arm * 2 + 1, 1).fillRect(left, top - arm, 1, arm * 2 + 1);
    stage.trails.fillStyle(flash ? PALETTE.white : PALETTE.cream, 1).fillRect(left, top, 1, 1);
  }

  private cry(stage: MilitiaCanvas, x: number, y: number, age: number, flash: boolean): void {
    const share = age / MILITIA_SHOW.cry, out = 3 + 6 * share, long = Math.max(2, Math.round(6 * (1 - share)));
    stage.trails.fillStyle(flash ? PALETTE.white : PALETTE.gold, 1 - share * .5);
    for (const lean of [-.55, 0, .55]) {
      const turn = -Math.PI / 2 + lean;
      for (let step = 0; step < long; step += 2)
        stage.trails.fillRect(Math.round(x + Math.cos(turn) * (out + step)) - 1, Math.round(y + Math.sin(turn) * (out + step)) - 1, 2, 2);
    }
  }

  private leave(stage: MilitiaCanvas, body: Body, { now, channels }: Moment): void {
    if (channels.motion) {
      if (this.breakout.smoke) stage.puff(body.x, body.y + MILITIA_SHOW.feet - 6, 0, 1, .7);
      this.shed(stage, body, { count: 4, now });
    }
    this.release(stage, body);
  }

  private shed(stage: MilitiaCanvas, body: Body, leaves: { readonly count: number; readonly now: number; readonly paint?: number }): void {
    const { random } = body;
    this.fling(stage, leaves.now, Array.from({ length: leaves.count }, (_, leaf) => ({ x: body.x + (random() - .5) * 16, y: body.y + MILITIA_SHOW.feet - random() * 18,
      vx: (random() - .5) * 30, vy: -(10 + random() * 26), pull: 90, life: 420 + random() * 200, tone: leaf % LEAVES.length, leaf: true,
      paint: leaves.paint ?? LEAVES[leaf % LEAVES.length], twinkles: true })));
  }
}

/** 곽재우's army militia (run.chaos.militia and pendingMilitia): the troop's bodies, and a rustle in the grass where a kill calls
 *  one up. */
class MilitiaShow implements AmbientShow {
  readonly id = "militia";
  readonly general = "곽재우";
  private readonly army = new MilitiaBodies(MILITIA_SHOW.breakout.army);
  private readonly rustles = new Map<string, Rustle>();
  private group?: number;

  update(stage: SkillStage, frame: FrameContext): void {
    const state = frame.run.chaos, mods = militiaMods(state);
    if (!state || !mods) {
      this.army.update(stage, undefined, frame);
      this.rustles.clear(); this.group = undefined;
      return;
    }
    // The rules advance militiaGroup on a tick where a group strikes together, and only then, so a blow on that tick is the volley.
    const volleyTick = this.group !== undefined && state.militiaGroup !== this.group ? state.tick - state.tick % mods.groupEvery : undefined;
    this.group = state.militiaGroup;
    this.army.update(stage, armyTroop(state, mods, volleyTick), frame);
    this.rustle(stage, state.pendingMilitia, frame.now, frame.channels);
  }

  clear(stage: SkillStage): void {
    this.army.clear(stage);
    this.rustles.clear(); this.group = undefined;
  }

  /** A pending militia lives one rules tick, so its rustle is held for `MILITIA_SHOW.rustle` after it was first seen. */
  private rustle(stage: SkillStage, pending: readonly { readonly at: Point; readonly dueTick: number }[], now: number, channels: ShowChannels): void {
    for (const spawn of pending) {
      const key = `${spawn.at.x}:${spawn.at.y}:${spawn.dueTick}`, known = this.rustles.get(key);
      if (known) known.lastAt = now; else this.rustles.set(key, { x: spawn.at.x, y: spawn.at.y, seenAt: now, lastAt: now });
    }
    for (const [key, rustle] of this.rustles) {
      const age = now - rustle.seenAt;
      if (now > rustle.lastAt && age >= MILITIA_SHOW.rustle) { this.rustles.delete(key); continue; }
      if (!channels.motion) continue;
      const x = Math.round(rustle.x), foot = Math.round(rustle.y + MILITIA_SHOW.feet), grown = Math.min(1, .5 + age / MILITIA_SHOW.rustle);
      const sway = Math.floor(age / RUSTLE_BEAT) % 2 ? 1 : -1;
      TUFT.forEach(([dx, tall], blade) => {
        const high = Math.round(tall * grown);
        stage.ground.fillStyle(blade % 2 ? PALETTE.leaf : PALETTE.mossDeep, .85).fillRect(x + dx, foot - high, 2, high);
        stage.ground.fillStyle(PALETTE.leafLight, .85).fillRect(x + dx + (blade % 2 ? sway : -sway), foot - high - 2, 2, 3);
      });
    }
  }
}

export const ambient: AmbientShow = new MilitiaShow();
