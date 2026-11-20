import type Phaser from "phaser";
import { CHAOS_RULES } from "../chaos-contract";
import type { ChaosSkillState } from "../chaos-contract";
import { MILITIA_SHOW, MilitiaBodies } from "../chaos-shows/militia";
import type { MilitiaTroop } from "../chaos-shows/militia";
import type { Point } from "../geometry";
import { LAYER, PALETTE } from "../presentation";
import type { General } from "../roster";
import type { Effect } from "../rules";
import { envelope, scatter } from "../skill-show";
import type { ShowChannels } from "../skill-show";
import type { CastContext, FrameContext, Reach, SkillShow, SkillStage } from "../skill-stage";
import { skillVfx } from "../skill-vfx";
import type { SkillVfx } from "../skill-vfx";
import type { MilitiaAmbush } from "../skills-unique";

export const AMBUSH_GENERAL: General = "곽재우";
/** Display-only staging of the militia ambush, in milliseconds from the cast unless named otherwise. The rules stun on the cast
 *  tick and strike on their own clock; these numbers only time the picture laid over them. */
export const AMBUSH_SHOW = {
  /** The last militia breaks cover here and the held stuns start to land. */
  burst: 170,
  /** Stun feedback spreads outward over this interval. */
  ring: 80,
  stagger: 28, insetPixels: 4, shreds: 22, shredsPerTier: 4,
  blade: { far: [18, 46], rise: [16, 40], ms: [300, 520], lag: 40 },
  leaf: { far: [12, 36], rise: [26, 48], ms: [600, 1000], lag: 90 },
  dusk: { rise: 70, hold: 330, fall: 260, share: .8 },
  mark: { rise: 50, hold: 420, fall: 240, still: 380, stillFall: 120 },
} as const;

export type AmbushSpot = Point & { readonly burstAt: number };
export type AmbushShred = { readonly fromX: number; readonly fromY: number; readonly x: number; readonly y: number; readonly rise: number;
  readonly leaveAt: number; readonly landAt: number; readonly leaf: boolean; readonly tone: number };
export type AmbushPlan = { readonly burstAt: number; readonly ringMs: number; readonly spots: readonly AmbushSpot[]; readonly shreds: readonly AmbushShred[] };

/** Where and when the ambush breaks cover. One spot per militia member, pulled inside the real reach if the rules had to move it
 *  out, bursting one after another with the last on the burst; the grass each spot throws up takes off and lands inside the reach
 *  too. With motion off nothing flies and every time is 0. */
export function planAmbush(cast: { readonly seed: number; readonly x: number; readonly y: number; readonly radius: number; readonly tier: number;
  readonly density: number; readonly still: boolean; readonly members: readonly Point[] }): AmbushPlan {
  const random = scatter(cast.seed), limit = Math.max(0, cast.radius - AMBUSH_SHOW.insetPixels);
  const pull = (x: number, y: number): Point => {
    const far = Math.hypot(x - cast.x, y - cast.y);
    return far <= limit ? { x, y } : { x: cast.x + (x - cast.x) * limit / far, y: cast.y + (y - cast.y) * limit / far };
  };
  const burstAt = cast.still ? 0 : AMBUSH_SHOW.burst, last = cast.members.length - 1;
  const spots = cast.members.map((member, index) => ({ ...pull(member.x, member.y), burstAt: Math.max(0, burstAt - (last - index) * AMBUSH_SHOW.stagger) }));
  if (cast.still) return { burstAt, ringMs: 0, spots, shreds: [] };
  const each = Math.round((AMBUSH_SHOW.shreds + AMBUSH_SHOW.shredsPerTier * (cast.tier - 1)) * cast.density);
  const between = ([low, high]: readonly [number, number]) => low + (high - low) * random();
  const shreds = spots.flatMap(spot => Array.from({ length: each }, (_, index) => {
    const leaf = index % 3 === 2, kind = leaf ? AMBUSH_SHOW.leaf : AMBUSH_SHOW.blade;
    const outward = Math.atan2(spot.y - cast.y, spot.x - cast.x), turn = outward + (random() - .5) * 3.6, far = between(kind.far);
    const from = pull(spot.x + (random() - .5) * 8, spot.y + (random() - .5) * 4), to = pull(spot.x + Math.cos(turn) * far, spot.y + Math.sin(turn) * far * .7);
    const leaveAt = spot.burstAt + random() * kind.lag;
    return { fromX: from.x, fromY: from.y, x: to.x, y: to.y, rise: between(kind.rise), leaveAt, landAt: leaveAt + between(kind.ms), leaf, tone: Math.floor(random() * 3) };
  }));
  return { burstAt, ringMs: AMBUSH_SHOW.ring, spots, shreds };
}
/** When a held stun lands: on the burst at the aim, burst + ring at the rim. */
export function ringAt(plan: AmbushPlan, far: number, radius: number): number {
  return plan.burstAt + plan.ringMs * Math.max(0, Math.min(1, far / radius));
}

