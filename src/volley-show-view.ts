import { damageNumberShown, shownAmount } from "./display-scale";
import type Phaser from "phaser";
import { armyTick } from "./chaos-shows/charge-trails";
import { fortRect, WIDTH } from "./geometry";
import { ARROW_ART, bodyDepth, PALETTE, shotArt } from "./presentation";
import { riverBank } from "./river";
import type { Effect } from "./rules";
import { envelope, HELD_KINDS } from "./skill-show";
import type { ShowChannels } from "./skill-show";
import type { CastContext, FrameContext, Reach, SkillShow, SkillStage } from "./skill-stage";
import { liveRain, paintRain, planVolley, rainArrows, rainCount, rainFall, rainVeil, VOLLEY_GENERAL, VOLLEY_SHOW } from "./volley-show";
import { skillVfx } from "./skill-vfx";
import type { SkillVfx } from "./skill-vfx";
/** PREVIEW ONLY (owner choice clip): ?pv=rockets replaces the arrow rain with the staged 신기전 barrage. Off by default. */
const PREVIEW_ROCKETS = typeof location === "undefined" ? false : new URLSearchParams(location.search).get("pv") === "rockets";

type Arrow = { image: Phaser.GameObjects.Image; kind: "ground" | "strike" | "launch"; fromX: number; fromY: number; x: number; y: number;
  leaveAt: number; landAt: number; landed: boolean; dusty: boolean; look: SkillVfx };
type Volley = { reach: Reach; castAt: number; impactAt: number; channels: ShowChannels; density: number; total: number; hits: number; struck: boolean };

const DUST = [PALETTE.sand, PALETTE.sandLight, PALETTE.cream] as const, EMBERS = [PALETTE.gold, PALETTE.flame, PALETTE.ember] as const;
const STREAK = [PALETTE.white, PALETTE.cream, PALETTE.gold, PALETTE.ember] as const;
const BURIED_ROWS = 4, STREAK_PIXELS = 48, DUST_CHIPS = 3, EMBER_COUNT = 30, PUFF_COUNT = 5;
const LAUNCH = { arrows: 5, reach: 84, ms: 110, gap: 12 } as const;
const SHOW_MS = Math.max(VOLLEY_SHOW.dusk.rise + VOLLEY_SHOW.dusk.hold + VOLLEY_SHOW.dusk.fall,
  Math.max(VOLLEY_SHOW.rain, VOLLEY_SHOW.mark.still) + VOLLEY_SHOW.mark.fall);

/** Gwon Yul's volley as an arrow rain: a dusk, the real radius on the ground, the rain with streaks, and on the thump the held hits,
 *  the summed damage, dust, embers and smoke. From army level 1 the rules follow the volley with waves of arrow streams over the whole
 *  field (run.chaosSkills); those are drawn every frame from the run, for as long as the rules keep them. */
class VolleyShow implements SkillShow {
  readonly general = VOLLEY_GENERAL;
  readonly accent = PALETTE.red;
  readonly waits = (effect: Effect) => HELD_KINDS.has(effect.kind);
  private volleys: Volley[] = [];
  private arrows: Arrow[] = [];
  /** The headroom the last cast was given. A frame carries none, so the rain that follows a cast keeps the cast's. */
  private density = 1;
  private tick = -1;
  private tickAt = 0;
  // PREVIEW ONLY (owner choice clip): the rocket staging's pooled sprites, reused every frame.
  private rocketSprites: Phaser.GameObjects.Sprite[] = [];

