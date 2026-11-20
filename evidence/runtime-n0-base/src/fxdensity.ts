/** Presentation-only effect density; the deterministic rules never import it. */
export const STORM = { calmUntil: 60, stormAt: 420, floor: .3 };
/** Share of the full effect load at this run time: calm for the first minute, rising smoothly to a storm by seven minutes. */
export function storm(time: number): number {
  const t = Math.min(1, Math.max(0, (time - STORM.calmUntil) / (STORM.stormAt - STORM.calmUntil)));
  return STORM.floor + (1 - STORM.floor) * t * t * (3 - 2 * t);
}
export const CAP = { min: 48, max: 60, start: 60, slow: 1000 / 57, fast: 1000 / 61 };
/** Ceiling on live cosmetic particles: it shrinks while frames run slower than 60 fps and regrows while there is headroom. */
export class ParticleCap {
  live = 0;
  private cap = CAP.start;
  private frame = 1000 / 60;
  sample(ms: number): number {
    this.frame += (Math.min(ms, 100) - this.frame) * .1;
    if (this.frame > CAP.slow) this.cap = Math.max(CAP.min, this.cap * .96);
    else if (this.frame < CAP.fast) this.cap = Math.min(CAP.max, this.cap + 3);
    return this.cap;
  }
  headroom(): number { return Math.min(1, this.cap / CAP.start); }
  grant(wanted: number, density: number): number {
    return Math.max(0, Math.min(Math.round(wanted * density), Math.floor(this.cap) - this.live));
  }
}
import type Phaser from "phaser";
import type { Effect } from "./rules";
import { LAYER, PALETTE } from "./presentation";
import type { DecorationBudget } from "./presentation";


/** Short directional contact chips and dark death debris share the existing live cap. */
export function emitContactParticles(context: {
  readonly scene: Phaser.Scene;
  readonly particles: ParticleCap;
  readonly decoration: DecorationBudget;
  readonly channels: { readonly motion: boolean; readonly flash: boolean };
}, effect: Effect): number {
  if (!context.channels.motion) return 0;
  const { scene, particles, decoration, channels } = context;
  const death = effect.kind === "kill", critical = Boolean(effect.critical);
  if (!death && !decoration.allow("contact-particles", scene.time.now, 12)) return 0;
  const wanted = death ? 4 : critical ? 10 : 6;
  const count = particles.grant(wanted - (!death && !channels.flash ? 2 : 0), 1);
  const heading = Math.atan2(effect.y - (effect.fromY ?? effect.y), effect.x - (effect.fromX ?? effect.x - 1));
  for (let i = 0; i < count; i++) {
    const part = i + (!death && !channels.flash ? 2 : 0);
    const angle = death ? part * Math.PI / 2 : heading - Math.PI / 4 + part / (wanted - 1) * Math.PI / 2;
    const duration = death ? 200 + part * 30 : critical ? 160 + part * 120 / 9 : 120 + part * 20;
    const reach = death ? 12 + part * 2 : (40 + part * 50 / (wanted - 1)) * duration / 1000;
    const side = death ? 3 : 1 + part % 2;
    const chip = scene.add.rectangle(effect.x, effect.y - 4, side, side, death ? PALETTE.outline : part < 2 ? PALETTE.white : PALETTE.gold)
      .setDepth(LAYER.impact + 11);
    particles.live++;
    chip.once("destroy", () => { scene.tweens.killTweensOf(chip); particles.live--; });
    scene.tweens.add({ targets: chip, x: chip.x + Math.cos(angle) * reach, y: chip.y + Math.sin(angle) * reach,
      alpha: 0, duration, onComplete: () => chip.destroy() });
  }
  return count;
}
