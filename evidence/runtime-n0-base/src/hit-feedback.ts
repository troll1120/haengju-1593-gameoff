import { PALETTE } from "./presentation";

export const HIT_FLASH_MS = 67;
export const HIT_RECOIL_MS = 140;
export const DAMAGE_NUMBER_MS = 500;
export const CRITICAL_NUMBER_MS = 650;
export const DAMAGE_NUMBER_CAP = 24;
export const DAMAGE_NUMBERS_PER_FRAME = 4;

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
    active: false, x: 0, y: 0, value: 0, critical: false, startedAt: 0,
  }));
  private admitted = 0;
  beginFrame(now: number): void {
    this.admitted = 0;
    for (const slot of this.slots)
      if (now - slot.startedAt >= (slot.critical ? CRITICAL_NUMBER_MS : DAMAGE_NUMBER_MS)) slot.active = false;
  }
  add(x: number, y: number, value: number, critical: boolean, now: number): number {
    if (value <= 0 || this.admitted >= DAMAGE_NUMBERS_PER_FRAME) return -1;
    const index = this.slots.findIndex(slot => !slot.active);
    if (index < 0) return -1;
    Object.assign(this.slots[index], { active: true, x, y, value, critical, startedAt: now });
    this.admitted++;
    return index;
  }
  clear(): void {
    for (const slot of this.slots) slot.active = false;
    this.admitted = 0;
  }
}
