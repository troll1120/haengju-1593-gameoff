import { damageNumberShown, shownAmount } from "../display-scale";
import type Phaser from "phaser";
import { allyAnimation, allyArt } from "../ally-animation";
import { attackFacing, spriteFlipX } from "../attack-facing";
import { CHAOS_RULES } from "../chaos-contract";
import { cloneMoment, cloneRides, tickClock } from "../chaos-shows/charge-trails";
import type { CloneRide } from "../chaos-shows/charge-trails";
import type { Point } from "../geometry";
import { bodyDepth, PALETTE } from "../presentation";
import { GENERAL_SCALE, generalUnit } from "../roster";
import type { General } from "../roster";
import type { Lane, Squad } from "../rules";
import { envelope, scatter } from "../skill-show";
import type { ShowChannels } from "../skill-show";
import type { CastContext, FrameContext, Reach, SkillShow, SkillStage } from "../skill-stage";
import { skillVfx } from "../skill-vfx";
import type { SkillVfx } from "../skill-vfx";

export const CHARGE_GENERAL: General = "신립";
/** Display-only staging of the there-and-back charge, in milliseconds and field pixels. The rules ride the general out and home on
 *  their own ticks and trample whoever he passes; these numbers only shape the picture around that ride. */
export const CHARGE_SHOW = {
  afterglow: 300, dusk: .75,
  mark: { rise: 60, still: 500, stillFall: 120 },
  cry: 180, lance: 84,
  hoofGap: 8, hoofSide: 9, sole: 8, wake: 420,
  streaks: 9, streaksPerTier: 1, streakLength: 40, streakSpread: 56, streakLag: 6, inset: 4,
  echoGap: 22, echoes: 4,
  embers: 18, embersPerTier: 4,
  burst: 220, ring: 280,
  /** His clones at N>=1: how solid each stands, and the afterimages trailing it `echoLag` army ticks apart. */
  clone: { alpha: .85, echoes: 2, echoLag: 1.5, echoAlpha: .45 },
} as const;

export type Hoof = Point & { readonly along: number };
export type Streak = { readonly offset: number; readonly length: number; readonly lag: number; readonly beat: number };
export type Ember = Point & { readonly delay: number };
export type Echo = Point & { readonly ux: number; readonly uy: number };
/** The real reach: every point within `halfWidth` of the line the rules ride from (fromX, fromY) to (toX, toY). */
export type ChargeLane = { readonly fromX: number; readonly fromY: number; readonly toX: number; readonly toY: number; readonly halfWidth: number };
export type ChargePlan = ChargeLane & { readonly length: number; readonly ux: number; readonly uy: number;
  readonly hoofs: readonly Hoof[]; readonly streaks: readonly Streak[]; readonly embers: readonly Ember[] };

/** A field point from lane coordinates: `along` pixels from where the charge starts and `offset` pixels to the side of its spine. */
export function laneSpot(lane: Pick<ChargePlan, "fromX" | "fromY" | "ux" | "uy">, along: number, offset: number): Point {
  return { x: lane.fromX + lane.ux * along - lane.uy * offset, y: lane.fromY + lane.uy * along + lane.ux * offset };
}

/** What one charge's picture can decide on the cast: hoof marks down the spine, speed streaks beside it and the embers of the
 *  afterglow, every one inside the real lane. The ride itself is read from the run each frame. With motion off nothing travels,
 *  so nothing but the lane is planned. */
