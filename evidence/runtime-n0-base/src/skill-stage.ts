import type Phaser from "phaser";
import { HEIGHT, WIDTH } from "./geometry";
import type { Point } from "./geometry";
import { CRITICAL_NUMBER_MS, damageNumberFrame, HIT_FLASH_MS } from "./hit-feedback";
import type { PaintedArt } from "./painted-art";
import { color, LAYER, PALETTE, paintedRange, rangeCells } from "./presentation";
import type { Paint } from "./presentation";
import type { General } from "./roster";
import type { Effect, Run, Squad } from "./rules";
import { clearOfBand, releases, scatter } from "./skill-show";
import type { Area, Band, ShowChannels } from "./skill-show";

export type CastContext = {
  /** The rules' skill effect: its aim, and in `value` the radius, lane half-width, duration or ratio the rules used. */
  readonly skill: Effect;
  /** This cast's own results that wait for the picture; they are already out of the frame. Empty with motion off. */
  readonly results: readonly Effect[];
  readonly run: Readonly<Run>;
  readonly squad: Readonly<Squad>;
  readonly from: Point;
  readonly tier: number;
  readonly channels: ShowChannels;
  /** Particle headroom from 0 to 1; a slow device gets fewer decorations. */
  readonly density: number;
};
export type FrameContext = {
  readonly now: number;
  readonly cssPixel: number;
  readonly run: Readonly<Run>;
  readonly at: (unit: Point) => Point;
  readonly foe: (id: number) => Phaser.GameObjects.Sprite | undefined;
  /** The cut-in banner's rows in field pixels while it shows. */
  readonly band?: Band;
  /** The player's motion and flash settings this frame; pictures without a cast read them here. */
  readonly channels: ShowChannels;
};
/** One general's staged skill. It only draws: it never reads the run's random stream or writes the run. */
export interface SkillShow {
  readonly general: General;
  readonly accent: Paint;
  /** Which of a cast's results wait for the picture. Without it every result shows at once. */
  readonly waits?: (effect: Effect) => boolean;
  /** Which of this general's skill effects the show stages; the others keep the plain skill burst. Without it every one is staged. */
  readonly handles?: (skill: Effect) => boolean;
  /** The ground one cast covers, so the name banner can stay clear of it. Without it the skill effect's own circle or lane counts. */
  readonly areas?: (skill: Effect, run: Readonly<Run>) => readonly Area[];
  /** Starts one skill effect's picture. Returns, for each waiting result, when it appears in milliseconds from now. */
  cast(stage: SkillStage, context: CastContext): ((effect: Effect, index: number) => number) | void;
  update(stage: SkillStage, frame: FrameContext): void;
  /** Gives every pooled picture the show holds back to the stage. */
  clear(stage: SkillStage): void;
}
/** A picture of lasting army-level state (run.chaos): drawn every frame from the run, never cast, never holding results. */
export interface AmbientShow {
  readonly id: string;
  update(stage: SkillStage, frame: FrameContext): void;
  clear(stage: SkillStage): void;
}
/** A reach measured on the 4px ground grid: every cell, its distance from the centre (or from the lane's spine) and the rim in marching order. */
export type Reach = { readonly x: number; readonly y: number; readonly radius: number; readonly from?: Point;
  readonly cells: readonly (Point & { readonly far: number })[]; readonly rim: readonly Point[] };
export type MarkTiming = { readonly age: number; readonly since: number; readonly alpha: number; readonly channels: ShowChannels; readonly rim?: Paint };

type Mote = { shape: Phaser.GameObjects.Rectangle; x: number; y: number; vx: number; vy: number; pull: number; bornAt: number; life: number; twinkles: boolean };
type Puff = { sprite: Phaser.GameObjects.Sprite; y: number; bornAt: number; playing: boolean };
type Shout = { text: Phaser.GameObjects.Text; x: number; y: number; bornAt: number; moves: boolean };
type Pin = { readonly x: number; readonly y: number; until: number };

export const POOL = { images: 224, sprites: 32, motes: 288, puffs: 12, shouts: 6 } as const;
const VEIL = { alpha: .55, calm: .25 } as const;
const MARK = { lockMs: 120, flashMs: 100, ringMs: 170 } as const;
const SHOUT_PX = 24;

