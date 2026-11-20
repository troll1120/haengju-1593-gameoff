import type { BphWaveId } from "./bph-waves";

/** Approved 600-second gameplay contract; balance changes belong in this table. */
export const BPH_SURVIVAL_TABLE = {
  version: 1,
  duration: 600,
  batchSeconds: 30,
  supplySeconds: 15,
  generalHpScale: 1 / 60,
  chapter4Opening: { until: 60, count: 12 },
  intensity: [
    { at: 0, count: 24, hp: 1, unitDamage: 1, castleDamage: 1 },
    { at: 60, count: 36, hp: 1.15, unitDamage: 1.05, castleDamage: 1.05 },
    { at: 180, count: 54, hp: 1.5, unitDamage: 1.2, castleDamage: 1.2 },
    { at: 360, count: 72, hp: 2, unitDamage: 1.4, castleDamage: 1.4 },
    { at: 540, count: 90, hp: 2.6, unitDamage: 1.6, castleDamage: 1.6 },
  ],
  bosses: [
    { at: 180, hp: .35, final: false },
    { at: 360, hp: .6, final: false },
    { at: 540, hp: 1, final: true },
  ],
} as const;

export type BphSurvivalChapter = {
  readonly boss: string;
  readonly hp: number;
  readonly unitDamage: number;
  readonly castleDamage: number;
};
export function bphSurvivalChapter(waveId: BphWaveId): BphSurvivalChapter | null {
  switch (waveId) {
    case "WaveChapter1": return { boss: "Boss1_Apogre", hp: 1, unitDamage: 1, castleDamage: 1 };
    case "WaveChapter2": return { boss: "Boss2_Beast", hp: 1, unitDamage: 1, castleDamage: 1 };
    case "WaveChapter3": return { boss: "Boss3_Witch", hp: 1, unitDamage: 1, castleDamage: 1 };
    case "WaveChapter4": return { boss: "Monster4_Minorat2", hp: 1, unitDamage: 1, castleDamage: 1 };
    default: return null;
  }
}