  cast(stage: SkillStage, { skill, results, from, tier, channels, density, run, squad }: CastContext): () => number {
    const { x, y, value: radius } = skill, still = !channels.motion, castAt = stage.now;
    const look = skillVfx(run, squad);
    this.density = density;
    const hits = results.filter(item => item.kind === "hit");
    this.volleys.push({ reach: stage.reach(x, y, radius), castAt, impactAt: castAt + (still ? 0 : VOLLEY_SHOW.impact), channels, density,
      total: results.find(item => item.kind === "total")?.value ?? 0, hits: hits.length, struck: false });
    // The rain leans away from the general on a drawn frame of the arrow sheet, so no arrow is resampled by rotation.
    const side = x >= from.x ? 1 : -1, heading = Math.PI / 2 - side * Math.PI / 8, frame = shotArt("arrow", heading).frame;
    const dx = Math.cos(heading) * VOLLEY_SHOW.dropPixels, dy = Math.sin(heading) * VOLLEY_SHOW.dropPixels;
    const seed = Math.floor(stage.random() * 0x100000000);
    for (const arrow of planVolley({ seed, x, y, radius, tier, density: density * look.density, still, targets: hits })) {
      const image = stage.image(ARROW_ART.key, frame);
      if (!image) break;
      this.arrows.push({ image, kind: arrow.strike ? "strike" : "ground", x: arrow.x, y: arrow.y, fromX: arrow.x - dx, fromY: arrow.y - dy,
        leaveAt: castAt + arrow.landAt - VOLLEY_SHOW.flight, landAt: castAt + arrow.landAt, landed: false, dusty: !still, look });
    }
    if (!still) for (let index = 0; index < Math.max(1, Math.round(LAUNCH.arrows * look.density)); index++) {
      const lift = -Math.PI / 2 + side * Math.PI / 8 * (index % 2), image = stage.image(ARROW_ART.key, shotArt("arrow", lift).frame);
      if (!image) break;
      const startX = from.x + (index - (LAUNCH.arrows - 1) / 2) * 5, startY = from.y - 14, leaveAt = castAt + index * LAUNCH.gap;
      this.arrows.push({ image, kind: "launch", fromX: startX, fromY: startY, x: startX + Math.cos(lift) * LAUNCH.reach, y: startY + Math.sin(lift) * LAUNCH.reach,
        leaveAt, landAt: leaveAt + LAUNCH.ms, landed: false, dusty: false, look });
    }
    return () => still ? 0 : VOLLEY_SHOW.impact;
  }

  update(stage: SkillStage, frame: FrameContext): void {
    this.rain(stage, frame);
    const { now, cssPixel } = frame;
    if (!this.volleys.length && !this.arrows.length) return;
    for (const volley of this.volleys) {
      const age = now - volley.castAt, since = now - volley.impactAt;
      if (!volley.struck && since >= 0) { volley.struck = true; this.strike(stage, volley, cssPixel); }
      stage.veil(envelope(age, VOLLEY_SHOW.dusk.rise, VOLLEY_SHOW.dusk.hold, VOLLEY_SHOW.dusk.fall), volley.channels);
      const until = volley.channels.motion ? VOLLEY_SHOW.rain : VOLLEY_SHOW.mark.still;
      stage.mark(volley.reach, { age, since, alpha: envelope(age, VOLLEY_SHOW.mark.rise, until - VOLLEY_SHOW.mark.rise, VOLLEY_SHOW.mark.fall), channels: volley.channels });
    }
    this.volleys = this.volleys.filter(volley => now - volley.castAt < SHOW_MS);
    this.arrows = this.arrows.filter(arrow => this.fly(stage, arrow, now));
  }

  clear(stage: SkillStage): void {
    for (const arrow of this.arrows) stage.free(arrow.image);
    for (const sprite of this.rocketSprites) stage.freeSprite(sprite);
    this.rocketSprites = [];
    this.arrows = []; this.volleys = [];
    this.density = 1; this.tick = -1;
  }