/** The shared prelude of every staged skill: one dusk veil under the danger marks, ground and air layers cleared each frame,
 *  pooled pictures, sprites, motes, smoke and big numbers, and the queue that gives each cast's held results back when its picture lands.
 *  Felled foes stand until their fall and struck foes keep their drawn place until their hit lands. */
export class SkillStage {
  readonly ground: Phaser.GameObjects.Graphics;
  readonly field: Phaser.GameObjects.Graphics;
  readonly trails: Phaser.GameObjects.Graphics;
  /** The scene's own shake and hit stop; it already respects motion and flash settings. */
  shaker: (strength: number, stop: number) => void = () => undefined;
  random: () => number = scatter(1);
  private readonly dusk: Phaser.GameObjects.Rectangle;
  private readonly shows = new Map<General, SkillShow>();
  private readonly spare = { images: [] as Phaser.GameObjects.Image[], sprites: [] as Phaser.GameObjects.Sprite[],
    motes: [] as Phaser.GameObjects.Rectangle[], puffs: [] as Phaser.GameObjects.Sprite[], shouts: [] as Phaser.GameObjects.Text[] };
  private readonly made = { images: 0, sprites: 0, motes: 0, puffs: 0, shouts: 0 };
  private readonly heldUntil = new Map<number, number>();
  private readonly pins = new Map<number, Pin>();
  private queue: { effect: Effect; at: number }[] = [];
  private motes: Mote[] = [];
  private puffs: Puff[] = [];
  private shouts: Shout[] = [];
  private band: Band | undefined;
  private veilShare = 0;
  private clock = 0;
  private casts = 0;

