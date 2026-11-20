import { PALETTE } from "./presentation";
import type Phaser from "phaser";
import { enemyAnimation } from "./enemy-animation";
import type { EnemyArt, Facing } from "./enemy-animation";
import type { DecorationBudget } from "./presentation";

export const HIT_FLASH_MS = 67;
export const HIT_RECOIL_MS = 140;
export const HIT_HOLD_MS = 48;
export const HIT_HOLD_GAP_MS = 250;
/** A single victim, never the simulation or camera. Repeat hits must leave a recovery gap. */
export function hitHold(now: number, lastAt: number, heavy: boolean, motion: boolean): number {
  return motion && heavy && now - lastAt >= HIT_HOLD_GAP_MS ? HIT_HOLD_MS : 0;
}
/** Compress existing body artwork on contact and release it quickly; no extra sprite or particle. */
export function hitSquash(age: number, critical: boolean, motion: boolean): { x: number; y: number } {
  const weight = motion && age >= 0 ? Math.max(0, 1 - age / 110) ** 2 * (critical ? .18 : .12) : 0;
  return { x: 1 + weight, y: 1 - weight };
}

/** Keep the death clock intact: whitening changes only its texture, and fading waits for its last frame. */
export function playEnemyDeath(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite, art: EnemyArt, direction: Facing,
  channels: { motion: boolean; flash: boolean }, decoration: DecorationBudget): void {
  if (!channels.motion) { sprite.destroy(); return; }
  const state = { moving: false, attacking: false, hurt: false, flashing: false, direction, dead: true };
  const animation = enemyAnimation(art, state), pop = decoration.allow("kill-pop", scene.time.now, 12);
  sprite.clearTint().play(animation.key);
  if (pop && channels.flash) {
    const white = enemyAnimation(art, { ...state, flashing: true });
    const whiten = () => {
      const frame = white.frames[(sprite.anims.currentFrame?.index ?? 1) - 1];
      sprite.setTexture(frame.key, frame.frame);
    };
    sprite.on("animationupdate", whiten);
    whiten();
    scene.time.delayedCall(HIT_FLASH_MS, () => {
      sprite.off("animationupdate", whiten);
      if (!sprite.active) return;
      const frame = animation.frames[(sprite.anims.currentFrame?.index ?? 1) - 1];
      sprite.setTexture(frame.key, frame.frame);
    });
  }
  const nativeScale = Number(sprite.getData("nativeScale"));
  if (pop) scene.tweens.add({ targets: sprite, scaleX: Math.max(nativeScale, sprite.scaleX * 1.15),
    scaleY: Math.max(nativeScale, sprite.scaleY * .85), duration: 55, yoyo: true });
  if (!art.full && !art.ship) scene.tweens.add({ targets: sprite, angle: sprite.flipX ? -90 : 90, y: sprite.y + 6,
    duration: animation.frames.length / animation.frameRate * 1000 });
  sprite.once("animationcomplete", () => {
    scene.tweens.add({ targets: sprite, alpha: 0, duration: 160, onComplete: () => sprite.destroy() });
  });
}

/** Admit a short victim-only hold without spending any simulation or camera budget. */
export function holdHit(sprite: Phaser.GameObjects.Sprite, now: number, heavy: boolean, motion: boolean, decoration: DecorationBudget): void {
  const hold = hitHold(now, Number(sprite.getData("hitHoldAt") ?? -1e9), heavy, motion);
  if (hold && decoration.allow("hit-hold", now, 12))
    sprite.setData("hitHoldAt", now).setData("hitHoldUntil", now + hold).setData("holdX", sprite.x).setData("holdY", sprite.y);
}
export const DAMAGE_NUMBER_MS = 500;
export const CRITICAL_NUMBER_MS = 650;
export const DAMAGE_NUMBER_CAP = 24;
export const DAMAGE_NUMBERS_PER_FRAME = 4;
/** A new hit on the same target within this gap joins its number; a number stops joining once it is this old. */
export const DAMAGE_MERGE_GAP_MS = 300;
export const DAMAGE_MERGE_SPAN_MS = 1200;
export const mergedNumberScale = (hits: number): number => 1 + Math.min(.5, .1 * Math.max(0, hits - 1));
export function damageNumberStyle(critical: boolean, big: boolean): { size: number; color: string; alpha: number } {
  return { size: critical ? 18 : big ? 14 : 10, color: critical ? "#ffdf53" : big ? "#ffffff" : "#aab7cc",
    alpha: critical || big ? 1 : .7 };
}

