import type { BphSave } from "./bph-contract";
import { BPH_GENERALS } from "./bph-general-roster";
import type { BphGeneral } from "./bph-general-roster";
import { tr } from "./i18n";
import type { IconName } from "./icons";

export { BPH_GENERALS, BPH_GENERAL_CLASS } from "./bph-general-roster";
export type { BphGeneral } from "./bph-general-roster";
export type BphMilestones = { runs: number; bestSeconds: number; bossesReached: number; bossesKilled: number };
/** Combat objectives for commander unlocks. Gwon Yul is the zero-requirement starter. */
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
  readonly general: BphGeneral; readonly ratio: number;
  /** The visible form: a metric icon and one short condition line with the current/target count; the name stays hidden. */
  readonly icon: IconName; readonly line: string;
} | null {
  const index = general === undefined ? BPH_GENERALS.findIndex(name => !save.unlockedGenerals.includes(name))
    : BPH_GENERALS.indexOf(general);
  if (index < 0) return null;
  const gate = BPH_GENERAL_UNLOCKS[index], current = Math.floor(Math.min(gate.target, milestones[gate.metric]));
  const icons = { runs: "sword", bestSeconds: "hourglass", bossesReached: "skull", bossesKilled: "trophy" } as const;
  const lines: Record<keyof BphMilestones, (current: number, target: number) => string> = {
    runs: (current, target) => target === 0 ? tr`처음부터 사용 가능` : tr`전투 ${target}판 완료 (${current}/${target})`,
    bestSeconds: (current, target) => tr`한 판에서 ${target}초 버티기 (${current}/${target})`,
    bossesReached: (current, target) => tr`보스 ${target}단계까지 도달 (${current}/${target})`,
    bossesKilled: (current, target) => tr`보스 ${target}번 처치 (${current}/${target})`,
  };
  return { general: BPH_GENERALS[index], ratio: gate.target ? current / gate.target : 1,
    icon: icons[gate.metric], line: lines[gate.metric](current, gate.target) };
}
