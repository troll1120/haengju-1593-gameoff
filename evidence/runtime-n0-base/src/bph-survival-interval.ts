import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { bphSurvivalPlan } from "./bph-survival";
import type { BphSurvivalSpawn } from "./bph-survival";
import type { BphWaveId, BphWaveInterval } from "./bph-waves";

const batches = new Map<BphWaveId, {
  readonly entries: readonly (readonly BphSurvivalSpawn[])[];
  readonly firstAt: Readonly<Record<string, number>>;
}>();

/** Project cadence onto a repeating grid, never onto the finite run deadline.
 * Wall-time batches still select their own roster and intensity. Count uses the
 * scaled denominator, preserving the first authored slot of each source batch.
 */
export function bphSurvivalRegularBetween(waveId: BphWaveId,
  step: { readonly through: number; readonly dt: number }, interval: BphWaveInterval): BphSurvivalSpawn[] {
  const due: BphSurvivalSpawn[] = [];
  if (step.dt <= 0) return due;
  const span = BPH_SURVIVAL_TABLE.batchSeconds, epsilon = 1e-9;
  let cached = batches.get(waveId);
  if (!cached) {
    const grouped: BphSurvivalSpawn[][] = Array.from({ length: BPH_SURVIVAL_TABLE.duration / span }, () => []);
    const firstAt: Record<string, number> = {};
    for (const entry of bphSurvivalPlan(waveId)) if (!entry.boss) {
      grouped[Math.floor(entry.at / span)].push(entry);
      firstAt[entry.profileId] ??= entry.at;
    }
    cached = { entries: grouped, firstAt }; batches.set(waveId, cached);
  }
  const all = cached.entries;
  const start = step.through - step.dt, projectedSpan = interval.through - interval.after;
  let wall = start;
  while (wall < step.through) {
    const batch = Math.min(all.length - 1, Math.floor((wall + epsilon) / span));
    const end = Math.min(step.through, (batch + 1) * span);
    const after = interval.after + (wall - start) / step.dt * projectedSpan;
    const through = interval.after + (end - start) / step.dt * projectedSpan;
    const base = all[batch], count = base.length * (interval.countMultiplier ?? 1);
    const first = span / (base.length + 1), duration = span - first;
    for (let cycle = Math.floor((after + epsilon) / span); cycle <= Math.floor((through + epsilon) / span); cycle++) {
      for (let index = 0; index < count; index++) {
        const at = cycle * span + first + index * duration / count;
        if (at > after + epsilon && at <= through + epsilon) {
          const gameAt = start + (at - interval.after) / projectedSpan * step.dt;
          // C4 keeps the E1 grid/count denominator but repeats only introduced profiles.
          // Empty slots before 3 seconds are discarded, never banked into a catch-up burst.
          const eligible = waveId === "WaveChapter4"
            ? base.filter(entry => cached.firstAt[entry.profileId] <= gameAt) : base;
          if (eligible.length) due.push({ ...eligible[index % eligible.length], at: gameAt });
        }
      }
    }
    wall = end;
  }
  return due;
}
