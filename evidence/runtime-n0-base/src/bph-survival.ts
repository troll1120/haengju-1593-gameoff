import { BPH_WAVES } from "./bph-data";
import { bphEnemyMapping } from "./bph-waves";
import type { BphSpawn, BphWaveId, BphWaveInterval } from "./bph-waves";
import { BPH_SURVIVAL_TABLE, bphSurvivalChapter } from "./bph-survival-data";
import type { Enemy, Run } from "./rules";

export type BphSurvivalSpawn = BphSpawn & {
  readonly boss: boolean;
  readonly final: boolean;
  readonly hp: number;
  readonly unitDamage: number;
  readonly castleDamage: number;
};
/** Mutable cursors belong to the run; immutable spawn plans are shared. */
export type BphSurvivalState = {
  cursor: number;
  nextDeparture: number;
  readonly damage: Record<number, { readonly unit: number; readonly castle: number }>;
  /** Allocated only after E1 changes cadence/count; the director owns this phase. */
  projection?: BphWaveInterval & { readonly tick: number };
};
const plans = new Map<BphWaveId, readonly BphSurvivalSpawn[]>();

export function bphSurvivalPlan(waveId: BphWaveId): readonly BphSurvivalSpawn[] {
  const previous = plans.get(waveId);
  if (previous) return previous;
  const chapter = bphSurvivalChapter(waveId);
  if (!chapter) throw new RangeError(`No survival chapter: ${waveId}`);
  const weights = new Map<string, number>();
  const introductions = new Map<string, number>();
  for (const burst of BPH_WAVES[waveId]) {
    if (burst.id && !bphEnemyMapping(burst.id).bossId) {
      weights.set(burst.id, (weights.get(burst.id) ?? 0) + burst.count);
      if (waveId === "WaveChapter4")
        introductions.set(burst.id, Math.min(introductions.get(burst.id) ?? burst.at, burst.at));
    }
  }
  const pool = [...weights].map(([id, weight]) => ({ id, weight, credit: 0, first: introductions.get(id) ?? 0 }));
  const plan: BphSurvivalSpawn[] = [];
  for (let start = 0; start < BPH_SURVIVAL_TABLE.duration; start += BPH_SURVIVAL_TABLE.batchSeconds) {
    const intensity = bphSurvivalIntensity(start);
    const count = waveId === "WaveChapter4" && start < BPH_SURVIVAL_TABLE.chapter4Opening.until
      ? BPH_SURVIVAL_TABLE.chapter4Opening.count : intensity.count;
    const slots = Array.from({ length: count }, (_, index): {
      at: number; introduction: typeof pool[number] | undefined;
    } => ({
      at: start + (index + 1) * BPH_SURVIVAL_TABLE.batchSeconds / (count + 1),
      introduction: undefined,
    }));
    // Introductions replace ordinary slots; they never add to the batch density.
    if (waveId === "WaveChapter4") {
      for (const entry of pool.filter(entry => entry.first >= start
        && entry.first < start + BPH_SURVIVAL_TABLE.batchSeconds).sort((a, b) => a.first - b.first)) {
        const slot = slots.filter(slot => !slot.introduction).reduce((best, slot) =>
          Math.abs(slot.at - entry.first) < Math.abs(best.at - entry.first) ? slot : best);
        slot.at = entry.first; slot.introduction = entry;
      }
      slots.sort((a, b) => a.at - b.at);
    }
    for (const slot of slots) {
      const eligible = waveId === "WaveChapter4" ? pool.filter(entry => entry.first <= slot.at) : pool;
      for (const entry of eligible) entry.credit += entry.weight;
      const selected = slot.introduction
        ?? eligible.reduce((best, entry) => entry.credit > best.credit ? entry : best);
      selected.credit -= eligible.reduce((sum, entry) => sum + entry.weight, 0);
      plan.push({ ...bphEnemyMapping(selected.id), profileId: selected.id, at: slot.at,
        boss: false, final: false, hp: chapter.hp * intensity.hp,
        unitDamage: chapter.unitDamage * intensity.unitDamage,
        castleDamage: chapter.castleDamage * intensity.castleDamage });
    }
  }
  for (const beat of BPH_SURVIVAL_TABLE.bosses) {
    const intensity = bphSurvivalIntensity(beat.at);
    plan.push({ ...bphEnemyMapping(chapter.boss), profileId: chapter.boss, at: beat.at,
      boss: true, final: beat.final, hp: chapter.hp * intensity.hp * beat.hp,
      unitDamage: chapter.unitDamage * intensity.unitDamage,
      castleDamage: chapter.castleDamage * intensity.castleDamage });
  }
  plan.sort((a, b) => a.at - b.at);
  plans.set(waveId, plan);
  return plan;
}
export function bphSurvivalIntensity(time: number) {
  let index = 0;
  while (index + 1 < BPH_SURVIVAL_TABLE.intensity.length && time >= BPH_SURVIVAL_TABLE.intensity[index + 1].at) index++;
  return BPH_SURVIVAL_TABLE.intensity[index];
}
export function createBphSurvival(waveId: BphWaveId): BphSurvivalState | null {
  return bphSurvivalChapter(waveId)
    ? { cursor: 0, nextDeparture: BPH_SURVIVAL_TABLE.batchSeconds, damage: {} } : null;
}
/** Combat consumers use the spawn-time multiplier, never the current player's N. */
export function bphSurvivalDamageMultiplier(run: Run, enemy: Enemy, target: "unit" | "castle"): number {
  return run.bph?.survival?.damage[enemy.id]?.[target] ?? 1;
}
export function bphSurvivalStep(run: Run, dt: number): number {
  return run.bph?.survival ? Math.min(dt, Math.max(0, BPH_SURVIVAL_TABLE.duration - run.time)) : dt;
}
export function bphSurvivalWon(run: Run): boolean {
  return run.bph?.survival ? run.time >= BPH_SURVIVAL_TABLE.duration
    : run.metrics.bosses.length > 0 && run.metrics.bosses.every(boss => boss.fallen !== null) && !run.enemies.length;
}
