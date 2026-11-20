/** Body displacement supplements the available original cells. Most unit sheets only bob by one pixel; dedicated character sheets provide actual poses. */
import type { SoldierKind } from "./roster";

export type AttackPhase = { readonly windupProgress: number; readonly sinceReleaseMs: number; readonly windupMs?: number; readonly contactMs?: number; readonly recoveryMs?: number };
export const FRIENDLY_ATTACK: Record<SoldierKind | "general", { readonly pull: number; readonly release: number; readonly swing: number }> = {
  general: { pull: 4, release: 9, swing: 12 },
  spearman: { pull: 4, release: 14, swing: 8 },
  archer: { pull: 3, release: -3, swing: 0 },
  hwacha: { pull: 0, release: -8, swing: 0 },
  monk: { pull: 4, release: 7, swing: 22 },
  ming_cavalry: { pull: 3, release: 12, swing: 10 },
  panokseon: { pull: 0, release: -4, swing: 0 },
};
export const MOTION = { stride: 6, hop: 2, lean: 5, windBack: 5, lunge: 11, lungeMs: 170,
  spearContactMs: 67, spearRecoveryMs: 133, spearTrailMs: 83 };
/** Pixels a striker is displaced along its aim: drawn back through the wind-up, thrown forward at the blow, settling after it. Times are milliseconds since each began. */
export function strikeOffset(sinceWind: number, windFor: number, sinceBlow: number): number {
  if (sinceBlow >= 0 && sinceBlow < MOTION.lungeMs) return MOTION.lunge * (1 - sinceBlow / MOTION.lungeMs);
  if (sinceWind >= 0 && sinceWind < windFor) return -MOTION.windBack * sinceWind / windFor;
  return 0;
}
/** Steps taken after walking this many pixels; the body frame shown is the step's parity. */
export const stepsWalked = (gait: number, stride = MOTION.stride) => Math.floor(gait / stride);
/** Height of the hop inside the current step: nothing at each footfall, highest between two. */
export const stepHop = (gait: number, stride = MOTION.stride) => Math.abs(Math.sin(gait / stride * Math.PI)) * MOTION.hop;
export function friendlyStrikeOffset(kind: SoldierKind | "general", phase: AttackPhase): number {
  const motion = FRIENDLY_ATTACK[kind];
  if (kind === "spearman") {
    if (phase.sinceReleaseMs >= 0) {
      const recovery = Math.max(0, phase.sinceReleaseMs - MOTION.spearContactMs) / MOTION.spearRecoveryMs;
      return motion.release * Math.max(0, 1 - recovery) ** 2;
    }
    if (phase.windupProgress < 0) return 0;
    const remaining = (1 - phase.windupProgress) * (phase.windupMs ?? 100);
    if (remaining >= 100) return 0;
    return -motion.pull * Math.max(0, Math.min(1, 1 - remaining / 100));
  }
  if (phase.sinceReleaseMs >= 0 && phase.sinceReleaseMs < MOTION.lungeMs)
    return motion.release * (1 - phase.sinceReleaseMs / MOTION.lungeMs);
  return -motion.pull * Math.max(0, Math.min(1, phase.windupProgress));
}
