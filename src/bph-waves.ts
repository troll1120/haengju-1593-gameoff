import { BPH_ENEMY_MAP, BPH_WAVES } from "./bph-data";
import type { BphEnemyMapping } from "./bph-contract";

export type BphWaveId = keyof typeof BPH_WAVES;
export type BphSpawn = BphEnemyMapping & { readonly profileId: string; readonly at: number };
export type BphWaveInterval = {
  readonly after: number; readonly through: number;
  /** Present for modified cadence/count; authored E1 count factors are integers. */
  readonly countMultiplier?: number;
};
const VARIANT_BASE: Readonly<Record<string, string>> = {
  Boss3_Witch2: "Boss3_Witch",
  Monster4_Sentinel2: "Monster4_Sentinel",
  Monster4_Bandit2: "Monster4_Bandit",
  Monster4_Minorat2: "Monster4_Minorat1",
};
export const bphEnemyMapping = (profileId: string): BphEnemyMapping =>
  BPH_ENEMY_MAP[bphEnemyBaseProfile(profileId)];
export const bphEnemyBaseProfile = (profileId: string): string => VARIANT_BASE[profileId] ?? profileId;
/** Battle and codex use the same appearance identity; variants retain their stats ID. */
export function bphSpawnsBetween(waveId: BphWaveId, interval: BphWaveInterval): BphSpawn[] {
  const spawns: BphSpawn[] = [];
  // Contiguous projected clock intervals share this boundary tolerance.
  // The unmodified W0 caller retains its exact comparisons and output.
  const epsilon = interval.countMultiplier === undefined ? 0 : 1e-9;
  for (const burst of BPH_WAVES[waveId]) {
    if (!burst.id) continue; // Egg entries are separate objects, not MonsterDefinitions.
    const appearance = bphEnemyMapping(burst.id);
    const count = burst.count * (interval.countMultiplier ?? 1);
    for (let index = 0; index < count; index++) {
      const at = burst.at + index * burst.duration / count;
      if (at > interval.after + epsilon && at <= interval.through + epsilon)
        spawns.push({ ...appearance, profileId: burst.id, at });
    }
  }
  return spawns.sort((a, b) => a.at - b.at);
}