/** The militia a cast raises all over the field from the first army level on (run.chaosSkills), as the rules hold them this frame.
 *  Only those the rules have started are read, so a wave that is still planned is not drawn. Each stands on its own position with
 *  the cleave radius the rules gave it; its aim and blow are the rules' last strike, for as long as that strike has targets. */
export function castTroop(state: ChaosSkillState): MilitiaTroop {
  const rules = CHAOS_RULES.skills.militia;
  return { tick: state.tick, clock: state.tick + state.remainder * CHAOS_RULES.simulationHz, reach: rules.reach, volleyTick: undefined,
    members: state.events.filter(event => event.kind === "militia" && state.tick >= event.startedTick).map(event => {
      // The rules empty `hits` on every attack tick and fill it only when the militia strikes, one attack period before nextTick.
      const struck = event.hits.length > 0;
      return { id: event.id, x: event.x, y: event.y, startedTick: event.startedTick, untilTick: event.untilTick, cleave: event.radius,
        aimX: struck ? event.to.x : event.x, aimY: struck ? event.to.y : event.y, struckTick: struck ? event.nextTick - rules.attackEvery : -Infinity };
    }) };
}

type Flag = Point & { readonly side: 1 | -1; readonly raisedAt: number; flickAt: number; struckAt: number };
type Stun = { readonly target: number; readonly landsAt: number; readonly lasts: number; popped: boolean; star?: Phaser.GameObjects.Image };
type Ambush = { readonly id: number; readonly reach: Reach; readonly plan: AmbushPlan; readonly castAt: number; readonly channels: ShowChannels;
  readonly vfx: SkillVfx;
  readonly caught: number; readonly random: () => number; readonly flags: Flag[]; stuns: Stun[]; burst: boolean; parted: boolean; leafAt: number };

const GRASS = [PALETTE.leafLight, PALETTE.leafLight, PALETTE.paper] as const;
const LEAVES = [PALETTE.leafLight, PALETTE.paper, PALETTE.brass] as const, GLINTS = [PALETTE.gold, PALETTE.cream, PALETTE.leafLight] as const;
const DUST = [PALETTE.sand, PALETTE.sandLight, PALETTE.cream] as const;
const TUFT = [[-11, 8], [-7, 12], [-3, 9], [0, 14], [4, 10], [8, 13], [11, 8]] as const;
const CROWN = { grow: 50, hold: 110, ms: 170, rays: 9, tall: 34 } as const;
const FLASH_MS = 90;
const FLAG = { pole: 28, rise: 50, snap: 70, wave: 110, long: 11, snapLong: 15, tall: 8 } as const;
const STUN = { pop: 70, lap: 620, grace: 500 } as const;
const GLINT_COUNT = 16, DUST_CHIPS = 4, POP_MS = 100, SMOKE_LAG = 60, ACCENT_MS = 240, PART_SECONDS = .2, FEET = 12, SHOUT_LIFT = 46;
/** The burst is over once the last leaf it threw has landed; after that only the banners and loose leaves stay. */
const SHOW_MS = AMBUSH_SHOW.burst + AMBUSH_SHOW.leaf.lag + AMBUSH_SHOW.leaf.ms[1];

/** Gwak Jae-u's militia ambush: grass rustling on the dimmed ground where the rules hid each militia, then one
 *  burst after another of grass, leaves, smoke and red pennants, with staggered stun feedback for the foes it catches
 *  and their count over the aim. Pennants and loose leaves stay for as long as the rules keep the ambush.
 *  From the first army level the rules hide no ambush: the cast keeps raising militia all over the field, wave after wave, and the
 *  show draws every one the rules have started, where the rules have it, breaking out of the grass (castTroop). */
