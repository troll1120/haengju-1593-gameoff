import { damageNumberShown, shownAmount } from "../display-scale";
import type Phaser from "phaser";
import type { ChaosSkillState } from "../chaos-contract";
import { StompPictures } from "../chaos-shows/stomp-rings";
import type { StompScene } from "../chaos-shows/stomp-rings";
import type { Point } from "../geometry";
import { bodyDepth, PALETTE } from "../presentation";
import type { General } from "../roster";
import type { Effect } from "../rules";
import { envelope, HELD_KINDS, scatter } from "../skill-show";
import type { ShowChannels } from "../skill-show";
import type { CastContext, FrameContext, Reach, SkillShow, SkillStage } from "../skill-stage";
import { skillVfx } from "../skill-vfx";
import type { SkillVfx } from "../skill-vfx";

export const JINGAK_GENERAL: General = "황진";
/** Display-only staging of the stomp, in milliseconds from the cast unless named otherwise. The rules resolve the whole sweep on
 *  the cast tick; these numbers only time the picture that follows it. Dust is drawn in for `gather`, then the foot lands and the
 *  shockwave takes `wave` to run from the foot to the real reach. */
export const JINGAK_SHOW = {
  gather: 150, wave: 220, length: 900, fade: 300, still: { hold: 400, fall: 100 },
  cracks: 8, cracksPerTier: 1, crackStart: 6,
  dust: [{ share: .3, count: 5 }, { share: .62, count: 7 }, { share: .94, count: 9 }],
} as const;

/** How far from the general the shockwave's front is `since` milliseconds after the stomp: it bursts out fast and slows onto the real reach. */
export function waveFront(since: number, radius: number): number {
  const run = Math.max(0, Math.min(1, since / JINGAK_SHOW.wave));
  return radius * (1.5 * run - .5 * run * run);
}
/** When the shockwave reaches `distance` from the general, in milliseconds from the cast: waveFront read backwards. With motion off, at once. */
export function waveAt(distance: number, radius: number, still: boolean): number {
  if (still) return 0;
  const share = radius > 0 ? Math.max(0, Math.min(1, distance / radius)) : 1;
  return JINGAK_SHOW.gather + JINGAK_SHOW.wave * (1.5 - Math.sqrt(2.25 - 2 * share));
}

export type CrackCell = { readonly x: number; readonly y: number; readonly far: number };
export type DustSpot = { readonly x: number; readonly y: number; readonly at: number };
export type JingakPlan = { readonly cracks: readonly CrackCell[]; readonly dust: readonly DustSpot[] };
/** Where one stomp splits the ground and throws up dust. Cracks are chains of 4px ground cells that wander out from the foot, two
 *  cells wide at first, and never leave the real radius; each dust spot rises as the shockwave reaches it. With motion off nothing is planned. */