export function planCharge(cast: ChargeLane & { readonly seed: number; readonly tier: number; readonly density: number; readonly still: boolean }): ChargePlan {
  const dx = cast.toX - cast.fromX, dy = cast.toY - cast.fromY, length = Math.hypot(dx, dy);
  const lane = { fromX: cast.fromX, fromY: cast.fromY, toX: cast.toX, toY: cast.toY, halfWidth: cast.halfWidth, length,
    ux: length ? dx / length : 1, uy: length ? dy / length : 0 };
  if (cast.still) return { ...lane, hoofs: [], streaks: [], embers: [] };
  const random = scatter(cast.seed), side = Math.max(0, cast.halfWidth - CHARGE_SHOW.inset), tiers = cast.tier - 1;
  const hoofCount = Math.floor(length / CHARGE_SHOW.hoofGap * cast.density);
  const hoofs = Array.from({ length: hoofCount }, (_, index) => {
    const along = (index + .25 + random() * .5) * length / hoofCount;
    const spot = laneSpot(lane, along, (index % 2 ? 1 : -1) * Math.min(CHARGE_SHOW.hoofSide, side) * (.4 + random() * .6));
    return { x: spot.x, y: spot.y + CHARGE_SHOW.sole, along };
  });
  const streakCount = Math.round((CHARGE_SHOW.streaks + CHARGE_SHOW.streaksPerTier * tiers) * cast.density);
  const streaks = Array.from({ length: streakCount }, (_, index) => ({ offset: ((index + .2 + random() * .6) / streakCount * 2 - 1) * side,
    length: CHARGE_SHOW.streakLength + random() * CHARGE_SHOW.streakSpread, lag: CHARGE_SHOW.streakLag + random() * 14, beat: random() }));
  const emberCount = Math.round((CHARGE_SHOW.embers + CHARGE_SHOW.embersPerTier * tiers) * cast.density);
  const embers = Array.from({ length: emberCount }, () => ({ ...laneSpot(lane, random() * length, (random() * 2 - 1) * side), delay: random() * 60 }));
  return { ...lane, hoofs, streaks, embers };
}

/** The stretch of lane one streak covers behind a general `along` pixels down it, riding out (1) or home (-1). It starts `lag`
 *  behind him and is cut where the real lane ends; there is none until he has ridden that far. */
export function streakSpan(plan: ChargePlan, streak: Streak, along: number, heading: 1 | -1): { readonly from: number; readonly to: number } | undefined {
  const from = along - heading * streak.lag;
  return from < 0 || from > plan.length ? undefined : { from, to: Math.max(0, Math.min(plan.length, from - heading * streak.length)) };
}

/** Where the afterimages stand: every `gap` pixels back along the path the general was drawn on (newest point last), each facing
 *  the way he was riding there. The spacing is measured along the path, so the echoes follow him round the turn. */
export function echoSpots(path: readonly Point[], gap: number, count: number): Echo[] {
  const spots: Echo[] = [];
  let walked = 0;
  for (let index = path.length - 1; index > 0 && spots.length < count; index--) {
    const head = path[index], tail = path[index - 1], span = Math.hypot(head.x - tail.x, head.y - tail.y);
    for (let due = gap * (spots.length + 1); span > 0 && due <= walked + span && spots.length < count; due = gap * (spots.length + 1)) {
      const share = (due - walked) / span;
      spots.push({ x: head.x + (tail.x - head.x) * share, y: head.y + (tail.y - head.y) * share, ux: (head.x - tail.x) / span, uy: (head.y - tail.y) / span });
    }
    walked += span;
  }
  return spots;
}

/** One drawn body of a clone: order 0 is the clone where the rules have it, the higher orders its afterimages where it rode `order *
 *  echoLag` ticks before. `ridden` is the ticks of riding behind that body, which steps its walk. */
export type CloneBody = Point & { readonly order: number; readonly alpha: number; readonly ridden: number };

/** The bodies of one clone at army tick `tick`: itself on its real lane by the share of its ride done, then
 *  resting at `to` and fading out by untilTick, with afterimages trailing it while it moves. With motion off nothing travels: one still
 *  body stands in the middle of the real lane for the event's life, where a banner over either end cannot hide it. */
export function cloneBodies(clone: CloneRide, tick: number, moving: boolean): CloneBody[] {
  const moment = cloneMoment(clone, tick), look = CHARGE_SHOW.clone;
  if (moment.fade <= 0) return [];
  if (!moving) return [{ x: (clone.from.x + clone.to.x) / 2, y: (clone.from.y + clone.to.y) / 2, order: 0, alpha: look.alpha * moment.fade, ridden: 0 }];
  const bodies: CloneBody[] = [];
  for (let order = 0; order <= look.echoes; order++) {
    const past = cloneMoment(clone, tick - order * look.echoLag);
    if (order && (past.since < 0 || past.head >= moment.head)) continue;
    bodies.push({ x: clone.from.x + (clone.to.x - clone.from.x) * past.head, y: clone.from.y + (clone.to.y - clone.from.y) * past.head, order,
      alpha: (order ? look.echoAlpha * (1 - order / (look.echoes + 1)) : look.alpha) * moment.fade, ridden: past.head * past.sweep });
  }
  return bodies;
}