const OUTLINES: ReadonlySet<number> = new Set([PALETTE.outline, PALETTE.dark]);
/** A struck body turns white inside its own dark outline, so the flash keeps the figure's crisp shape instead of swelling into a
 *  blob. Every alpha, antialiased edges and transparent pixels included, is kept. */
export function whitenHitPixels(pixels: Uint8ClampedArray): void {
  for (let at = 0; at < pixels.length; at += 4)
    if (pixels[at + 3] && !OUTLINES.has(pixels[at] << 16 | pixels[at + 1] << 8 | pixels[at + 2])) pixels[at] = pixels[at + 1] = pixels[at + 2] = 255;
}

/** Render-only displacement: combat positions and paths never move. */
export function hitRecoil(age: number, critical = false): number {
  const duration = critical ? 180 : HIT_RECOIL_MS;
  return age >= 0 && age < duration ? (critical ? 5 : 3) * (1 - age / duration) ** 2 : 0;
}

export function hitFlash(now: number, startedAt: number, until: number, critical: boolean): { startedAt: number; until: number } {
  const start = now - until >= HIT_FLASH_MS ? now : startedAt;
  return { startedAt: start, until: Math.min(start + 133, Math.max(until, now + (critical ? 100 : HIT_FLASH_MS))) };
}

export function damageNumberFrame(age: number, critical: boolean, motion: boolean): { alpha: number; scale: number; rise: number } {
  const duration = critical ? CRITICAL_NUMBER_MS : DAMAGE_NUMBER_MS;
  return {
    alpha: Math.max(0, Math.min(1, (duration - age) / 200)),
    scale: motion ? 1 + (critical ? .45 : .25) * Math.max(0, 1 - age / (critical ? 117 : 83)) : 1,
    rise: motion ? Math.min(1, age / DAMAGE_NUMBER_MS) * 18 : 0,
  };
}

/** Slots are reused for the whole scene; a dense damage tick cannot allocate text objects. */
export class DamageNumbers {
  readonly slots = Array.from({ length: DAMAGE_NUMBER_CAP }, () => ({
    active: false, x: 0, y: 0, value: 0, critical: false, big: false, startedAt: 0, bumpedAt: 0, hits: 0, key: null as string | null,
  }));
  private admitted = 0;
  beginFrame(now: number): void {
    this.admitted = 0;
    for (const slot of this.slots)
      if (now - slot.bumpedAt >= (slot.critical ? CRITICAL_NUMBER_MS : DAMAGE_NUMBER_MS)) slot.active = false;
  }
  add(x: number, y: number, value: number, critical: boolean, now: number, key: string | null = null, big = false): number {
    if (value <= 0) return -1;
    const joined = key === null ? -1 : this.slots.findIndex(slot => slot.active && slot.key === key
      && now - slot.bumpedAt < DAMAGE_MERGE_GAP_MS && now - slot.startedAt < DAMAGE_MERGE_SPAN_MS);
    if (joined >= 0) {
      const slot = this.slots[joined];
      Object.assign(slot, { x, y, value: slot.value + value, critical: slot.critical || critical, big: slot.big || big, bumpedAt: now, hits: slot.hits + 1 });
      return joined;
    }
    if (this.admitted >= DAMAGE_NUMBERS_PER_FRAME) return -1;
    const index = this.slots.findIndex(slot => !slot.active);
    if (index < 0) return -1;
    Object.assign(this.slots[index], { active: true, x, y, value, critical, big, startedAt: now, bumpedAt: now, hits: 1, key });
    this.admitted++;
    return index;
  }
  clear(): void {
    for (const slot of this.slots) slot.active = false;
    this.admitted = 0;
  }
}