export function planJingak(cast: { readonly seed: number; readonly x: number; readonly y: number; readonly radius: number; readonly tier: number;
  readonly density: number; readonly still: boolean }): JingakPlan {
  if (cast.still) return { cracks: [], dust: [] };
  // A cell's corner is under three pixels from its centre, so a cell this far in lies wholly inside the real radius.
  const random = scatter(cast.seed), reach = Math.max(0, cast.radius - 3), cells = new Map<string, CrackCell>();
  const lay = (px: number, py: number): boolean => {
    const x = Math.floor(px / 4) * 4, y = Math.floor(py / 4) * 4, far = Math.hypot(x + 2 - cast.x, y + 2 - cast.y);
    if (far > reach) return false;
    if (!cells.has(`${x},${y}`)) cells.set(`${x},${y}`, { x, y, far });
    return true;
  };
  const count = Math.round((JINGAK_SHOW.cracks + JINGAK_SHOW.cracksPerTier * (cast.tier - 1)) * cast.density);
  for (let index = 0; index < count; index++) {
    const bearing = (index + .2 + random() * .6) / count * Math.PI * 2, long = index % 2 === 0;
    const length = reach * (long ? .8 + random() * .2 : .5 + random() * .22);
    let turn = bearing, px = cast.x + Math.cos(bearing) * JINGAK_SHOW.crackStart, py = cast.y + Math.sin(bearing) * JINGAK_SHOW.crackStart;
    for (let walked = JINGAK_SHOW.crackStart; walked < length; walked += 4) {
      turn = bearing + Math.max(-.55, Math.min(.55, turn - bearing + (random() - .5) * 1.1));
      px += Math.cos(turn) * 4; py += Math.sin(turn) * 4;
      if (!lay(px, py)) break;
      const thickTrunk = walked < length * .3, sprouts = walked > length * .35 && random() < .14;
      if (thickTrunk) lay(px - Math.sin(turn) * 4, py + Math.cos(turn) * 4);
      if (!sprouts) continue;
      const side = turn + (random() < .5 ? -1 : 1) * (.7 + random() * .5), twigs = 2 + Math.floor(random() * 3);
      for (let step = 1; step <= twigs && lay(px + Math.cos(side) * 4 * step, py + Math.sin(side) * 4 * step); step++);
    }
  }
  const dust: DustSpot[] = [];
  for (const ring of JINGAK_SHOW.dust) for (let index = 0, spots = Math.round(ring.count * cast.density); index < spots; index++) {
    const turn = (index + random()) / spots * Math.PI * 2, far = reach * ring.share * (.9 + random() * .1);
    dust.push({ x: cast.x + Math.cos(turn) * far, y: cast.y + Math.sin(turn) * far, at: waveAt(far, cast.radius, false) });
  }
  return { cracks: [...cells.values()].sort((a, b) => a.far - b.far), dust };
}

/** The cast's other stomps exactly as the rules scheduled them: every started `stomps` attack on its real landing spot with its real
 *  reach, on the rules' own ticks. A wave still to start is not shown, and N0 schedules none, so it keeps only the one stomp above. */
export function castStomps(skills: ChaosSkillState | undefined): StompScene {
  const tick = skills?.tick ?? 0, started = (skills?.events ?? []).filter(event => event.kind === "stomps" && event.startedTick <= tick);
  return { tick, remainder: skills?.remainder ?? 0, stomps: started.map(event => ({ id: event.id, x: event.to.x, y: event.to.y, radius: event.radius,
    startedTick: event.startedTick, landsTick: event.impactTick, untilTick: event.untilTick })) };
}

type Dust = { readonly x: number; readonly y: number; readonly at: number; readonly vfx: SkillVfx; sprite?: Phaser.GameObjects.Sprite };
type Stomp = { readonly reach: Reach; readonly from: Point; readonly castAt: number; readonly channels: ShowChannels;
  readonly vfx: SkillVfx;
  readonly cracks: readonly (CrackCell & { readonly at: number })[]; readonly stunned: readonly { readonly id: number; readonly at: number }[];
  readonly total: number; readonly shoutAt: number; struck: boolean; shouted: boolean };

const DUST = [PALETTE.sand, PALETTE.sandLight, PALETTE.cream] as const, ROCK = [PALETTE.silverShade, PALETTE.sandLight, PALETTE.steelLight, PALETTE.cream, PALETTE.sand] as const;
const EMBERS = [PALETTE.gold, PALETTE.flame, PALETTE.ember] as const, SPARKS = [PALETTE.white, PALETTE.cream, PALETTE.gold] as const;
/** The shockwave's bands in pixels behind its front: a white edge and a cooling tail. With flashes off it keeps its motion in dull tones. */
const WAVE = [{ from: -2, to: 4, paint: PALETTE.white, alpha: .95 }, { from: 4, to: 10, paint: PALETTE.gold, alpha: .95 },
  { from: 10, to: 18, paint: PALETTE.ember, alpha: .75 }, { from: 18, to: 28, paint: PALETTE.copper, alpha: .45 }] as const;