/** The golds a clone wears, by how bright each pixel of his own picture is; his dark lines keep the game's outline colour. */
const GILT = [[.2, PALETTE.outline], [.36, PALETTE.brass], [.62, PALETTE.gold], [1, PALETTE.cream]] as const;

/** His picture recoloured for a clone, in place on RGBA bytes: every drawn pixel takes the gold of its own brightness and keeps its
 *  alpha, so the shape and its lines stay his and none of his red is left to be read as him, a foe or a danger mark. */
export function gildPixels(pixels: Uint8ClampedArray): void {
  for (let at = 0; at < pixels.length; at += 4) {
    if (!pixels[at + 3]) continue;
    const light = (pixels[at] * 299 + pixels[at + 1] * 587 + pixels[at + 2] * 114) / 255000;
    const paint = (GILT.find(([below]) => light < below) ?? GILT[GILT.length - 1])[1];
    pixels[at] = paint >> 16; pixels[at + 1] = paint >> 8 & 255; pixels[at + 2] = paint & 255;
  }
}

type Glint = { image: Phaser.GameObjects.Image; x: number; y: number; vx: number; vy: number; bornAt: number; life: number; big: boolean };
type Ride = { readonly plan: ChargePlan; readonly reach: Reach; readonly squad: Readonly<Squad>; readonly channels: ShowChannels; readonly density: number; readonly vfx: SkillVfx;
  readonly castAt: number; readonly lit: number[]; readonly path: Point[];
  lane: Lane | null; heard?: readonly number[]; seen: number; dealt: number; home: boolean; shaken: boolean; turnAt: number; endAt: number; next: number; pace: number;
  bursts: (Point & { at: number })[]; glints: Glint[] };