class AmbushShow implements SkillShow {
  readonly general = AMBUSH_GENERAL;
  readonly accent = PALETTE.red;
  readonly waits = (effect: Effect) => effect.kind === "stun";
  private ambushes: Ambush[] = [];
  private readonly waves = new MilitiaBodies(MILITIA_SHOW.breakout.cast);
  private calledAt = -Infinity;

  cast(stage: SkillStage, { skill, results, run, squad, tier, channels, density }: CastContext): ((effect: Effect) => number) | void {
    const vfx = skillVfx(run, squad);
    const { x, y, value: radius } = skill, still = !channels.motion, castAt = stage.now;
    // The rules have already hidden the militia: this squad's newest ambush is this cast's.
    let entry: MilitiaAmbush | undefined;
    for (const item of run.uniqueSkills ?? []) if (item.kind === "ambush" && item.squad === skill.squad) entry = item;
    if (!entry) {
      // No ambush was hidden, so this cast raised militia waves: update() draws each as the rules start it, under one dusk.
      if (!still) { this.calledAt = castAt; stage.shake(.01, 70); }
      return;
    }
    const seed = Math.floor(stage.random() * 0x100000000);
    const plan = planAmbush({ seed, x, y, radius, tier, density, still, members: entry?.members ?? [] });
    const landsAt = (effect: Effect) => ringAt(plan, Math.hypot(effect.x - x, effect.y - y), radius);
    const stuns = results.filter(item => item.kind === "stun");
    this.ambushes.push({ id: entry?.id ?? -1, reach: stage.reach(x, y, radius), plan, castAt, channels, vfx, caught: stuns.length, random: scatter(seed ^ 0x9e3779b1),
      burst: false, parted: false, leafAt: castAt + SHOW_MS / 2,
      flags: still ? [] : plan.spots.map((spot, index) => ({ x: spot.x, y: spot.y, side: spot.x < x ? -1 : 1, raisedAt: castAt + spot.burstAt,
        flickAt: castAt + spot.burstAt + FLAG.rise, struckAt: entry?.members[index]?.struckAt ?? 0 })),
      stuns: stuns.flatMap(item => item.target === undefined ? [] : [{ target: item.target, landsAt: castAt + landsAt(item), lasts: item.value * 1000, popped: false }]) });
    if (still) return landsAt;
    for (const spot of plan.spots) {
      stage.puff(spot.x, spot.y + 6, spot.burstAt + SMOKE_LAG, 1.5, .75);
      for (let chip = 0; chip < Math.round(DUST_CHIPS * density); chip++)
        stage.mote({ x: spot.x, y: spot.y + FEET }, (stage.random() - .5) * 120, -(30 + stage.random() * 50), 240, 220 + stage.random() * 120, DUST[chip % DUST.length], false, spot.burstAt);
    }
    for (let index = 0; index < Math.round(GLINT_COUNT * density); index++) {
      const turn = stage.random() * Math.PI * 2, far = (radius - 6) * Math.sqrt(stage.random());
      stage.mote({ x: x + Math.cos(turn) * far, y: y + Math.sin(turn) * far }, (stage.random() - .5) * 14, -(16 + stage.random() * 34), -8, 380 + stage.random() * 340,
        GLINTS[index % GLINTS.length], true, ringAt(plan, far, radius) + stage.random() * 120, 2);
    }
    return landsAt;
  }

  update(stage: SkillStage, frame: FrameContext): void {
    if (this.ambushes.length) this.ambushes = this.ambushes.filter(ambush => this.play(stage, ambush, frame));
    const state = frame.run.chaosSkills, called = frame.now - this.calledAt, { dusk } = AMBUSH_SHOW;
    if (frame.channels.motion && called < dusk.rise + dusk.hold + dusk.fall)
      stage.veil(dusk.share * envelope(called, dusk.rise, dusk.hold, dusk.fall), frame.channels);
    this.waves.update(stage, state && castTroop(state), frame);
  }

  clear(stage: SkillStage): void {
    for (const ambush of this.ambushes) this.release(stage, ambush);
    this.ambushes = [];
    this.waves.clear(stage); this.calledAt = -Infinity;
  }

