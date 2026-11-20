import type { BphClass, BphSave } from "./bph-contract";
import { tr } from "./i18n";

export const BPH_GENERALS = ["권율", "신립", "송상현", "황진", "김시민", "곽재우", "사명대사", "이순신"] as const;
export type BphGeneral = typeof BPH_GENERALS[number];
export const BPH_GENERAL_CLASS: Readonly<Record<BphGeneral, BphClass>> = {
  권율: "hwacha", 신립: "joseon_cavalry", 송상현: "archer", 황진: "spearman",
  김시민: "chongtong", 곽재우: "militia", 사명대사: "monk", 이순신: "panokseon",
};
export type BphMilestones = { runs: number; bestSeconds: number; bossesReached: number; bossesKilled: number };
/** Our p8 ordinal milestones, not claimed to be original hero unlock rules. */
export const BPH_GENERAL_UNLOCKS: readonly { readonly metric: keyof BphMilestones; readonly target: number }[] = [
  { metric: "runs", target: 0 }, { metric: "runs", target: 1 },
  { metric: "bestSeconds", target: 180 }, { metric: "bestSeconds", target: 240 },
  { metric: "bossesReached", target: 1 }, { metric: "bossesKilled", target: 1 },
  { metric: "bestSeconds", target: 300 }, { metric: "runs", target: 8 },
];
export function unlockBphGeneral(save: BphSave, milestones: BphMilestones): readonly BphGeneral[] {
  const unlocked = BPH_GENERALS.filter((general, index) => {
    const gate = BPH_GENERAL_UNLOCKS[index];
    return !save.unlockedGenerals.includes(general) && milestones[gate.metric] >= gate.target;
  });
  save.unlockedGenerals.push(...unlocked);
  return unlocked;
}
export function bphGeneralProgress(save: BphSave, milestones: BphMilestones, general?: BphGeneral): {
  readonly general: BphGeneral; readonly label: string; readonly ratio: number;
} | null {
  const index = general === undefined ? BPH_GENERALS.findIndex(name => !save.unlockedGenerals.includes(name))
    : BPH_GENERALS.indexOf(general);
  if (index < 0) return null;
  const gate = BPH_GENERAL_UNLOCKS[index], current = Math.min(gate.target, milestones[gate.metric]);
  const labels = { runs: "전투 완료", bestSeconds: "최고 생존(초)", bossesReached: "보스 도달", bossesKilled: "보스 처치" };
  return { general: BPH_GENERALS[index], label: tr`${labels[gate.metric]} ${Math.floor(current)}/${gate.target}`,
    ratio: gate.target ? current / gate.target : 1 };
}