  /** The army-level rain from army level 1, read from the rules' own events at the army tick as drawn. Level 0 has no such state, so
   *  its volley keeps its picture. Between the scene's whole ticks the clock moves on by display time, never past the next tick. */
  private rain(stage: SkillStage, { run, now, channels }: FrameContext): void {
    const state = run.chaosSkills;
    if (!state) return;
    const look = skillVfx(run, run.squads.find(squad => squad.general === this.general));
    if (state.tick !== this.tick) { this.tick = state.tick; this.tickAt = now; }
    const clock = armyTick(state, now - this.tickAt), dusk = rainVeil(state.events, clock, channels.motion);
    if (dusk > 0) stage.veil(dusk, channels);
    if (PREVIEW_ROCKETS && channels.motion) { this.rocketRain(stage, state.events, clock); return; }
    paintRain({ events: state.events, clock, look: { ...channels, density: this.density * look.density }, ground: { width: WIDTH, bank: riverBank(), keep: fortRect(run.fort) } },
      (layer, paint, alpha, x, y, wide, high) => { stage[layer].fillStyle(paint, alpha * look.alpha).fillRect(x, y, wide, high); });
  }

  /** PREVIEW ONLY (owner choice clip, ?pv=rockets): a 신기전 barrage — rocket sprites climb from the field's foot trailing smoke,
   *  tip over and dive as fire, and burst where they land. Existing sprites only (rocket/muzzle/boom/smoke); the rules, damage and
   *  every timing the rules own are the arrow rain's own, untouched. */
  private rocketRain(stage: SkillStage, events: readonly ReturnType<typeof liveRain>[number][], clock: number): void {
    type Flight = { x: number; y: number; turn: number; kind: "rocket" | "muzzle" | "boom"; age: number };
    const flights: Flight[] = [];
    for (const stream of liveRain(events, clock)) {
      const fall = Math.max(1, (stream.impactTick - stream.startedTick) * .32), rise = 14, after = 6;
      const seeded = Math.imul(stream.id + 1, 0x9e3779b1) ^ 0x1593;
      for (const arrow of rainArrows(stream, seeded, Math.min(14, rainCount(stream, this.density)))) {
        const lift = (arrow.landTick - clock) / rise, dive = 1 - (arrow.landTick - clock) / fall;
        const launch = { x: arrow.x, y: Math.min(riverBank() - 6, arrow.y + 175) }, apex = { x: arrow.x, y: arrow.y - 130 };
        if (lift > 0 && lift < 1) {
          const share = 1 - lift, sway = Math.sin(share * Math.PI * 2 + arrow.x) * 6 * (1 - share);
          const at = { x: launch.x + (apex.x - launch.x) * share + sway, y: launch.y + (apex.y - launch.y) * share };
          flights.push({ x: at.x, y: at.y, turn: -Math.PI / 2 + sway * .06, kind: "rocket", age: share });
          if (share < .14) flights.push({ x: launch.x, y: launch.y, turn: 0, kind: "muzzle", age: share });
          if (Math.floor(lift * 10) % 4 === 0 && flights.length < 44) stage.puff(at.x, at.y + 12, 40, .5, .38);
        } else if (dive >= 0 && dive < 1) {
          const at = rainFall(stream, dive), ahead = rainFall(stream, Math.min(1, dive + .1));
          flights.push({ x: arrow.x + at.x, y: arrow.y + at.y, turn: Math.atan2(ahead.y - at.y, ahead.x - at.x), kind: "rocket", age: dive });
        } else if (clock >= arrow.landTick && clock < arrow.landTick + after) {
          flights.push({ x: arrow.x, y: arrow.y, turn: 0, kind: "boom", age: (clock - arrow.landTick) / after });
        }
      }
    }
    let used = 0;
    for (const flight of flights) {
      if (used >= 26) break;
      let sprite: Phaser.GameObjects.Sprite | undefined = this.rocketSprites[used];
      const skin = flight.kind === "boom" ? "boom" : flight.kind === "muzzle" ? "muzzle" : "rocket";
      if (!sprite) {
        sprite = stage.sprite(skin, 0);
        if (!sprite) break;
        this.rocketSprites[used] = sprite;
      } else sprite.setTexture(skin, 0);
      if (flight.kind === "boom")
        sprite.setPosition(flight.x, flight.y).setRotation(0).setScale(Math.max(1, Math.round(.8 + flight.age * .9))).setAlpha(1 - flight.age * .7)
          .setFrame(Math.min(4, Math.floor(flight.age * 5))).setVisible(true);
      else if (flight.kind === "muzzle")
        sprite.setPosition(flight.x, flight.y).setRotation(flight.turn).setScale(1).setAlpha(.9)
          .setFrame(Math.floor(flight.age * 18) % 3).setVisible(true);
      else
        sprite.setPosition(flight.x, flight.y).setRotation(flight.turn).setScale(1).setAlpha(.95)
          .setFrame(Math.floor(flight.age * 9 + flight.x) % 3).setVisible(true);
      used++;
    }
    for (let index = used; index < this.rocketSprites.length; index++) this.rocketSprites[index].setVisible(false);
  }