  private release(stage: SkillStage, ambush: Ambush): void {
    for (const stun of ambush.stuns) if (stun.star) { stage.free(stun.star); stun.star = undefined; }
  }

  /** Draws one ambush for this frame; false once nothing of it is left on screen. */
  private play(stage: SkillStage, ambush: Ambush, frame: FrameContext): boolean {
    const { reach, plan, channels } = ambush, { now, run } = frame, age = now - ambush.castAt, since = age - plan.burstAt;
    if (!channels.motion) {
      // Motion off: keep the show lifetime without a ground range indicator.
      return age < AMBUSH_SHOW.mark.still + AMBUSH_SHOW.mark.stillFall;
    }
    const live = run.uniqueSkills?.find((item): item is MilitiaAmbush => item.kind === "ambush" && item.id === ambush.id);
    // The militia bodies fade over their last fifth of a second; the pennants leave with them.
    const left = live ? Math.max(0, Math.min(1, (live.until - run.time) / PART_SECONDS)) : 0;
    stage.veil(AMBUSH_SHOW.dusk.share * envelope(age, AMBUSH_SHOW.dusk.rise, AMBUSH_SHOW.dusk.hold, AMBUSH_SHOW.dusk.fall), channels);
    if (!ambush.burst && since >= 0) {
      ambush.burst = true;
      if (ambush.caught) stage.shout(reach.x, reach.y - SHOUT_LIFT, String(ambush.caught), PALETTE.gold, frame.cssPixel, true);
      // The scene only moves the camera for a stop of 70 or more.
      stage.shake(.01, 70);
    }
    this.cover(stage, ambush, age);
    if (channels.flash && since >= 0 && since < FLASH_MS) {
      stage.ground.fillStyle(PALETTE.cream, .34 * (1 - since / FLASH_MS) * ambush.vfx.alpha);
      for (const spot of reach.cells) stage.ground.fillRect(spot.x, spot.y, 4, 4);
    }
    this.fling(stage, plan, age, ambush.vfx);
    this.pennants(stage, ambush, live, now, age < SHOW_MS ? 1 : Math.ceil(left * 3) / 3);
    this.daze(stage, ambush, frame);
    if (ambush.burst && ambush.flags.length) {
      if (left > 0 && now >= ambush.leafAt) {
        ambush.leafAt = now + ACCENT_MS;
        this.shed(stage, ambush, ambush.flags[Math.floor(ambush.random() * ambush.flags.length)], 1, 0);
      }
      if (!ambush.parted && live && left < 1) {
        ambush.parted = true;
        for (const flag of ambush.flags) { stage.puff(flag.x, flag.y + 4, 0, 1, .6); this.shed(stage, ambush, flag, 3, 30); }
      }
    }
    if (age < SHOW_MS || left > 0) return true;
    this.release(stage, ambush);
    return false;
  }