const CALM_WAVE = [{ from: -2, to: 4, paint: PALETTE.copper, alpha: .6 }, { from: 4, to: 14, paint: PALETTE.ochre, alpha: .35 }] as const;
const WAVE_TAIL = 28, FLASH = { ground: 90, core: 130, rim: 160 } as const, ECHO = { after: 80, ms: 300 } as const;
const CRACK = { hot: 50, gold: 190, ember: 400, gone: 880, tipsEarly: 120, fade: 200 } as const;
const GATHER_MOTES = 28, CHIPS = 46, EMBER_COUNT = 30, MAX_SPARKED = 14, SHOUT_LIFT = 44, CRATER = 9, CORE = 20, SHADE = .34;

const around = (stage: SkillStage, index: number, count: number): number => (index + stage.random()) / count * Math.PI * 2;
function paint<Spot extends Point>(ground: Phaser.GameObjects.Graphics, spots: readonly Spot[], colour: number, alpha: number, wanted?: (spot: Spot) => boolean): void {
  if (alpha <= 0) return;
  ground.fillStyle(colour, alpha);
  for (const spot of spots) if (!wanted || wanted(spot)) ground.fillRect(spot.x, spot.y, 4, 4);
}

/** Hwang Jin's jingak as a thunderous stomp: dust is drawn in over a darkening ground, the foot lands, the ground splits in glowing
 *  cracks and a shockwave races out to the real reach. Each held hit appears as the wave passes its foe, and the staggered see stars.
 *  With the army's level the rules land more stomps across the field in waves: each is drawn where and when the rules land it. */
class JingakShow implements SkillShow {
  readonly general = JINGAK_GENERAL;
  readonly accent = PALETTE.copper;
  readonly waits = (effect: Effect) => HELD_KINDS.has(effect.kind);
  private readonly others = new StompPictures({ bold: true });
  private stomps: Stomp[] = [];
  private dust: Dust[] = [];

  cast(stage: SkillStage, { skill, results, run, squad, from, tier, channels, density }: CastContext): (effect: Effect) => number {
    const vfx = skillVfx(run, squad);
    const { x, y, value: radius } = skill, still = !channels.motion, castAt = stage.now;
    const landsAt = (effect: Effect) => waveAt(Math.hypot(effect.x - x, effect.y - y), radius, still);
    const hits = results.filter(item => item.kind === "hit"), struckAt = new Map<number, number>();
    for (const hit of hits) if (hit.target !== undefined) struckAt.set(hit.target, Math.max(struckAt.get(hit.target) ?? 0, landsAt(hit)));
    const plan = planJingak({ seed: Math.floor(stage.random() * 0x100000000), x, y, radius, tier, density, still });
    this.stomps.push({ reach: stage.reach(x, y, radius), from: { x: from.x, y: from.y }, castAt, channels, vfx,
      cracks: plan.cracks.filter((_, index) => index < Math.ceil(plan.cracks.length * vfx.density)).map(cell => ({ ...cell, at: castAt + waveAt(cell.far, radius, still) })),
      stunned: results.flatMap(item => item.kind === "stun" && item.target !== undefined ? [{ id: item.target, at: castAt + (struckAt.get(item.target) ?? landsAt(item)) }] : []),
      total: hits.reduce((sum, hit) => sum + hit.value, 0), shoutAt: castAt + Math.max(0, ...struckAt.values()), struck: false, shouted: false });
    if (still) return landsAt;
    this.drawDustIn(stage, skill, radius, density);
    this.throwChips(stage, skill, density);
    this.kickDust(stage, plan.dust, castAt, vfx);
    this.sparkHits(stage, skill, hits, landsAt);
    this.raiseEmbers(stage, skill, radius, density);
    return landsAt;
  }