  constructor(readonly scene: Phaser.Scene, readonly art: PaintedArt, shows: readonly SkillShow[], private readonly ambient: readonly AmbientShow[] = []) {
    for (const show of shows) this.shows.set(show.general, show);
    // The veil and the ground marks sit under danger marks and bodies, so telegraphs, units and bars keep their full colour.
    this.dusk = scene.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH + 64, HEIGHT + 64, PALETTE.dark).setDepth(LAYER.dusk).setVisible(false);
    this.ground = scene.add.graphics().setDepth(LAYER.dusk);
    this.field = scene.add.graphics().setDepth(LAYER.impact + 10);
    this.trails = scene.add.graphics().setDepth(LAYER.impact + 14);
  }

  get now(): number { return this.clock; }
  staged(general: General | undefined, skill: Effect): SkillShow | undefined {
    const show = general === undefined ? undefined : this.shows.get(general);
    return show && (show.handles?.(skill) ?? true) ? show : undefined;
  }
  /** A foe the rules have already felled stands until its held fall is shown. */
  holds(id: number): boolean { return this.clock < (this.heldUntil.get(id) ?? 0); }
  /** A struck foe stays where it was drawn until its held hit lands, so a knockback shows on the impact, not on the cast. */
  pinned(id: number): Point | undefined {
    const pin = this.pins.get(id);
    return pin && this.clock < pin.until ? pin : undefined;
  }

  /** Starts one skill effect's picture and queues its held results by the show's timing. `drawn` gives a foe's drawn position. */
  cast(general: General, context: CastContext, drawn: (id: number) => Point | undefined): void {
    const show = this.shows.get(general);
    if (!show) return;
    this.random = scatter(Math.imul(++this.casts, 0x9e3779b1) ^ 0x1593);
    const timeOf = show.cast(this, context) ?? (() => 0);
    if (!context.results.length) return;
    const flash = context.channels.motion && context.channels.flash ? HIT_FLASH_MS : 0;
    for (const { effect, at } of releases(context.results, timeOf, flash)) {
      const due = this.clock + at;
      this.queue.push({ effect, at: due });
      if (effect.target === undefined) continue;
      if (effect.kind === "kill") this.heldUntil.set(effect.target, Math.max(this.heldUntil.get(effect.target) ?? 0, due));
      if (effect.kind !== "hit") continue;
      const pin = this.pins.get(effect.target), spot = drawn(effect.target);
      if (pin && this.clock < pin.until) pin.until = Math.min(pin.until, due);
      else if (spot) this.pins.set(effect.target, { x: spot.x, y: spot.y, until: due });
    }
    this.queue.sort((a, b) => a.at - b.at);
  }

  /** Advances one frame: every show draws, the shared pictures move, and the held results that are due come back in cast order. */
  update(delta: number, frame: Omit<FrameContext, "now">): Effect[] {
    this.clock += Math.min(delta, 100);
    this.ground.clear(); this.field.clear(); this.trails.clear();
    this.veilShare = 0;
    const context: FrameContext = { ...frame, now: this.clock };
    this.band = frame.band;
    for (const show of this.ambient) show.update(this, context);
    for (const show of this.shows.values()) show.update(this, context);
    // The field is resized after boot, so the veil is fitted to the live field whenever it shows.
    if (this.veilShare > 0) this.dusk.setPosition(WIDTH / 2, HEIGHT / 2).setSize(WIDTH + 64, HEIGHT + 64);
    this.dusk.setVisible(this.veilShare > 0).setAlpha(this.veilShare);
    this.motes = this.motes.filter(mote => this.drift(mote));
    this.puffs = this.puffs.filter(puff => this.billow(puff));
    this.shouts = this.shouts.filter(shout => this.call(shout, frame.cssPixel));
    for (const [id, until] of this.heldUntil) if (this.clock >= until) this.heldUntil.delete(id);
    for (const [id, pin] of this.pins) if (this.clock >= pin.until) this.pins.delete(id);
    let count = 0;
    while (count < this.queue.length && this.queue[count].at <= this.clock) count++;
    return this.queue.splice(0, count).map(item => item.effect);
  }

  clear(): void {
    for (const show of this.ambient) show.clear(this);
    for (const show of this.shows.values()) show.clear(this);
    for (const mote of this.motes) this.spare.motes.push(mote.shape.setVisible(false));
    for (const puff of this.puffs) this.spare.puffs.push(puff.sprite.setVisible(false));
    for (const shout of this.shouts) this.spare.shouts.push(shout.text.setVisible(false));
    this.motes = []; this.puffs = []; this.shouts = []; this.queue = [];
    this.heldUntil.clear(); this.pins.clear();
    this.ground.clear(); this.field.clear(); this.trails.clear(); this.dusk.setVisible(false);
  }

  /** Dims the field for this frame; the strongest request of all live shows wins. */
  veil(share: number, channels: ShowChannels): void {
    this.veilShare = Math.max(this.veilShare, Math.max(0, Math.min(1, share)) * (channels.motion && channels.flash ? VEIL.alpha : VEIL.calm));
  }
  shake(strength: number, stop = 0): void { this.shaker(strength, stop); }

  /** A circle, or with `from` a lane of that half-width from `from` to (x, y), measured once per cast. */
  reach(x: number, y: number, radius: number, from?: Point): Reach {
    const spine = from ?? { x, y }, dx = x - spine.x, dy = y - spine.y, length = dx * dx + dy * dy;
    const far = (px: number, py: number) => {
      const along = length ? Math.max(0, Math.min(1, ((px - spine.x) * dx + (py - spine.y) * dy) / length)) : 0;
      return Math.hypot(px - spine.x - along * dx, py - spine.y - along * dy);
    };
    const cells = rangeCells(x, y, radius, from).map(cell => ({ ...cell, far: far(cell.x + 2, cell.y + 2) }));
    const cx = (spine.x + x) / 2, cy = (spine.y + y) / 2, bearing = (cell: Point) => Math.atan2(cell.y + 2 - cy, cell.x + 2 - cx);
    return { x, y, radius, ...(from ? { from } : {}), cells, rim: cells.filter(cell => cell.far > radius - 4).sort((a, b) => bearing(a) - bearing(b)) };
  }

  /** The real reach on the ground: friendly range art (a pale lane for lanes), a marching rim, a lock-on ring closing in, and from
   *  the impact (`since` >= 0) a pale flash and a ring running outward. Motion off keeps only the still range and rim. */
  mark(reach: Reach, timing: MarkTiming): void {
    const { age, since, alpha, channels } = timing;
    if (alpha <= 0) return;
    const cell = (x: number, y: number) => this.ground.fillRect(Math.floor(x / 4) * 4, Math.floor(y / 4) * 4, 4, 4);
    if (reach.from) {
      this.ground.fillStyle(PALETTE.ally, .22 * alpha);
      for (const spot of reach.cells) cell(spot.x, spot.y);
    } else paintedRange(this.ground, this.art, "range-friendly", reach.x, reach.y, reach.radius, .3 * alpha);
    const phase = channels.motion ? Math.floor(age / 70) : 0;
    this.ground.fillStyle(timing.rim ?? PALETTE.gold, .85 * alpha);
    reach.rim.forEach((spot, index) => { if (Math.floor((index + phase) / 3) % 2 === 0) cell(spot.x, spot.y); });
    if (!channels.motion) return;
    if (age < MARK.lockMs) {
      const grow = reach.radius * .3 * (1 - age / MARK.lockMs);
      this.ground.fillStyle(timing.rim ?? PALETTE.gold, .6 * alpha);
      reach.rim.forEach((spot, index) => {
        if (index % 2) return;
        const out = this.outward(reach, spot);
        cell(spot.x + 2 + out.x * grow, spot.y + 2 + out.y * grow);
      });
    }
    if (!channels.flash || since < 0) return;
    if (since < MARK.flashMs) {
      this.ground.fillStyle(PALETTE.cream, .45 * (1 - since / MARK.flashMs));
      for (const spot of reach.cells) cell(spot.x, spot.y);
    }
    if (since >= MARK.ringMs) return;
    const spread = since / MARK.ringMs, front = reach.radius * (.25 + .75 * (1 - (1 - spread) ** 2));
    this.ground.fillStyle(PALETTE.cream, .7 * (1 - spread));
    for (const spot of reach.cells) if (Math.abs(spot.far - front) < 3) cell(spot.x, spot.y);
  }

  private take<T extends Phaser.GameObjects.GameObject>(kind: keyof typeof POOL, spare: T[], make: () => T): T | undefined {
    const waiting = spare.pop();
    if (waiting || this.made[kind] >= POOL[kind]) return waiting;
    this.made[kind]++;
    return make();
  }
  /** A pooled still picture, hidden until the show places it. Undefined when the pool is spent: draw fewer, never more. */
  image(key: string, frame?: string | number): Phaser.GameObjects.Image | undefined {
    return this.take("images", this.spare.images, () => this.scene.add.image(0, 0, key))
      ?.setTexture(key, frame).setCrop().setOrigin(.5).setScale(1).setRotation(0).setFlip(false, false).clearTint()
      .setAlpha(1).setBlendMode("NORMAL").setDepth(LAYER.impact + 15).setVisible(false);
  }
  free(image: Phaser.GameObjects.Image): void { this.spare.images.push(image.setVisible(false)); }
  sprite(key: string, frame?: string | number): Phaser.GameObjects.Sprite | undefined {
    const sprite = this.take("sprites", this.spare.sprites, () => this.scene.add.sprite(0, 0, key));
    sprite?.anims.stop();
    return sprite?.setTexture(key, frame).setOrigin(.5).setScale(1).setRotation(0).setFlip(false, false).clearTint()
      .setAlpha(1).setBlendMode("NORMAL").setDepth(LAYER.impact + 16).setVisible(false);
  }
  freeSprite(sprite: Phaser.GameObjects.Sprite): void { sprite.anims.stop(); this.spare.sprites.push(sprite.setVisible(false)); }

  /** A square chip with its own drift, rise or fall, managed by the stage until its life ends. */
  mote(at: Point, vx: number, vy: number, pull: number, life: number, paint: number, twinkles = false, delay = 0, size = 0): void {
    const shape = this.take("motes", this.spare.motes, () => this.scene.add.rectangle(0, 0, 2, 2, paint).setDepth(LAYER.impact + 12));
    if (!shape) return;
    const side = size || 2 + Math.floor(this.random() * 2);
    shape.setFillStyle(paint).setSize(side, side).setPosition(at.x, at.y).setAlpha(1).setVisible(false);
    this.motes.push({ shape, x: at.x, y: at.y, vx, vy, pull, bornAt: this.clock + delay, life, twinkles });
  }
  puff(x: number, y: number, delay = 0, scale = 1, alpha = .8): void {
    const sprite = this.take("puffs", this.spare.puffs, () => this.scene.add.sprite(0, 0, "smoke").setDepth(LAYER.impact + 30));
    if (!sprite) return;
    sprite.setPosition(x, y).setScale(scale).setAlpha(alpha).setVisible(false);
    this.puffs.push({ sprite, y, bornAt: this.clock + delay, playing: false });
  }
  /** A big number (a total, a heal) that pops, rises and fades like a critical damage number, kept on screen. */
  shout(x: number, y: number, words: string, paint: Paint, cssPixel: number, moves: boolean, size = SHOUT_PX): void {
    const text = this.take("shouts", this.spare.shouts, () => this.scene.add.text(0, 0, "", { fontFamily: "DNFBitBitv2", fontSize: `${SHOUT_PX}px` })
      .setOrigin(.5, 1).setDepth(LAYER.bars + 2));
    if (!text) return;
    text.setText(words).setFontSize(size * cssPixel).setColor(color(paint)).setStroke(color(PALETTE.outline), 3 * cssPixel).setAlpha(1).setScale(1).setVisible(true);
    // Measured at its popped size and full rise, so the number never passes behind the cut-in banner.
    const peak = damageNumberFrame(0, true, moves), last = damageNumberFrame(CRITICAL_NUMBER_MS, true, moves);
    const reach = Math.max(peak.scale * text.height, text.height + last.rise * cssPixel);
    this.shouts.push({ text, x, y: clearOfBand(Math.max(text.height, y), reach, this.band, 4 * cssPixel, HEIGHT), bornAt: this.clock, moves });
  }

  private outward(reach: Reach, spot: Point): Point {
    const spine = reach.from ?? reach, dx = reach.x - spine.x, dy = reach.y - spine.y, length = dx * dx + dy * dy;
    const along = length ? Math.max(0, Math.min(1, ((spot.x + 2 - spine.x) * dx + (spot.y + 2 - spine.y) * dy) / length)) : 0;
    const ox = spot.x + 2 - spine.x - along * dx, oy = spot.y + 2 - spine.y - along * dy, far = Math.hypot(ox, oy) || 1;
    return { x: ox / far, y: oy / far };
  }
  private drift(mote: Mote): boolean {
    const age = this.clock - mote.bornAt, seconds = age / 1000;
    if (age < 0) return true;
    if (age >= mote.life) { this.spare.motes.push(mote.shape.setVisible(false)); return false; }
    mote.shape.setVisible(true).setPosition(mote.x + mote.vx * seconds, mote.y + mote.vy * seconds + mote.pull * seconds * seconds / 2)
      .setAlpha((1 - (age / mote.life) ** 2) * (mote.twinkles && Math.floor(age / 80) % 3 === 0 ? .4 : 1));
    return true;
  }
  private billow(puff: Puff): boolean {
    if (this.clock < puff.bornAt) return true;
    if (!puff.playing) { puff.playing = true; puff.sprite.setVisible(true).play("puff"); }
    else if (!puff.sprite.anims.isPlaying) { this.spare.puffs.push(puff.sprite.setVisible(false)); return false; }
    puff.sprite.setY(puff.y - (this.clock - puff.bornAt) * .024);
    return true;
  }
  private call(shout: Shout, cssPixel: number): boolean {
    const age = this.clock - shout.bornAt;
    if (age >= CRITICAL_NUMBER_MS) { this.spare.shouts.push(shout.text.setVisible(false)); return false; }
    // Kept on screen at its popped size, like the damage numbers, so the pop never clips at an edge.
    const frame = damageNumberFrame(age, true, shout.moves), half = (shout.text.width / 2 + 2 * cssPixel) * frame.scale;
    shout.text.setPosition(Math.max(half, Math.min(WIDTH - half, shout.x)), shout.y - frame.rise * cssPixel).setAlpha(frame.alpha).setScale(frame.scale);
    return true;
  }
}