  /** A tuft rustles over each hidden militia's feet; as it breaks cover the tuft bursts into a crown of grass with a white pop. */
  private cover(stage: SkillStage, { plan, channels, vfx }: Ambush, age: number): void {
    for (const spot of plan.spots) {
      const pop = age - spot.burstAt, x = Math.round(spot.x), foot = Math.round(spot.y + FEET + 2);
      if (pop < 0) {
        const grown = .4 + .6 * age / spot.burstAt, sway = Math.floor(age / 45) % 2 ? 1 : -1;
        TUFT.forEach(([dx, tall], blade) => {
          const height = Math.round(tall * grown);
          stage.field.fillStyle(blade % 2 ? PALETTE.leaf : PALETTE.mossDeep, vfx.alpha).fillRect(x + dx, foot - height, 2, height);
          stage.field.fillStyle(PALETTE.leafLight, vfx.alpha).fillRect(x + dx + (blade % 2 ? sway : -sway), foot - height - 2, 2, 3);
        });
        continue;
      }
      if (pop < CROWN.ms) {
        // Each blade tapers from a thick root to a pale tip inside a dark edge, so the crown reads on dimmed and on bright grass alike.
        const grown = Math.min(1, pop / CROWN.grow), breaking = pop >= CROWN.hold, fade = !breaking ? 1 : pop < (CROWN.hold + CROWN.ms) / 2 ? .66 : .33;
        for (const edge of [1, 0]) for (let ray = 0; ray < CROWN.rays; ray++) {
          const turn = -Math.PI * (.08 + .84 * ray / (CROWN.rays - 1)), long = CROWN.tall * grown * (.55 - .45 * Math.sin(turn)) * (ray % 2 ? .8 : 1);
          for (let far = breaking ? long * .45 : 2; far <= long; far += 2) {
            const wide = far < long * .35 ? 4 : far < long * .7 ? 3 : 2;
            stage.field.fillStyle(edge ? PALETTE.forest : far > long - 5 ? PALETTE.paper : far > long * .45 ? PALETTE.leafLight : PALETTE.leaf, fade * vfx.alpha)
              .fillRect(Math.round(x + Math.cos(turn) * far - wide / 2) - edge, Math.round(foot + Math.sin(turn) * far - wide / 2) - edge, wide + edge * 2, wide + edge * 2);
          }
        }
      }
      if (pop < POP_MS && channels.flash) {
        const early = pop < POP_MS / 2, arm = (early ? 9 : 5), core = early ? 3 : 1, y = Math.round(spot.y + 2);
        stage.trails.fillStyle(early ? PALETTE.white : PALETTE.cream, vfx.alpha)
          .fillRect(x - arm, y - 1, arm * 2, 2).fillRect(x - 1, y - arm, 2, arm * 2).fillRect(x - core, y - core, core * 2, core * 2);
      }
    }
  }

  /** Blades tumble out fast; leaves hang, flutter and blink out. Both fly between planned points of the ground. */
  private fling(stage: SkillStage, plan: AmbushPlan, age: number, vfx: SkillVfx): void {
    for (const shred of plan.shreds.slice(0, Math.ceil(plan.shreds.length * vfx.density))) {
      if (age < shred.leaveAt || age >= shred.landAt) continue;
      const share = (age - shred.leaveAt) / (shred.landAt - shred.leaveAt);
      const x = Math.round(shred.fromX + (shred.x - shred.fromX) * share) - 1;
      const y = Math.round(shred.fromY + (shred.y - shred.fromY) * share - shred.rise * 4 * share * (1 - share)) - 1;
      if (shred.leaf) {
        const flat = Math.floor(age / 90) % 2 === 0;
        stage.field.fillStyle(LEAVES[shred.tone], (share < .7 ? 1 : share < .85 ? .66 : .33) * vfx.alpha).fillRect(x, y, flat ? 3 : 2, flat ? 2 : 3);
        continue;
      }
      const side = share < .6 ? 3 : 2;
      stage.field.fillStyle(GRASS[shred.tone], vfx.alpha).fillRect(x, y, side, side);
    }
  }