  update(stage: SkillStage, frame: FrameContext): void {
    const { now, cssPixel, foe } = frame;
    for (const stomp of this.stomps) {
      const age = now - stomp.castAt;
      if (stomp.channels.motion) this.stomp(stage, stomp, now, cssPixel, foe);
      else stage.mark(stomp.reach, { age, since: -1, alpha: envelope(age, 0, JINGAK_SHOW.still.hold, JINGAK_SHOW.still.fall), channels: stomp.channels });
    }
    this.stomps = this.stomps.filter(stomp => now - stomp.castAt < (stomp.channels.motion ? JINGAK_SHOW.length : JINGAK_SHOW.still.hold + JINGAK_SHOW.still.fall));
    this.dust = this.dust.filter(dust => this.billow(stage, dust, now));
    this.others.draw(stage, castStomps(frame.run.chaosSkills), frame);
  }

  clear(stage: SkillStage): void {
    for (const dust of this.dust) if (dust.sprite) stage.freeSprite(dust.sprite);
    this.dust = []; this.stomps = []; this.others.clear();
  }

  private drawDustIn(stage: SkillStage, foot: Point, radius: number, density: number): void {
    for (let index = 0, count = Math.round(GATHER_MOTES * density); index < count; index++) {
      const turn = around(stage, index, count), far = radius * (.5 + stage.random() * .45), wait = stage.random() * 50, life = JINGAK_SHOW.gather - wait;
      const pace = (far - 8) / life * 1000;
      stage.mote({ x: foot.x + Math.cos(turn) * far, y: foot.y + Math.sin(turn) * far }, -Math.cos(turn) * pace, -Math.sin(turn) * pace, 0, life, DUST[index % DUST.length], false, wait, 2 + index % 2);
    }
  }
  private throwChips(stage: SkillStage, foot: Point, density: number): void {
    for (let index = 0, count = Math.round(CHIPS * density); index < count; index++) {
      const turn = around(stage, index, count), pace = 30 + stage.random() * 100, lift = 110 + stage.random() * 150, gravity = 620;
      stage.mote({ x: foot.x + Math.cos(turn) * 8, y: foot.y + Math.sin(turn) * 5 }, Math.cos(turn) * pace, Math.sin(turn) * pace * .5 - lift, gravity, 300 + stage.random() * 240,
        ROCK[index % ROCK.length], false, JINGAK_SHOW.gather + stage.random() * 30, 2 + index % 2);
    }
  }
  private kickDust(stage: SkillStage, spots: readonly DustSpot[], castAt: number, vfx: SkillVfx): void {
    for (const [index, spot] of spots.entries()) {
      if (index % Math.max(1, Math.round(1 / vfx.density)) === 0)
        this.dust.push({ x: spot.x, y: spot.y, at: castAt + spot.at, vfx });
      for (let chip = 0; chip < 2; chip++)
        stage.mote(spot, (stage.random() - .5) * 44, -(40 + stage.random() * 50), 240, 240 + stage.random() * 120, DUST[chip % DUST.length], false, spot.at, 1 + chip);
    }
  }
  private sparkHits(stage: SkillStage, foot: Point, hits: readonly Effect[], landsAt: (hit: Effect) => number): void {
    for (const hit of hits.slice(0, MAX_SPARKED)) {
      const far = Math.hypot(hit.x - foot.x, hit.y - foot.y) || 1, awayX = (hit.x - foot.x) / far, awayY = (hit.y - foot.y) / far;
      for (let chip = 0; chip < 4; chip++)
        stage.mote({ x: hit.x, y: hit.y - 6 }, awayX * (50 + stage.random() * 70) + (stage.random() - .5) * 40, awayY * 30 - (50 + stage.random() * 70), 420, 220 + stage.random() * 100,
          SPARKS[chip % SPARKS.length], false, landsAt(hit), 2 + chip % 2);
    }
  }
  private raiseEmbers(stage: SkillStage, foot: Point, radius: number, density: number): void {
    for (let index = 0, count = Math.round(EMBER_COUNT * density); index < count; index++) {
      const turn = around(stage, index, count), far = radius * (.4 + stage.random() * .55), afterWave = waveAt(far, radius, false) + 20 + stage.random() * 60;
      stage.mote({ x: foot.x + Math.cos(turn) * far, y: foot.y + Math.sin(turn) * far }, (stage.random() - .5) * 14, -(16 + stage.random() * 34), -10, 300 + stage.random() * 120,
        EMBERS[index % EMBERS.length], true, afterWave, 2 + index % 2);
    }
  }

