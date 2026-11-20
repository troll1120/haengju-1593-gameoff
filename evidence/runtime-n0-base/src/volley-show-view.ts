import type Phaser from "phaser";
import { ARROW_ART, bodyDepth, PALETTE, shotArt } from "./presentation";
import type { Effect } from "./rules";
import { envelope, HELD_KINDS } from "./skill-show";
import type { ShowChannels } from "./skill-show";
import type { CastContext, FrameContext, Reach, SkillShow, SkillStage } from "./skill-stage";
import { planVolley, VOLLEY_GENERAL, VOLLEY_SHOW } from "./volley-show";

type Arrow = { image: Phaser.GameObjects.Image; kind: "ground" | "strike" | "launch"; fromX: number; fromY: number; x: number; y: number;
  leaveAt: number; landAt: number; landed: boolean; dusty: boolean };
type Volley = { reach: Reach; castAt: number; impactAt: number; channels: ShowChannels; density: number; total: number; hits: number; struck: boolean };

const DUST = [PALETTE.sand, PALETTE.sandLight, PALETTE.cream] as const, EMBERS = [PALETTE.gold, PALETTE.flame, PALETTE.ember] as const;
const STREAK = [PALETTE.white, PALETTE.cream, PALETTE.gold, PALETTE.ember] as const;
const BURIED_ROWS = 4, STREAK_PIXELS = 48, DUST_CHIPS = 3, EMBER_COUNT = 30, PUFF_COUNT = 5;
const LAUNCH = { arrows: 5, reach: 84, ms: 110, gap: 12 } as const;
const SHOW_MS = Math.max(VOLLEY_SHOW.dusk.rise + VOLLEY_SHOW.dusk.hold + VOLLEY_SHOW.dusk.fall,
  Math.max(VOLLEY_SHOW.rain, VOLLEY_SHOW.mark.still) + VOLLEY_SHOW.mark.fall);

/** Gwon Yul's volley as an arrow rain: a dusk, the real radius on the ground, the rain with streaks, and on the thump the held hits,
 *  the summed damage, dust, embers and smoke. */
class VolleyShow implements SkillShow {
  readonly general = VOLLEY_GENERAL;
  readonly accent = PALETTE.red;
  readonly waits = (effect: Effect) => HELD_KINDS.has(effect.kind);
  private volleys: Volley[] = [];
  private arrows: Arrow[] = [];

  cast(stage: SkillStage, { skill, results, from, tier, channels, density }: CastContext): () => number {
    const { x, y, value: radius } = skill, still = !channels.motion, castAt = stage.now;
    const hits = results.filter(item => item.kind === "hit");
    this.volleys.push({ reach: stage.reach(x, y, radius), castAt, impactAt: castAt + (still ? 0 : VOLLEY_SHOW.impact), channels, density,
      total: results.find(item => item.kind === "total")?.value ?? 0, hits: hits.length, struck: false });
    // The rain leans away from the general on a drawn frame of the arrow sheet, so no arrow is resampled by rotation.
    const side = x >= from.x ? 1 : -1, heading = Math.PI / 2 - side * Math.PI / 8, frame = shotArt("arrow", heading).frame;
    const dx = Math.cos(heading) * VOLLEY_SHOW.dropPixels, dy = Math.sin(heading) * VOLLEY_SHOW.dropPixels;
    const seed = Math.floor(stage.random() * 0x100000000);
    for (const arrow of planVolley({ seed, x, y, radius, tier, density, still, targets: hits })) {
      const image = stage.image(ARROW_ART.key, frame);
      if (!image) break;
      this.arrows.push({ image, kind: arrow.strike ? "strike" : "ground", x: arrow.x, y: arrow.y, fromX: arrow.x - dx, fromY: arrow.y - dy,
        leaveAt: castAt + arrow.landAt - VOLLEY_SHOW.flight, landAt: castAt + arrow.landAt, landed: false, dusty: !still });
    }
    if (!still) for (let index = 0; index < LAUNCH.arrows; index++) {
      const lift = -Math.PI / 2 + side * Math.PI / 8 * (index % 2), image = stage.image(ARROW_ART.key, shotArt("arrow", lift).frame);
      if (!image) break;
      const startX = from.x + (index - (LAUNCH.arrows - 1) / 2) * 5, startY = from.y - 14, leaveAt = castAt + index * LAUNCH.gap;
      this.arrows.push({ image, kind: "launch", fromX: startX, fromY: startY, x: startX + Math.cos(lift) * LAUNCH.reach, y: startY + Math.sin(lift) * LAUNCH.reach,
        leaveAt, landAt: leaveAt + LAUNCH.ms, landed: false, dusty: false });
    }
    return () => still ? 0 : VOLLEY_SHOW.impact;
  }

  update(stage: SkillStage, { now, cssPixel }: FrameContext): void {
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
    this.arrows = []; this.volleys = [];
  }

  private strike(stage: SkillStage, volley: Volley, cssPixel: number): void {
    const { reach, channels } = volley;
    if (volley.total) stage.shout(reach.x, reach.y - reach.radius - 4, String(volley.total), PALETTE.gold, cssPixel, channels.motion);
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
    const { image } = arrow;
    if (now < arrow.leaveAt) return true;
    if (now < arrow.landAt) {
      const share = (now - arrow.leaveAt) / (arrow.landAt - arrow.leaveAt), far = Math.hypot(arrow.x - arrow.fromX, arrow.y - arrow.fromY);
      const ux = (arrow.x - arrow.fromX) / far, uy = (arrow.y - arrow.fromY) / far, x = arrow.fromX + ux * far * share, y = arrow.fromY + uy * far * share;
      image.setVisible(true).setPosition(x, y).setAlpha(arrow.kind === "launch" ? Math.min(1, (1 - share) * 2.5) : 1);
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
    image.setAlpha(age < VOLLEY_SHOW.stand ? 1 : 1 - (age - VOLLEY_SHOW.stand) / VOLLEY_SHOW.fade);
    return true;
  }
}

export const volleyShow: SkillShow = new VolleyShow();