const BODY = 10, HEAD = 40, FEET = 13, PATH_POINTS = 28, RAYS = 12, RING_CELLS = 28;
const DUST = [PALETTE.sand, PALETTE.sandLight, PALETTE.cream] as const, SPARKS = [PALETTE.white, PALETTE.gold, PALETTE.flame] as const;
const STREAK = [PALETTE.white, PALETTE.cream, PALETTE.gold, PALETTE.ember] as const, WAKE = [PALETTE.cream, PALETTE.gold, PALETTE.brass, PALETTE.sand] as const;
const GHOST = [PALETTE.cream, PALETTE.gold, PALETTE.brass, PALETTE.ember] as const;
/** The afterimage: a helmeted swordsman leaning into his run, facing right, two field pixels to a cell, as tall as he is drawn. */
const FIGURE = [
  "..#.......", "..#...#...", "..#..###..", "..#.#####.", "..#.#####.", "...######.", "..#######.", ".########.", ".#########", ".#########",
  ".########.", "..######..", "..#######.", ".########.", ".########.", ".########.", "..##..##..", "..##..##..", ".##....##.", ".##.....##",
] as const;
const FIGURE_WIDE = FIGURE[0].length;
const FIGURE_RUNS = FIGURE.flatMap((row, y) => [...row.matchAll(/#+/g)].map(run => ({ x: run.index ?? 0, y, wide: run[0].length })));
/** His clones wear his own walking body, at the scale and lift the scene draws him with. */
const ART = generalUnit(CHARGE_GENERAL), CLONE_SCALE = Math.max(1, Math.round(GENERAL_SCALE * (allyArt(ART).full ? .5 : 1))), CLONE_LIFT = 16 * (GENERAL_SCALE - 1);

/** 신립's there-and-back charge as a cavalry breakthrough: the real lane lights under a dusk, a war cry and a lance glint send him
 *  off, streaks, afterimages, hoof marks and dust follow his drawn ride, every trampled foe bursts as the rules strike it, the far
 *  turn throws a dust ring, and the summed damage rises when he is home. It holds nothing: it only reads the ride the rules make. */
class ChargeShow implements SkillShow {
  readonly general = CHARGE_GENERAL;
  readonly accent = PALETTE.gold;
  private rides: Ride[] = [];
  private readonly ranks = new Map<number, (Phaser.GameObjects.Image | undefined)[]>();
  private readonly cloneTick = tickClock();

  cast(stage: SkillStage, { skill, run, squad, from, tier, channels, density }: CastContext): void {
    const vfx = skillVfx(run, squad);
    const fromX = skill.fromX ?? from.x, fromY = skill.fromY ?? from.y;
    const plan = planCharge({ seed: Math.floor(stage.random() * 0x100000000), fromX, fromY, toX: skill.x, toY: skill.y, halfWidth: skill.value,
      tier, density, still: !channels.motion });
    const ride: Ride = { plan, reach: stage.reach(skill.x, skill.y, skill.value, { x: fromX, y: fromY }), squad, channels, density, vfx, castAt: stage.now,
      lit: plan.hoofs.map(() => -Infinity), path: [], lane: squad.lane, seen: 0, dealt: 0, home: false, shaken: false, turnAt: -1, endAt: -1, next: 0, pace: 1, bursts: [], glints: [] };
    this.rides.push(ride);
    if (!channels.motion) return;
    const chest = { x: fromX, y: fromY - BODY }, pace = CHARGE_SHOW.lance / CHARGE_SHOW.cry;
    for (let index = 0; index < Math.round(14 * density); index++) {
      const turn = stage.random() * Math.PI * 2, speed = 50 + stage.random() * 70;
      stage.mote(chest, Math.cos(turn) * speed, Math.sin(turn) * speed * .7 - 20, 60, 260 + stage.random() * 160, SPARKS[index % SPARKS.length], true, 0, 1 + index % 2);
    }
    for (let index = 0; index < Math.round(10 * density); index++)
      stage.mote({ x: fromX, y: fromY + CHARGE_SHOW.sole }, -plan.ux * (30 + stage.random() * 70) + (stage.random() - .5) * 50, -plan.uy * (30 + stage.random() * 70) - (30 + stage.random() * 50),
        240, 260 + stage.random() * 160, DUST[index % DUST.length]);
    stage.puff(fromX - plan.ux * 8, fromY - plan.uy * 8 + 4, 0, 1, .7); stage.puff(fromX - plan.ux * 16, fromY - plan.uy * 16 + 6, 70, .8, .6);
    this.glint(stage, ride, chest.x + plan.ux * 10, chest.y + plan.uy * 10, plan.ux * pace, plan.uy * pace, CHARGE_SHOW.cry, true);
  }

  update(stage: SkillStage, frame: FrameContext): void {
    if (this.rides.length) this.rides = this.rides.filter(ride => ride.channels.motion ? this.follow(stage, ride, frame) : this.still(stage, ride, frame));
    this.clones(stage, frame);
  }

  clear(stage: SkillStage): void {
    for (const ride of this.rides) for (const glint of ride.glints) stage.free(glint.image);
    this.rides = [];
    this.dismiss(stage, []);
  }

  /** The clones in run.chaosSkills, each a walking body in gold where the rules have it, with
   *  fainter afterimages behind. They are read from the run every frame; a run without them draws and holds nothing here. */
  private clones(stage: SkillStage, { run, now, channels }: FrameContext): void {
    const state = run.chaosSkills, rides = cloneRides(run);
    this.dismiss(stage, rides);
    if (!state) return;
    const tick = this.cloneTick(state, now);
    for (const ride of rides) {
      const vfx = skillVfx(run, run.squads.find(squad => squad.id === ride.squad));
      const facing = attackFacing(ride.from, ride.to), bodies = cloneBodies(ride, tick, channels.motion).filter(body => body.order === 0 || body.order <= vfx.tier), images = this.ranks.get(ride.id) ?? [];
      const walk = allyAnimation(ART, { moving: true, attacking: false, hurt: false, down: false, direction: facing.direction });
      const sheet = this.gilded(stage, walk.frames[0].key);
      if (!sheet) continue;
      this.ranks.set(ride.id, images);
      bodies.forEach((body, index) => {
        const frame = walk.frames[Math.floor(body.ridden / CHAOS_RULES.simulationHz * walk.frameRate) % walk.frames.length].frame;
        (images[index] ??= stage.image(sheet, frame))?.setTexture(sheet, frame).setFlipX(spriteFlipX(ART, facing.flipX)).setScale(CLONE_SCALE)
          .setPosition(Math.round(body.x), Math.round(body.y) - CLONE_LIFT).setAlpha(body.alpha * vfx.alpha).setDepth(bodyDepth(body.y) - .5 - body.order * .01).setVisible(true);
      });
      for (let index = bodies.length; index < images.length; index++) images[index]?.setVisible(false);
    }
  }

  /** His sheet in the clones' golds, made once in the scene's textures: the canvas renderer cannot tint a picture as it draws it. */
  private gilded(stage: SkillStage, key: string): string | undefined {
    const gilt = `${key}-gilt`, textures = stage.scene.textures;
    if (textures.exists(gilt)) return gilt;
    const source = textures.get(key).getSourceImage(), cell = textures.getFrame(key, 0), canvas = document.createElement("canvas");
    if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) return undefined;
    canvas.width = source.width; canvas.height = source.height;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    gildPixels(pixels.data);
    context.putImageData(pixels, 0, 0);
    const texture = textures.create(gilt, canvas, canvas.width, canvas.height);
    if (!texture) return undefined;
    textures.addSpriteSheet(gilt, texture, { frameWidth: cell.width, frameHeight: cell.height });
    return gilt;
  }

  /** Gives back the pictures of every clone the rules no longer ride. */
  private dismiss(stage: SkillStage, rides: readonly Pick<CloneRide, "id">[]): void {
    for (const [id, images] of this.ranks) {
      if (rides.some(ride => ride.id === id)) continue;
      for (const image of images) if (image) stage.free(image);
      this.ranks.delete(id);
    }
  }

  /** Motion off: the real reach stands for a moment and the total is called when the rules bring him home. Nothing travels, shakes or flashes. */
  private still(stage: SkillStage, ride: Ride, { now, cssPixel, at }: FrameContext): boolean {
    const lane = ride.squad.state === "charge" ? ride.squad.lane : null, age = now - ride.castAt;
    if (lane) ride.dealt = lane.dealt;
    else if (ride.endAt < 0) {
      ride.endAt = now;
      const spot = at(ride.squad);
      if (ride.dealt > 0 && damageNumberShown(true)) stage.shout(spot.x, spot.y - HEAD, String(shownAmount(ride.dealt)), PALETTE.gold, cssPixel, false);
    }
    stage.mark(ride.reach, { age, since: -1, alpha: envelope(age, 0, CHARGE_SHOW.mark.still, CHARGE_SHOW.mark.stillFall), channels: ride.channels });
    return ride.endAt < 0 || age < CHARGE_SHOW.mark.still + CHARGE_SHOW.mark.stillFall;
  }

  private follow(stage: SkillStage, ride: Ride, frame: FrameContext): boolean {
    const { now } = frame, { plan, squad, channels } = ride, age = now - ride.castAt, at = frame.at(squad);
    if (ride.endAt < 0) {
      // The trampled list is read before the lane, so the tick that turns or ends the ride keeps the foes it struck.
      const fresh = this.trampled(ride), lane = squad.state === "charge" ? squad.lane : null;
      for (const id of fresh) this.burst(stage, ride, frame, id, at);
      if (fresh.length && !ride.shaken) { ride.shaken = true; stage.shake(.014, 90); }
      if (!lane) this.arrive(stage, ride, frame, at);
      else {
        if (lane !== ride.lane) { ride.lane = lane; this.turnHome(stage, ride, now); }
        ride.dealt = lane.dealt;
      }
    }
    const last = ride.path[ride.path.length - 1], moved = last ? Math.hypot(at.x - last.x, at.y - last.y) : 1;
    if (moved >= 1) { ride.path.push({ x: at.x, y: at.y }); if (ride.path.length > PATH_POINTS) ride.path.shift(); }
    ride.pace = ride.endAt < 0 && moved >= 2 ? 1 : ride.pace * .7;
    const along = Math.max(0, Math.min(plan.length, (at.x - plan.fromX) * plan.ux + (at.y - plan.fromY) * plan.uy));
    if (ride.endAt < 0) {
      if (ride.home) for (; ride.next >= 0 && plan.hoofs[ride.next].along >= along; ride.next--) this.stamp(stage, ride, ride.next, -1);
      else for (; ride.next < plan.hoofs.length && plan.hoofs[ride.next].along <= along; ride.next++) this.stamp(stage, ride, ride.next, 1);
    }
    const fade = ride.endAt < 0 ? 1 : Math.max(0, 1 - (now - ride.endAt) / CHARGE_SHOW.afterglow), lit = Math.min(1, age / CHARGE_SHOW.mark.rise) * fade;
    stage.veil(CHARGE_SHOW.dusk * lit, channels);
    stage.mark(ride.reach, { age, since: ride.turnAt < 0 ? -1 : now - ride.turnAt, alpha: lit, channels });
    if (channels.flash) this.ground(stage, ride, now);
    this.air(stage, ride, now, along, fade);
    ride.glints = ride.glints.filter(glint => {
      const lived = now - glint.bornAt, share = lived / glint.life;
      if (share >= 1) { stage.free(glint.image); return false; }
      glint.image.setVisible(true).setPosition(Math.round(glint.x + glint.vx * lived), Math.round(glint.y + glint.vy * lived)).setScale((glint.big && share < .4 ? 2 : 1)).setAlpha((1 - share * share) * ride.vfx.alpha);
      return true;
    });
    if (fade > 0) return true;
    for (const glint of ride.glints) stage.free(glint.image);
    return false;
  }

  /** The foes the rules trampled since the last frame. The rules start a new list at the turn, so the old one is emptied first. */
  private trampled(ride: Ride): number[] {
    const list = ride.squad.trampled, fresh = ride.heard ? ride.heard.slice(ride.seen) : [];
    if (list !== ride.heard) { ride.heard = list; fresh.push(...list); }
    ride.seen = list.length;
    return fresh;
  }

  private burst(stage: SkillStage, ride: Ride, frame: FrameContext, id: number, rider: Point): void {
    const body = frame.foe(id) ?? frame.run.enemies.find(enemy => enemy.id === id) ?? rider, spot = { x: body.x, y: body.y - 6 };
    const { plan } = ride, heading = ride.home ? -1 : 1;
    ride.bursts.push({ ...spot, at: frame.now });
    this.glint(stage, ride, spot.x, spot.y, 0, 0, 150, false);
    for (let index = 0; index < Math.round(6 * ride.density); index++) {
      const along = heading * (50 + stage.random() * 90), across = (stage.random() - .5) * 150;
      stage.mote(spot, plan.ux * along - plan.uy * across, plan.uy * along + plan.ux * across - (30 + stage.random() * 50), 300, 220 + stage.random() * 140,
        SPARKS[index % SPARKS.length], index % 2 === 0, 0, 2);
    }
  }

  private turnHome(stage: SkillStage, ride: Ride, now: number): void {
    const { plan } = ride, count = Math.round(22 * ride.density), pace = CHARGE_SHOW.lance / CHARGE_SHOW.cry;
    ride.home = true; ride.shaken = false; ride.turnAt = now;
    // He is drawn up to a tick short of the far end, so the marks he did not reach light with the turn.
    for (; ride.next < plan.hoofs.length; ride.next++) ride.lit[ride.next] = now;
    ride.next = plan.hoofs.length - 1;
    for (let index = 0; index < count; index++) {
      const turn = index / count * Math.PI * 2 + stage.random() * .3, speed = 60 + stage.random() * 50;
      stage.mote({ x: plan.toX, y: plan.toY + CHARGE_SHOW.sole }, Math.cos(turn) * speed, Math.sin(turn) * speed * .6 - 24, 180, 300 + stage.random() * 160, DUST[index % DUST.length]);
    }
    for (let index = 0; index < 3; index++) stage.puff(plan.toX + (index - 1) * 12, plan.toY + 4 - index % 2 * 6, index * 50, 1, .7);
    this.glint(stage, ride, plan.toX - plan.ux * 10, plan.toY - plan.uy * 10 - BODY, -plan.ux * pace, -plan.uy * pace, CHARGE_SHOW.cry, true);
  }

  private arrive(stage: SkillStage, ride: Ride, { now, cssPixel }: FrameContext, at: Point): void {
    const { plan } = ride, heading = ride.home ? -1 : 1;
    ride.endAt = now;
    if (ride.dealt > 0 && damageNumberShown(true)) stage.shout(at.x, at.y - HEAD, String(shownAmount(ride.dealt)), PALETTE.gold, cssPixel, true);
    for (let index = 0; index < Math.round(12 * ride.density); index++) {
      const along = heading * (30 + stage.random() * 80), across = (stage.random() - .5) * 60;
      stage.mote({ x: at.x, y: at.y + CHARGE_SHOW.sole }, plan.ux * along - plan.uy * across, plan.uy * along + plan.ux * across - (30 + stage.random() * 50), 240, 240 + stage.random() * 140, DUST[index % DUST.length]);
    }
    stage.puff(at.x + heading * plan.ux * 8, at.y + heading * plan.uy * 8 + 4, 0, 1, .7);
    plan.embers.forEach((ember, index) => stage.mote(ember, (stage.random() - .5) * 14, -(24 + stage.random() * 30), -8, 180 + stage.random() * 100,
      SPARKS[1 + index % 2], true, ember.delay, 1 + index % 2));
  }

  private stamp(stage: SkillStage, ride: Ride, index: number, heading: 1 | -1): void {
    const { plan } = ride, hoof = plan.hoofs[index], back = () => -heading * (20 + stage.random() * 55), aside = () => (stage.random() - .5) * 70;
    ride.lit[index] = stage.now;
    for (let chip = 0; chip < 3; chip++) {
      const along = back(), across = aside();
      stage.mote(hoof, plan.ux * along - plan.uy * across, plan.uy * along + plan.ux * across - (26 + stage.random() * 46), 240, 240 + stage.random() * 160,
        DUST[(index + chip) % DUST.length]);
    }
    if (index % 3) return;
    const along = back() * 2.4, across = aside() * 1.6;
    stage.mote(hoof, plan.ux * along - plan.uy * across, plan.uy * along + plan.ux * across - 30, 300, 150 + stage.random() * 110, SPARKS[index % SPARKS.length], true, 0, 1 + index % 2);
  }

  /** Under the bodies in 4px cells, and never outside the real lane: the turn's dust ring stops a cell short of the rim. */
  private ground(stage: SkillStage, ride: Ride, now: number): void {
    const { plan } = ride, cell = (x: number, y: number) => stage.ground.fillRect(Math.floor(x / 4) * 4, Math.floor(y / 4) * 4, 4, 4);
    plan.hoofs.forEach((hoof, index) => {
      if (index % Math.max(1, Math.round(1 / ride.vfx.density))) return;
      const cooled = (now - ride.lit[index]) / CHARGE_SHOW.wake;
      if (cooled >= 1) return;
      stage.ground.fillStyle(WAKE[Math.floor(cooled * WAKE.length)], (1 - cooled) * .85 * ride.vfx.alpha);
      cell(hoof.x, hoof.y); cell(hoof.x - plan.ux * 4, hoof.y - plan.uy * 4);
    });
    const spread = ride.turnAt < 0 ? 1 : (now - ride.turnAt) / CHARGE_SHOW.ring;
    if (spread >= 1) return;
    const far = 6 + Math.max(0, plan.halfWidth - 10) * (1 - (1 - spread) ** 2);
    const dots = Math.ceil(RING_CELLS * ride.vfx.density);
    for (let step = 0; step < dots; step++) {
      const turn = step / dots * Math.PI * 2;
      stage.ground.fillStyle(step % 2 ? PALETTE.cream : PALETTE.sandLight, (1 - spread) * .9 * ride.vfx.alpha);
      cell(plan.toX + Math.cos(turn) * far, plan.toY + Math.sin(turn) * far * .62);
    }
  }

  private air(stage: SkillStage, ride: Ride, now: number, along: number, fade: number): void {
    const { plan, channels, vfx } = ride, cry = (now - ride.castAt) / CHARGE_SHOW.cry, heading = ride.home ? -1 : 1;
    const chip = (layer: Phaser.GameObjects.Graphics, x: number, y: number) => layer.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    if (cry < 1) {
      const out = 1 - (1 - cry) ** 2, x = plan.fromX, y = plan.fromY - BODY, rays = Math.ceil(RAYS * vfx.density);
      if (channels.flash) for (let ray = 0; ray < rays; ray++) for (let step = 0; step < SPARKS.length; step++) {
        const turn = ray / rays * Math.PI * 2, far = (ray % 2 ? 6 + 20 * out : 8 + 32 * out) - step * 4;
        if (far > 2) chip(stage.field.fillStyle(SPARKS[step], (1 - cry) * (1 - step * .3) * vfx.alpha), x + Math.cos(turn) * far, y + Math.sin(turn) * far * .8);
      }
      for (let far = 10; far < 10 + CHARGE_SHOW.lance * out; far += 2)
        chip(stage.trails.fillStyle(far > CHARGE_SHOW.lance * out ? PALETTE.white : PALETTE.cream, (1 - cry) * vfx.alpha), x + plan.ux * far, y + plan.uy * far);
    }
    if (ride.pace > .05) for (const streak of plan.streaks.slice(0, Math.ceil(plan.streaks.length * vfx.density))) {
      const span = Math.floor(now / 45 + streak.beat * 8) % 4 ? streakSpan(plan, streak, along, heading) : undefined;
      if (!span) continue;
      for (let back = 0; back < Math.abs(span.to - span.from); back += 2) {
        const band = Math.floor(back / streak.length * STREAK.length), spot = laneSpot(plan, span.from - heading * back, streak.offset);
        chip(stage.trails.fillStyle(STREAK[band], (1 - band / STREAK.length) * .85 * ride.pace * vfx.alpha), spot.x, spot.y);
      }
    }
    if (ride.pace > .05) for (let back = 0; back < 24; back++) for (const side of [-1, 1]) {
      const spot = laneSpot(plan, along + heading * (24 - back), side * back * .75);
      chip(stage.trails.fillStyle(back >= 14 ? PALETTE.gold : back >= 6 ? PALETTE.cream : PALETTE.white, (1 - back / 30) * ride.pace * vfx.alpha), spot.x, spot.y - BODY);
    }
    echoSpots(ride.path, CHARGE_SHOW.echoGap, Math.round(CHARGE_SHOW.echoes * vfx.density)).forEach((spot, order) => {
      stage.trails.fillStyle(GHOST[order], .6 * (1 - order / CHARGE_SHOW.echoes) * fade * vfx.alpha);
      for (const run of FIGURE_RUNS) stage.trails.fillRect(Math.round(spot.x) + ((spot.ux < 0 ? FIGURE_WIDE - run.x - run.wide : run.x) - FIGURE_WIDE / 2) * 2,
        Math.round(spot.y) + FEET + (run.y - FIGURE.length) * 2, run.wide * 2, 2);
    });
    ride.bursts = ride.bursts.filter(burst => now - burst.at < CHARGE_SHOW.burst);
    for (const burst of ride.bursts) {
      const share = (now - burst.at) / CHARGE_SHOW.burst, far = (5 + 16 * (1 - (1 - share) ** 2));
      stage.field.fillStyle(share < .3 ? PALETTE.white : share < .65 ? PALETTE.gold : PALETTE.ember, (1 - share * share) * vfx.alpha);
      for (let step = 0; step < 10; step++) chip(stage.field, burst.x + Math.cos(step / 10 * Math.PI * 2 + burst.at) * far, burst.y + Math.sin(step / 10 * Math.PI * 2 + burst.at) * far);
      if (share >= .4) continue;
      stage.field.fillStyle(PALETTE.white, (1 - share / .4) * vfx.alpha).fillRect(Math.round(burst.x) - 7, Math.round(burst.y) - 1, 14, 2).fillRect(Math.round(burst.x) - 1, Math.round(burst.y) - 7, 2, 14);
    }
  }

  private glint(stage: SkillStage, ride: Ride, x: number, y: number, vx: number, vy: number, life: number, big: boolean): void {
    const image = stage.image("spark", 1);
    if (image) ride.glints.push({ image, x, y, vx, vy, bornAt: stage.now, life, big });
  }
}

export const show: SkillShow = new ChargeShow();