  private stomp(stage: SkillStage, stomp: Stomp, now: number, cssPixel: number, foe: FrameContext["foe"]): void {
    const { reach, channels, vfx } = stomp, age = now - stomp.castAt, since = age - JINGAK_SHOW.gather;
    const hold = JINGAK_SHOW.length - JINGAK_SHOW.fade, fade = envelope(age, 0, hold, JINGAK_SHOW.fade);
    stage.veil(envelope(age, 90, hold - 90, JINGAK_SHOW.fade), channels);
    stage.mark(reach, { age, since: -1, alpha: envelope(age, 60, hold - 60, JINGAK_SHOW.fade), channels });
    if (since < 0) { this.darkenAndDrawIn(stage, reach, age / JINGAK_SHOW.gather, vfx.alpha); return; }
    if (!stomp.struck) { stomp.struck = true; stage.shake(.014, 90); }
    paintShockwave(stage, reach, since, fade, channels.flash, vfx);
    this.splitGround(stage, stomp, now, channels.flash);
    if (channels.flash && vfx.heavy) this.flare(stage, reach, since, vfx.alpha);
    for (const star of stomp.stunned) this.stars(stage, now - star.at, foe(star.id), fade * vfx.alpha);
    if (stomp.shouted || now < stomp.shoutAt) return;
    stomp.shouted = true;
    if (stomp.total && damageNumberShown(true)) stage.shout(stomp.from.x, stomp.from.y - SHOUT_LIFT, String(shownAmount(stomp.total)), PALETTE.gold, cssPixel, true);
  }

  private darkenAndDrawIn(stage: SkillStage, reach: Reach, drawn: number, alpha: number): void {
    const inward = reach.radius * (1 - drawn * drawn);
    paint(stage.ground, reach.cells, PALETTE.dark, SHADE * drawn * alpha);
    paint(stage.ground, reach.cells, PALETTE.sandLight, .6 * alpha, spot => Math.abs(spot.far - inward) < 2.5);
  }

  private splitGround(stage: SkillStage, stomp: Stomp, now: number, bright: boolean): void {
    const { reach, vfx } = stomp, ground = stage.ground, age = now - stomp.castAt;
    paint(ground, reach.cells, PALETTE.dark, .7 * vfx.alpha * envelope(age, 0, CRACK.gone - CRACK.fade, CRACK.fade), spot => spot.far < CRATER);
    const left = (cell: CrackCell) => Math.max(0, Math.min(1, (CRACK.gone - age - cell.far / reach.radius * CRACK.tipsEarly) / CRACK.fade));
    const open = stomp.cracks.filter(cell => now >= cell.at && left(cell) > 0), [hot, warm] = bright ? [PALETTE.white, PALETTE.gold] : [PALETTE.ember, PALETTE.ember];
    for (const cell of open) ground.fillStyle(PALETTE.dark, .8 * left(cell) * vfx.alpha).fillRect(cell.x - 1, cell.y - 1, 6, 6);
    for (const cell of open) {
      const glowing = now - cell.at;
      ground.fillStyle(glowing < CRACK.hot ? hot : glowing < CRACK.gold ? warm : glowing < CRACK.ember ? PALETTE.ember : PALETTE.copper, left(cell) * vfx.alpha).fillRect(cell.x, cell.y, 4, 4);
    }
  }

  private flare(stage: SkillStage, reach: Reach, since: number, alpha: number): void {
    paint(stage.ground, reach.cells, PALETTE.white, .85 * (1 - since / FLASH.core) * alpha, spot => spot.far < CORE);
    const atRim = since - JINGAK_SHOW.wave;
    if (atRim >= 0) paint(stage.ground, reach.rim, PALETTE.white, .9 * (1 - atRim / FLASH.rim) * alpha);
  }