  private strike(stage: SkillStage, volley: Volley, cssPixel: number): void {
    const { reach, channels } = volley;
    if (volley.total && damageNumberShown(true)) stage.shout(reach.x, reach.y - reach.radius - 4, String(shownAmount(volley.total)), PALETTE.gold, cssPixel, channels.motion);
    if (!channels.motion) return;
    if (volley.hits) stage.shake(.014, 90);
    const inside = () => {
      const turn = stage.random() * Math.PI * 2, far = reach.radius * .85 * Math.sqrt(stage.random());
      return { x: reach.x + Math.cos(turn) * far, y: reach.y + Math.sin(turn) * far };
    };
    for (let index = 0; index < Math.round(EMBER_COUNT * volley.density); index++)
      stage.mote(inside(), (stage.random() - .5) * 18, -(28 + stage.random() * 44), -10, 520 + stage.random() * 380, EMBERS[index % EMBERS.length], true, stage.random() * 180);
    for (let index = 0; index < PUFF_COUNT; index++) {
      const spot = inside();
      stage.puff(spot.x, spot.y - 6, 30 + index * 60);
    }
  }

  private fly(stage: SkillStage, arrow: Arrow, now: number): boolean {
    const { image, look } = arrow;
    image.setScale(1);
    if (now < arrow.leaveAt) return true;
    if (now < arrow.landAt) {
      const share = (now - arrow.leaveAt) / (arrow.landAt - arrow.leaveAt), far = Math.hypot(arrow.x - arrow.fromX, arrow.y - arrow.fromY);
      const ux = (arrow.x - arrow.fromX) / far, uy = (arrow.y - arrow.fromY) / far, x = arrow.fromX + ux * far * share, y = arrow.fromY + uy * far * share;
      image.setVisible(true).setPosition(x, y).setAlpha((arrow.kind === "launch" ? Math.min(1, (1 - share) * 2.5) : 1) * look.alpha);
      for (let back = 0; back < STREAK_PIXELS && back + 8 < far * share; back += 2) {
        const band = Math.floor(back / STREAK_PIXELS * STREAK.length);
        stage.trails.fillStyle(STREAK[band], (1 - band / STREAK.length) * .9 * image.alpha)
          .fillRect(Math.round(x - ux * (back + 8)) - 1, Math.round(y - uy * (back + 8)) - 1, 2, 2);
      }
      return true;
    }
    const age = now - arrow.landAt;
    if (arrow.kind !== "ground" || age >= VOLLEY_SHOW.stand + VOLLEY_SHOW.fade) { stage.free(image); return false; }
    if (!arrow.landed) {
      arrow.landed = true;
      image.setVisible(true).setPosition(arrow.x, arrow.y).setDepth(bodyDepth(arrow.y)).setCrop(0, 0, ARROW_ART.size, ARROW_ART.size - BURIED_ROWS);
      if (arrow.dusty) for (let chip = 0; chip < DUST_CHIPS; chip++)
        stage.mote({ x: arrow.x, y: arrow.y + 2 }, (stage.random() - .5) * 90, -(36 + stage.random() * 40), 260, 240 + stage.random() * 110, DUST[chip % DUST.length]);
    }
    image.setAlpha((age < VOLLEY_SHOW.stand ? 1 : 1 - (age - VOLLEY_SHOW.stand) / VOLLEY_SHOW.fade) * look.alpha);
    return true;
  }
}

export const volleyShow: SkillShow = new VolleyShow();