  /** A red pennant on a gold-tipped pole behind each militia: the pole shoots up, the cloth snaps out long with a white tip, then
   *  waves. Every strike the rules give that militia snaps it again and shakes a few leaves loose. */
  private pennants(stage: SkillStage, ambush: Ambush, live: MilitiaAmbush | undefined, now: number, alpha: number): void {
    alpha *= ambush.vfx.alpha;
    if (alpha <= 0) return;
    const pen = stage.field, poleHeight = FLAG.pole;
    ambush.flags.forEach((flag, index) => {
      const up = now - flag.raisedAt;
      if (up < 0) return;
      const struck = live?.members[index]?.struckAt ?? flag.struckAt;
      if (struck !== flag.struckAt) { flag.struckAt = struck; flag.flickAt = now; this.shed(stage, ambush, flag, 3, 46); }
      const pole = Math.round(flag.x + flag.side * 9), foot = Math.round(flag.y + 8), tall = Math.min(poleHeight, Math.ceil(poleHeight * up / FLAG.rise / 2) * 2);
      pen.fillStyle(PALETTE.outline, alpha).fillRect(pole - 1, foot - tall - 1, 3, tall + 1);
      pen.fillStyle(PALETTE.timberLight, alpha).fillRect(pole, foot - tall, 1, tall);
      if (up < FLAG.rise) return;
      pen.fillStyle(PALETTE.gold, alpha).fillRect(pole - 1, foot - poleHeight - 2, 3, 2);
      const snapped = now - flag.flickAt < FLAG.snap, long = (snapped ? FLAG.snapLong : FLAG.long), beat = Math.floor(now / FLAG.wave), top = foot - poleHeight + 1;
      // A pennant tapers to its tip, so it never reads as one of the foes' health bars.
      const column = (at: number) => pole + flag.side * (2 + at), high = (at: number) => Math.max(2, FLAG.tall - Math.floor(at * FLAG.tall / long));
      const lift = (at: number) => top + Math.floor((FLAG.tall - high(at)) / 2) + (snapped ? 0 : Math.round(Math.sin(at * .9 - beat * 1.5) * at / long * 1.4));
      pen.fillStyle(PALETTE.outline, alpha).fillRect(column(long), lift(long - 1), 1, high(long - 1));
      for (let at = 0; at < long; at++) pen.fillRect(column(at), lift(at) - 1, 1, high(at) + 2);
      pen.fillStyle(PALETTE.red, alpha);
      for (let at = 0; at < long; at++) pen.fillRect(column(at), lift(at), 1, high(at));
      pen.fillStyle(PALETTE.brick, alpha);
      for (let at = 0; at < long; at++) pen.fillRect(column(at), lift(at) + high(at) - Math.ceil(high(at) / 4), 1, Math.ceil(high(at) / 4));
      if (snapped) pen.fillStyle(PALETTE.white, alpha).fillRect(Math.min(column(long - 1), column(long - 2)), lift(long - 1), 2, high(long - 1));
      else pen.fillStyle(PALETTE.cream, alpha).fillRect(Math.min(column(2), column(3)), lift(2) + 3, 2, 2);
    });
  }

  /** When the staged stun lands on a foe, a star pops over its head, above the bodies and the smoke but under the health
   *  bars; then three sparks circle the head for as long as the foe stays stunned, bright in front and dim behind. */
  private daze(stage: SkillStage, ambush: Ambush, { now, run, foe }: FrameContext): void {
    ambush.stuns = ambush.stuns.filter(stun => {
      const since = now - stun.landsAt;
      if (since < 0) return true;
      const body = foe(stun.target), enemy = run.enemies.find(item => item.id === stun.target);
      const over = !body?.active || !enemy || enemy.hp <= 0 || enemy.stun <= 0 || since >= stun.lasts + STUN.grace;
      if (stun.star && (over || since >= STUN.pop)) { stage.free(stun.star); stun.star = undefined; }
      if (over || !body) return false;
      const size = Math.max(1, Math.min(2, Math.round(body.scaleY))), x = body.x, y = body.y - body.displayHeight * body.originY + 6 * size;
      if (!stun.popped) { stun.popped = true; stun.star = stage.image("spark", 1)?.setDepth(LAYER.bars - 1).setPosition(x, y - 4).setScale(1).setAlpha(ambush.vfx.alpha).setVisible(true); }
      for (let spark = 0; spark < 3; spark++) {
        const turn = now / STUN.lap * Math.PI * 2 + stun.target + spark * Math.PI * 2 / 3, near = Math.sin(turn) > 0, arm = near ? 3 : 2, core = near ? 3 : 2;
        const sx = Math.round(x + Math.cos(turn) * 10 * size), sy = Math.round(y + Math.sin(turn) * 4 * size);
        stage.trails.fillStyle(near ? PALETTE.gold : PALETTE.ember, ambush.vfx.alpha).fillRect(sx - arm, sy, arm * 2 + 1, 1).fillRect(sx, sy - arm, 1, arm * 2 + 1);
        stage.trails.fillStyle(near ? PALETTE.white : PALETTE.gold, ambush.vfx.alpha).fillRect(sx - 1, sy - 1, core, core);
      }
      return true;
    });
  }

  private shed(stage: SkillStage, { random }: Ambush, at: Point, count: number, hop: number): void {
    for (let index = 0; index < count; index++)
      stage.mote({ x: at.x + (random() - .5) * 20, y: at.y + 4 - random() * 18 }, (random() - .5) * 26, -hop * (.4 + random() * .6), 90, 460 + random() * 260,
        LEAVES[Math.floor(random() * LEAVES.length)], true, 0, 2);
  }
}

export const show: SkillShow = new AmbushShow();