  private stars(stage: SkillStage, spun: number, body: Phaser.GameObjects.Sprite | undefined, alpha: number): void {
    if (spun < 0 || alpha <= 0 || !body?.active || !body.visible) return;
    const top = body.y - body.displayHeight * body.originY + 2, orbit = Math.min(1, spun / 120) * (8 + body.displayWidth * .1), field = stage.field;
    for (let index = 0; index < 3; index++) {
      const turn = spun / 90 + index * Math.PI * 2 / 3, near = Math.sin(turn) > 0, arm = near ? 3 : 2, rim = arm + 1;
      const x = Math.round(body.x + Math.cos(turn) * orbit), y = Math.round(top + Math.sin(turn) * 3);
      field.fillStyle(PALETTE.outline, alpha).fillRect(x - rim, y - 1, rim * 2 + 1, 3).fillRect(x - 1, y - rim, 3, rim * 2 + 1).fillRect(x - 2, y - 2, 5, 5);
      field.fillStyle(near ? PALETTE.gold : PALETTE.ember, alpha).fillRect(x - arm, y, arm * 2 + 1, 1).fillRect(x, y - arm, 1, arm * 2 + 1).fillRect(x - 1, y - 1, 3, 3);
      if (near) field.fillStyle(PALETTE.cream, alpha).fillRect(x, y, 1, 1);
    }
  }

  /** The stage's own puff is grey gunsmoke, so stomp dust plays the brown fallen-foe sheet on a pooled sprite and gives it back when it has played. */
  private billow(stage: SkillStage, dust: Dust, now: number): boolean {
    if (now < dust.at) return true;
    if (!dust.sprite) {
      const sprite = stage.sprite("death");
      if (!sprite) return false;
      dust.sprite = sprite.setPosition(dust.x, dust.y - 6).setScale(1).setAlpha(dust.vfx.alpha).setDepth(bodyDepth(dust.y)).setVisible(true).play("fallen");
      return true;
    }
    if (!dust.sprite.anims.isPlaying) { stage.freeSprite(dust.sprite); return false; }
    dust.sprite.setY(dust.y - 6 - (now - dust.at) * .03);
    return true;
  }
}

/** The stomp's shockwave on the ground, `since` ms after the foot lands: a pale flash over the reach, a white-edged front racing out to
 *  the real radius with a cooling tail, and a gold echo ring; `fade` 0..1 dims the scorch. With flashes off it keeps its motion in dull tones. */
export function paintShockwave(stage: SkillStage, reach: Reach, since: number, fade: number, bright: boolean, vfx?: SkillVfx): void {
  const { cells, radius } = reach, ground = stage.ground, run = since / JINGAK_SHOW.wave;
  const alpha = vfx?.alpha ?? 1;
  paint(ground, cells, PALETTE.dark, SHADE * fade * alpha);
  if (bright && (vfx?.heavy ?? true)) paint(ground, cells, PALETTE.cream, .5 * (1 - since / FLASH.ground) * alpha);
  // Past the real reach the front keeps its final pace, so the tail runs out at the rim; cells exist only inside the reach.
  const front = run <= 1 ? waveFront(since, radius) : radius * (1 + (run - 1) * .5);
  if (front - radius < WAVE_TAIL) for (const band of bright ? WAVE : CALM_WAVE)
    paint(ground, cells, band.paint, band.alpha * (1 - .3 * Math.min(1, run)) * alpha, spot => front - spot.far >= band.from && front - spot.far < band.to);
  const echo = (since - ECHO.after) / ECHO.ms;
  if (echo > 0 && echo < 1 && (vfx?.heavy ?? true)) paint(ground, cells, bright ? PALETTE.gold : PALETTE.copper, .4 * (1 - echo) * alpha, spot => Math.abs(spot.far - radius * echo) < 2.5);
}

export const show: SkillShow = new JingakShow();
